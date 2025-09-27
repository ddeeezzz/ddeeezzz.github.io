/**
 * 系统：玩家移动（相机点击 + WASD 控制）
 * - 将输入映射到相机前/右方向
 * - 应用加速度与阻尼限制最大速度
 * - 输出 Transform 并广播给渲染层
 */
// 引入世界接口：用于读取事件与输入
import type { System, World } from '@domain/core/world' // 引入：系统与世界类型
// 引入相机状态：用于地面拾取
import type { CameraState } from '@ports/render' // 引入：相机状态类型
// 引入组件：Transform 与 Velocity
import type { Transform } from '@domain/components/transform' // 引入：变换组件类型
import { createTransform } from '@domain/components/transform' // 引入：变换组件工厂
import type { Velocity } from '@domain/components/velocity' // 引入：速度组件类型
import { createVelocity } from '@domain/components/velocity' // 引入：速度组件工厂

/**
 * 移动配置：最大速度 / 加速度 / 阻尼时间常数
 */
export interface MovementConfig { // 导出：移动配置
  maxSpeed: number
  acceleration: number
  dampingTau: number
}

/** 玩家与障碍碰撞的近似半径（米） */
export const PLAYER_COLLISION_RADIUS = 0.5 // 导出：玩家碰撞半径，供测试使用

const EPS = 1e-6
const COLLISION_ITERATIONS = 4

/** 数学工具：长度计算与限制 */
function len2(x: number, z: number) { return Math.hypot(x, z) }
function clampLen(x: number, z: number, max: number) {
  const l = len2(x, z)
  if (l <= max || l === 0) return { x, z }
  const s = max / l
  return { x: x * s, z: z * s }
}
function moveTowards(x: number, target: number, maxDelta: number) {
  const d = target - x
  if (Math.abs(d) <= maxDelta) return target
  return x + Math.sign(d) * maxDelta
}

interface BoundsBox { minX: number; maxX: number; minZ: number; maxZ: number }
// 通用的圆形碰撞体接口
interface Collider {
  x: number
  z: number
  radius: number
}

interface TeamUnit {
  id?: string
  x: number
  z: number
}

function resolveDisplacement(
  startX: number,
  startZ: number,
  vel: Velocity,
  dt: number,
  colliders: Collider[],
  bounds: BoundsBox | null
) {
  if (dt <= 0) return { x: startX, z: startZ }
  let x = startX + vel.vx * dt
  let z = startZ + vel.vz * dt

  for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
    let collided = false
    for (const c of colliders) {
      const dx = x - c.x
      const dz = z - c.z
      const minDist = c.radius + PLAYER_COLLISION_RADIUS // 障碍物半径 + 玩家半径
      const dist = Math.hypot(dx, dz)
      if (dist >= minDist) continue
      let nx: number
      let nz: number
      if (dist > EPS) {
        nx = dx / dist
        nz = dz / dist
      } else {
        const velLen = len2(vel.vx, vel.vz)
        if (velLen > EPS) {
          nx = -vel.vx / velLen
          nz = -vel.vz / velLen
        } else {
          nx = 1
          nz = 0
        }
      }
      const overlap = minDist - dist
      x += nx * overlap
      z += nz * overlap
      const vn = vel.vx * nx + vel.vz * nz
      if (vn < 0) {
        vel.vx -= vn * nx
        vel.vz -= vn * nz
      }
      collided = true
    }
    if (!collided) break
  }

  if (bounds) {
    const minX = Math.min(bounds.minX, bounds.maxX) + PLAYER_COLLISION_RADIUS
    const maxX = Math.max(bounds.minX, bounds.maxX) - PLAYER_COLLISION_RADIUS
    const minZ = Math.min(bounds.minZ, bounds.maxZ) + PLAYER_COLLISION_RADIUS
    const maxZ = Math.max(bounds.minZ, bounds.maxZ) - PLAYER_COLLISION_RADIUS
    if (x < minX) {
      x = minX
      if (vel.vx < 0) vel.vx = 0
    } else if (x > maxX) {
      x = maxX
      if (vel.vx > 0) vel.vx = 0
    }
    if (z < minZ) {
      z = minZ
      if (vel.vz < 0) vel.vz = 0
    } else if (z > maxZ) {
      z = maxZ
      if (vel.vz > 0) vel.vz = 0
    }
  }

  return { x, z }
}

