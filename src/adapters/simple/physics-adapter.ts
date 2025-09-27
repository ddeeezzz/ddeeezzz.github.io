/**
 * 简易物理适配器：基于二维圆形近似实现球射线检测。
 * - 监听 arena 事件缓存障碍、边界与单位的碰撞信息。
 * - 对外暴露 sphereCast，为移动、战斗等系统提供命中判定。
 */
import type { DomainEventBus } from '@domain/core/event-bus' // 引入：领域事件总线
import type { PhysicsPort, SphereCastHit } from '@ports/physics' // 引入：物理端口契约

interface CachedObstacle { id: string; x: number; z: number; radius: number }
interface ArenaBounds { minX: number; maxX: number; minZ: number; maxZ: number }
const OBSTACLE_UNIFIED_SCALE = 2.0 // 统一障碍物缩放（物理层使用同一半径近似）\ninterface UnitCollider { id: string; x: number; z: number; radius: number; kind: 'teamA' | 'teamB' }

const EPS = 1e-6
const UNIT_RADIUS = 0.5

export function createSimplePhysicsAdapter(bus: DomainEventBus): PhysicsPort { // 导出：物理适配器工厂
  const obstacles: CachedObstacle[] = []
  const units: UnitCollider[] = []
  let bounds: ArenaBounds | null = null

  bus.on('arena/obstacles', (e) => {
    const list = e.payload as { x: number; z: number; scale: number }[] | undefined
    obstacles.length = 0
    if (!Array.isArray(list)) return
    list.forEach((item, i) => {
      const id = `obstacle:${i}`
      // 说明：为保持现有碰撞直径约定，这里仍以 scale 作为半径近似。
      obstacles.push({ id, x: item.x, z: item.z, radius: OBSTACLE_UNIFIED_SCALE })
    })
  })

  bus.on('arena/bounds', (e) => {
    const payload = e.payload as { minX: number; maxX: number; minZ: number; maxZ: number } | undefined
    if (!payload) return
    bounds = payload
  })

  bus.on('arena/spawn-points', (e) => {
    const payload = e.payload as {
      A?: { id?: string; x: number; z: number }[]
      B?: { id?: string; x: number; z: number }[]
    } | undefined
    units.length = 0
    if (!payload) return
    payload.A?.forEach((u, index) => {
      const id = u.id ?? `teamA:${index}`
      units.push({ id, x: u.x, z: u.z, radius: UNIT_RADIUS, kind: 'teamA' })
    })
    payload.B?.forEach((u, index) => {
      // 变更：注册玩家碰撞体（索引 0 → 'player:1'），供投射物命中；
      // 相机缩臂将显式忽略单位命中，避免相机被玩家/单位挡住。
      const resolvedId = u.id ?? (index === 0 ? 'player:1' : `teamB:${index - 1}`)
      units.push({ id: resolvedId, x: u.x, z: u.z, radius: UNIT_RADIUS, kind: 'teamB' })
    })
  })

  bus.on('entity/destroyed', (e) => {
    const payload = e.payload as { id?: string } | undefined
    if (!payload?.id) return
    const idx = units.findIndex((u) => u.id === payload.id)
    if (idx >= 0) {
      // console.log([物理] 监听到实体销毁事件，移除碰撞体: )
      units.splice(idx, 1)
    }
    // 额外：若为障碍物，同步移除障碍碰撞体
    if (payload.id.startsWith('obstacle:')) {
      const oi = obstacles.findIndex((o) => o.id === payload.id)
      if (oi >= 0) {
        // console.log('[物理] 已移除障碍碰撞体', { id: payload.id })
        obstacles.splice(oi, 1)
      }
    }
  })

  bus.on('arena/reset', () => {
    units.length = 0
    obstacles.length = 0
  })

  bus.on('respawn/complete', (e) => {
    const payload = e.payload as { unitId?: string; teamId?: string; position?: { x: number; z: number } } | undefined
    if (!payload?.unitId || !payload.teamId || !payload.position) return
    const kind = payload.teamId === 'teamA' ? 'teamA' : payload.teamId === 'teamB' ? 'teamB' : undefined
    if (!kind) return
    const existingIndex = units.findIndex((u) => u.id === payload.unitId)
    if (existingIndex >= 0) units.splice(existingIndex, 1)
    const [px, pz] = projectWithinBounds(payload.position.x, payload.position.z)
    units.push({ id: payload.unitId, x: px, z: pz, radius: UNIT_RADIUS, kind })
    // console.log('[物理] 重生单位已注册碰撞体', { id: payload.unitId, kind, position: { x: px, z: pz } })
  })

  // 订阅单位位移变更：用于动态更新碰撞体位置（供投射物命中检测）
  bus.on('unit/transform', (e) => {
    const p = e.payload as { id?: string; teamId?: string; position?: { x: number; z: number } } | undefined
    if (!p?.id || !p.position) return
    const it = units.find((u) => u.id === p.id)
    if (it) {
      it.x = p.position.x
      it.z = p.position.z
    }
  })

  function projectWithinBounds(px: number, pz: number): [number, number] {
    if (!bounds) return [px, pz]
    const x = Math.min(bounds.maxX, Math.max(bounds.minX, px))
    const z = Math.min(bounds.maxZ, Math.max(bounds.minZ, pz))
    return [x, z]
  }

  function sphereCast(origin: [number, number, number], dir: [number, number, number], radius: number, maxDist: number): SphereCastHit {
    const len = Math.hypot(dir[0], dir[1], dir[2])
    if (len <= EPS || maxDist <= 0) {
      return { hit: false, distance: maxDist }
    }

    const dx = dir[0] / len
    const dy = dir[1] / len
    const dz = dir[2] / len

    let best = maxDist
    let bestPoint: [number, number, number] | undefined
    let bestNormal: [number, number, number] | undefined
    let bestKind: string | undefined
    let bestId: string | undefined

    const testCircle = (cx: number, cz: number, bubble: number, kind: string, id?: string) => {
      const ox = origin[0] - cx
      const oz = origin[2] - cz
      const a = dx * dx + dz * dz
      if (a <= EPS) return
      const b = 2 * (ox * dx + oz * dz)
      const c = ox * ox + oz * oz - bubble * bubble
      const disc = b * b - 4 * a * c
      if (disc < 0) return
      const sqrtD = Math.sqrt(disc)
      let t = (-b - sqrtD) / (2 * a)
      if (t < 0) t = (-b + sqrtD) / (2 * a)
      if (t < 0 || t > best || t > maxDist) return
      const px = origin[0] + dx * t
      const py = origin[1] + dy * t
      const pz = origin[2] + dz * t
      const nx = px - cx
      const nz = pz - cz
      const nLen = Math.hypot(nx, nz) || 1
      best = t
      bestPoint = [px, py, pz]
      bestNormal = [nx / nLen, 0, nz / nLen]
      bestKind = kind
      bestId = id
    }

    for (const obstacle of obstacles) {
      testCircle(obstacle.x, obstacle.z, obstacle.radius + radius, 'obstacle', obstacle.id)
    }

    for (const unit of units) {
      testCircle(unit.x, unit.z, unit.radius + radius, unit.kind, unit.id)
    }

    if (best < maxDist - EPS) {
      if (bounds) {
        const [bx, bz] = projectWithinBounds(origin[0] + dx * best, origin[2] + dz * best)
        if (Math.abs(bx - (origin[0] + dx * best)) > EPS || Math.abs(bz - (origin[2] + dz * best)) > EPS) {
          bestPoint = [bx, origin[1] + dy * best, bz]
          const nx = bx - origin[0]
          const nz = bz - origin[2]
          const nLen = Math.hypot(nx, nz) || 1
          bestNormal = [nx / nLen, 0, nz / nLen]
          bestKind = 'bounds'
          bestId = 'bounds'
        }
      }
      return {
        hit: true,
        distance: Math.max(0, best),
        point: bestPoint,
        normal: bestNormal,
        objectId: bestId,
        objectKind: bestKind
      }
    }

    return { hit: false, distance: maxDist }
  }

  return { sphereCast }
}