/**
 * 创建玩家移动系统
 * 参数：cfg 移动配置；initial 可选初始位置
 */
export function movementSystem(cfg: MovementConfig, initial?: { x?: number; z?: number }): System { // 导出：玩家移动系统
  console.log('[移动] 玩家移动系统已创建')
  const tf: Transform = createTransform(initial?.x ?? 0, 0, initial?.z ?? 0)
  const vel: Velocity = createVelocity()

  let cam: CameraState | null = null
  let target: { x: number; z: number } | null = null
  let obstacles: { id: string; x: number; z: number; scale: number }[] = [] // 缓存：障碍列表（含 id，便于动态移除）
  let teamA: TeamUnit[] = []
  let teamB: TeamUnit[] = []
  let bounds: BoundsBox | null = null
  // 状态：玩家是否死亡（死亡时禁止一切移动与变换广播）
  let isDead = false

  const onCam = (e: { type: string; payload?: unknown }) => {
    if (!e || e.type !== 'camera/state') return
    cam = e.payload as CameraState
  }
  const onPlayerSpawn = (e: { type: string; payload?: unknown }) => {
    if (!e || e.type !== 'player/spawn') return
    const p = e.payload as { x: number; z: number } | undefined
    if (p) {
      // player/spawn 被视为复活事件，解除死亡态
      isDead = false
      tf.position.x = p.x
      tf.position.z = p.z
      vel.vx = 0
      vel.vz = 0
      target = null
      // console.log(`[移动] 玩家生成于 (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`) // 调试日志：按需已注释
    }
  }
  const onObstacles = (e: { type: string; payload?: unknown }) => {
    if (!e || e.type !== 'arena/obstacles') return
    const list = e.payload as { x: number; z: number; scale: number }[] | undefined
    obstacles = Array.isArray(list) ? list.map((o, i) => ({ id: `obstacle:${i}`, x: o.x, z: o.z, scale: o.scale })) : []
  }
  const onBounds = (e: { type: string; payload?: unknown }) => {
    if (!e || e.type !== 'arena/bounds') return
    const payload = e.payload as BoundsBox | undefined
    bounds = payload ?? null
  }
  const onSpawnPoints = (e: { type: string; payload?: unknown }) => {
    if (!e || e.type !== 'arena/spawn-points') return
    const p = e.payload as { A?: { id?: string; x: number; z: number }[]; B?: { id?: string; x: number; z: number }[] }
    if (!p) return
    teamA = (p.A ?? []).map((unit) => ({ id: unit.id, x: unit.x, z: unit.z }))
    teamB = (p.B ?? []).map((unit) => ({ id: unit.id, x: unit.x, z: unit.z }))
  }

  const onEnemyRemoved = (e: { type: string; payload?: unknown }) => {
    if (!e || e.type !== 'combat/enemy-removed') return
    const payload = e.payload as { id?: string; x?: number; z?: number } | undefined
    if (!payload) return
    if (payload.id) {
      teamA = teamA.filter((unit) => unit.id !== payload.id)
    } else if (typeof payload.x === 'number' && typeof payload.z === 'number') {
      teamA = teamA.filter((unit) => Math.hypot(unit.x - payload.x!, unit.z - payload.z!) > 1e-3)
    }
  }

  const onRespawnComplete = (e: { type: string; payload?: unknown }) => {
    if (!e || e.type !== 'respawn/complete') return
    const payload = e.payload as { unitId?: string; teamId?: string; position?: { x: number; z: number } }
    if (!payload?.unitId || payload.teamId !== 'teamA' || !payload.position) return
    const existing = teamA.find((unit) => unit.id === payload.unitId)
    if (existing) {
      existing.x = payload.position.x
      existing.z = payload.position.z
    } else {
      teamA.push({ id: payload.unitId, x: payload.position.x, z: payload.position.z })
    }
    // console.log('[移动] 敌人复活，更新碰撞缓存', { id: payload.unitId, position: payload.position })
  }
  // 监听：玩家死亡/复活，切换移动开关
  const onEntityDestroyed = (e: { type: string; payload?: unknown }) => {
    if (!e || e.type !== 'entity/destroyed') return
    const p = e.payload as { id?: string } | undefined
    if (p?.id === 'player:1') {
      isDead = true
      target = null
      vel.vx = 0
      vel.vz = 0
      console.log('[移动] 玩家已死亡，停止并忽略移动输入')
      return
    }
    // 新增：障碍销毁时同步移除本地碰撞缓存，避免留下“隐形墙”
    if (p?.id && p.id.startsWith('obstacle:')) {
      const before = obstacles.length
      obstacles = obstacles.filter((o) => o.id !== p.id)
      if (before !== obstacles.length) {
        // console.log('[移动] 已移除障碍碰撞体（movement 缓存）', { id: p.id })
      }
    }
  }
  const onPlayerRespawn = (e: { type: string; payload?: unknown }) => {
    if (!e || e.type !== 'respawn/complete') return
    const p = e.payload as { unitId?: string } | undefined
    if (p?.unitId === 'player:1') {
      isDead = false
      console.log('[移动] 玩家已复活，恢复移动逻辑')
    }
  }

  function update(dt: number, world: World) {
    if (!(update as { _sub?: unknown })._sub) {
      ;(update as { _sub?: unknown })._sub = world.bus.on('camera/state', onCam)
      ;(update as { _subSpawn?: unknown })._subSpawn = world.bus.on('player/spawn', onPlayerSpawn)
      ;(update as { _subObs?: unknown })._subObs = world.bus.on('arena/obstacles', onObstacles)
      ;(update as { _subBounds?: unknown })._subBounds = world.bus.on('arena/bounds', onBounds)
      ;(update as { _subSpawns?: unknown })._subSpawns = world.bus.on('arena/spawn-points', onSpawnPoints)
      ;(update as { _subEnemyRemoved?: unknown })._subEnemyRemoved = world.bus.on('combat/enemy-removed', onEnemyRemoved)
      ;(update as { _subRespawnComplete?: unknown })._subRespawnComplete = world.bus.on('respawn/complete', onRespawnComplete)
      ;(update as { _subDead?: unknown })._subDead = world.bus.on('entity/destroyed', onEntityDestroyed)
      ;(update as { _subAlive?: unknown })._subAlive = world.bus.on('respawn/complete', onPlayerRespawn)
    }

    // 若玩家已死亡：跳过输入与运动，保持静止且不广播位姿
    if (isDead) {
      // 确保速度归零，避免残余速度导致复活位姿突变
      vel.vx = 0
      vel.vz = 0
      world.ports.input?.resetFrameDeltas?.()
      return
    }

    const input = world.ports.input
    const state = input?.getState()
    const ax = state?.axes.x ?? 0
    const ay = state?.axes.y ?? 0

    if (state?.lastClick && state.lastClick.button === 0) {
      if (!world.ports.render?.pick) {
        console.warn('[移动] 渲染端口不支持 pick 操作，忽略点击。')
      } else {
        const pickResult = world.ports.render.pick(state.lastClick.xNdc, state.lastClick.yNdc)

        if (pickResult) {
          const { objectKind, point } = pickResult
          if (objectKind !== 'ground') {
            console.log(`[移动] 点击位置位于 ${objectKind} 上，忽略移动请求`)
            world.bus.emit({ type: 'ui/ground-click', payload: { x: point.x, z: point.z, color: 0xff0000 } })
          } else {
            target = { x: point.x, z: point.z }
            console.log(`[移动] 点击移动目标已更新 (${point.x.toFixed(2)}, ${point.z.toFixed(2)})`)
            world.bus.emit({ type: 'ui/ground-click', payload: { x: point.x, z: point.z } })
          }
        } else {
          console.warn('[移动] 点击射线未命中任何物体。')
        }
      }
    }

    const cy = Math.cos(cam?.yaw ?? 0)
    const sy = Math.sin(cam?.yaw ?? 0)
    const fx = cy
    const fz = sy
    const rx = -sy
    const rz = cy

    let desiredVx = 0
    let desiredVz = 0

    if (ax !== 0 || ay !== 0) {
      if (target) {
        console.log('[移动] 检测到键盘输入，取消点击移动目标')
        world.bus.emit({ type: 'ui/ground-clear' })
      }
      target = null
      let dx = rx * ax + fx * ay
      let dz = rz * ax + fz * ay
      const cl = clampLen(dx, dz, 1)
      dx = cl.x
      dz = cl.z
      desiredVx = dx * cfg.maxSpeed
      desiredVz = dz * cfg.maxSpeed
    } else if (target) {
      const tx = target.x - tf.position.x
      const tz = target.z - tf.position.z
      const l = Math.hypot(tx, tz)
      if (l < 0.1) {
        target = null
        console.log('[移动] 已到达点击目标，停止点击移动')
        world.bus.emit({ type: 'ui/ground-clear' })
      } else {
        desiredVx = (tx / l) * cfg.maxSpeed
        desiredVz = (tz / l) * cfg.maxSpeed
      }
    }

    const maxDelta = cfg.acceleration * dt
    vel.vx = moveTowards(vel.vx, desiredVx, maxDelta)
    vel.vz = moveTowards(vel.vz, desiredVz, maxDelta)

    if (ax === 0 && ay === 0 && cfg.dampingTau > 0) {
      const a = 1 - Math.exp(-dt / cfg.dampingTau)
      vel.vx += (0 - vel.vx) * a
      vel.vz += (0 - vel.vz) * a
    }

    const prevX = tf.position.x
    const prevZ = tf.position.z
    if (dt > 0) {
      // 聚合所有碰撞体
      const allColliders: Collider[] = []
      obstacles.forEach(o => allColliders.push({ x: o.x, z: o.z, radius: o.scale * 0.5 }))
      const unitRadius = PLAYER_COLLISION_RADIUS
      teamA.forEach(u => allColliders.push({ x: u.x, z: u.z, radius: unitRadius }))
      // 排除玩家自身（B队第一个）
      teamB.slice(1).forEach(u => allColliders.push({ x: u.x, z: u.z, radius: unitRadius }))

      const resolved = resolveDisplacement(tf.position.x, tf.position.z, vel, dt, allColliders, bounds)
      tf.position.x = resolved.x
      tf.position.z = resolved.z
      const actualDx = tf.position.x - prevX
      const actualDz = tf.position.z - prevZ
      vel.vx = actualDx / dt
      vel.vz = actualDz / dt
    }

    if (len2(vel.vx, vel.vz) > 1e-6) {
      tf.rotationY = Math.atan2(vel.vz, vel.vx)
    }

    // 广播玩家位姿（供渲染/相机等使用）
    world.bus.emit({ type: 'entity/player/transform', payload: { ...tf } })
    // 同步广播单位位姿，确保物理适配器与自动瞄准服务跟踪到玩家位置
    world.bus.emit({ type: 'unit/transform', payload: { id: 'player:1', teamId: 'teamB', position: { x: tf.position.x, z: tf.position.z } } })
    // 注意：输入逐帧清理统一由 frameResetSystem 执行，避免过早清理导致其他系统（如战斗）读取不到点击事件
  }

  return { name: 'Movement', update }
}
