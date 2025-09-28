/**
 * 系统：战斗（平A 投射物）
 * - 按键 P 触发一次发射，沿定向发出短程投射物。
 * - 命中任何单位：
 *   - 敌人（teamA）：每次命中 -50 HP；HP≤0 时判定击败并广播。
 *   - 友军（teamB）：允许友伤，每次命中 -50 HP；HP≤0 时销毁实体。
 * - 所有投射物命中或到达最大射程后即刻散灭，并清理渲染实体。
 */
import type { System, World } from '@domain/core/world' // 引入：系统与世界类型
import { PLAYER_COLLISION_RADIUS } from '@domain/systems/movement' // 引入：玩家碰撞半径
import { HpController } from '@domain/services/hp-controller' // 引入：HP 控制器服务
import { AutoAimController } from '@domain/services/auto-aim-controller' // 引入：自动瞄准控制器
import { ObstacleHpController } from '@domain/services/obstacle-hp-controller' // 引入：障碍物 HP 控制器

interface UnitState { // 本地缓存：单位的基础信息
  id: string
  x: number
  z: number
}

type TeamId = 'teamA' | 'teamB'

// 射手信息：用于标注光球来源（玩家/友军/敌人）
interface Shooter { // 本地类型：射手标识
  id: string
  teamId: TeamId
  origin?: { x: number; z: number }
}

interface ProjectileState { // 投射物状态
  id: string
  x: number
  z: number
  dirX: number
  dirZ: number
  travelled: number
  ownerId: string
  ownerTeamId: TeamId
}

const MAX_RANGE = 4 // 投射物最大射程（米）
const PROJECTILE_SPEED = 10 // 投射物速度（米/秒）
const FIRE_KEY = 'MouseRight' // 开火按键：右键
const PLAYER_ID = 'player:1' // 玩家实体 ID（自伤后续可用）
const PLAYER_TEAM: TeamId = 'teamB' // 玩家所属队伍（按约定固定为 teamB）
const EPS = 1e-4 // 极小值
const PROJECTILE_RADIUS = 0.15 // 投射物半径
const DAMAGE_PER_HIT = 50 // 每次命中伤害
const FRIENDLY_BYPASS_OFFSET = 0.05 // 友军命中后的最小前移距离
const MAX_FRIENDLY_BYPASS_PER_FRAME = 12 // 单帧内允许忽略友军的上限次数，防止死循环

/**
 * 创建战斗系统
 * 返回：System — 注册后监听输入/物理/渲染等端口并推进战斗逻辑
 */
export function combatSystem(): System { // 导出：战斗系统供装配阶段使用
  console.log('[战斗] 战斗系统已初始化')

  let nextProjectileId = 0
  const projectiles = new Map<string, ProjectileState>()
  const enemies = new Map<string, UnitState>()
  const allies = new Map<string, UnitState>()
  let playerPos: { x: number; y: number; z: number } | null = null
  let playerRotY = 0
  let fireLatch = false
  let lastCameraYaw = 0
  let currentMoveDir: { x: number; z: number } | null = null
  let lastMoveDir: { x: number; z: number } | null = null
  let arenaReady = false
  // 状态：玩家是否存活；死亡时禁用键盘开火与玩家作为射手的 combat/fire
  let playerAlive = true

  // HP 服务实例（默认 HP=100）
  let hp: HpController | null = null
  let autoAim: AutoAimController | null = null
  let obHp: ObstacleHpController | null = null
  // 友军免伤与自伤关闭（按当前需求）
  const allowFriendlyFire = false
  const allowSelfDamage = false

  // —— 渲染相关工具 ——
  const ensureProjectileVisual = (world: World, proj: ProjectileState) => {
    const render: any = world.ports.render
    if (!render?.ensureEntity || !render?.applyEntity) return
    render.ensureEntity(proj.id, 'projectile')
    render.applyEntity(proj.id, {
      position: { x: proj.x, y: 1, z: proj.z },
      rotationY: Math.atan2(proj.dirZ, proj.dirX)
    })
  }

  const updateProjectileVisual = (world: World, proj: ProjectileState) => {
    const render: any = world.ports.render
    if (!render?.applyEntity) return
    render.applyEntity(proj.id, {
      position: { x: proj.x, y: 1, z: proj.z },
      rotationY: Math.atan2(proj.dirZ, proj.dirX)
    })
  }

  const destroyVisual = (world: World, id: string) => {
    const render: any = world.ports.render
    if (render?.removeEntity) render.removeEntity(id)
  }

  const resetState = (world: World) => {
    for (const proj of projectiles.values()) destroyVisual(world, proj.id)
    projectiles.clear()
    enemies.clear()
    allies.clear()
    playerPos = null
    currentMoveDir = null
    lastMoveDir = null
    arenaReady = false
  }

  const fireProjectile = (world: World, direction: { x: number; z: number }, shooter: Shooter) => {
    // 决定起点：若事件提供 origin 则使用，否则玩家当前位置为起点
    if (!shooter?.origin && !playerPos) {
      console.warn('[战斗] 缺少起点位置，无法发射投射物')
      return
    }
    const dx = direction.x
    const dz = direction.z
    const len = Math.hypot(dx, dz)
    if (len <= EPS) {
      console.log('[战斗] 目标向量过短，忽略本次发射')
      return
    }
    const dirX = dx / len
    const dirZ = dz / len
    const id = `projectile:${nextProjectileId++}`
    const proj: ProjectileState = {
      id,
      x: (shooter.origin?.x ?? playerPos!.x) + dirX * PLAYER_COLLISION_RADIUS * 1.4,
      z: (shooter.origin?.z ?? playerPos!.z) + dirZ * PLAYER_COLLISION_RADIUS * 1.4,
      dirX,
      dirZ,
      travelled: 0,
      ownerId: shooter.id,
      ownerTeamId: shooter.teamId
    }
    projectiles.set(id, proj)
    ensureProjectileVisual(world, proj)
    // console.log(`[战斗] 投射物已发射，编号 ${id}`)
  }

  const handleEnemyRemoval = (world: World, unit: UnitState) => {
    // console.log(`[战斗] 确认击杀 ${unit.id}，广播并销毁实体`)
    world.bus.emit({ type: 'combat/enemy-removed', payload: unit })
    world.destroyEntity(unit.id)
  }

  const computeFireDirection = (world: World): { x: number; z: number } | null => {
    if (!playerPos) return null
    if (!arenaReady) {
      console.warn('[战斗] 竞技场尚未就绪，暂不进行判定')
      return null
    }
    if (currentMoveDir) return { x: currentMoveDir.x, z: currentMoveDir.z }
    if (lastMoveDir) return { x: lastMoveDir.x, z: lastMoveDir.z }

    const render: any = world.ports.render
    if (render?.pick) {
      const pick = render.pick(0, 0)
      if (pick?.point) {
        const dx = pick.point.x - playerPos.x
        const dz = pick.point.z - playerPos.z
        const len = Math.hypot(dx, dz)
        if (len > EPS) {
          console.log('[战斗] 使用屏幕中心拾取辅助定向', { objectKind: pick.objectKind, objectId: pick.objectId })
          return { x: dx / len, z: dz / len }
        }
      }
    }
    const yaw = playerRotY || lastCameraYaw
    const dirX = Math.cos(yaw)
    const dirZ = Math.sin(yaw)
    if (Math.hypot(dirX, dirZ) > EPS) return { x: dirX, z: dirZ }
    return { x: 0, z: 1 }
  }

  function update(dt: number, world: World) {
    if (!(update as { inited?: boolean }).inited) {
      (update as { inited?: boolean }).inited = true
      // 初始化服务
      if (!hp) hp = new HpController(world.bus, { defaultHp: 100 })
      if (!obHp) obHp = new ObstacleHpController(world.bus)
      if (!autoAim) autoAim = new AutoAimController(world.bus, { radius: 4 })

      world.bus.on('entity/player/transform', (e) => {
        const tf = e.payload as { position?: { x: number; y?: number; z: number }; rotationY?: number }
        if (!tf?.position) return
        const prevPos = playerPos
        playerPos = { x: tf.position.x, y: tf.position.y ?? 0, z: tf.position.z }
        // 更新玩家为射手的自动瞄准位置（并确保已注册）
        autoAim?.registerShooter(PLAYER_ID, PLAYER_TEAM)
        autoAim?.updateShooterPosition(PLAYER_ID, { x: playerPos.x, z: playerPos.z })
        if (prevPos) {
          const mvX = playerPos.x - prevPos.x
          const mvZ = playerPos.z - prevPos.z
          const mvLen = Math.hypot(mvX, mvZ)
          if (mvLen > EPS) {
            const dirX = mvX / mvLen
            const dirZ = mvZ / mvLen
            currentMoveDir = { x: dirX, z: dirZ }
            lastMoveDir = { x: dirX, z: dirZ }
          } else {
            currentMoveDir = null
          }
        }
        if (typeof tf.rotationY === 'number') playerRotY = tf.rotationY
      })

      world.bus.on('camera/state', (e) => {
        const payload = e.payload as { yaw?: number }
        if (payload?.yaw != null) lastCameraYaw = payload.yaw
      })

      world.bus.on('arena/spawn-points', (e) => {
        enemies.clear()
        allies.clear()
        const payload = e.payload as {
          A?: { id?: string; x: number; z: number }[]
          B?: { id?: string; x: number; z: number }[]
        }
        payload?.A?.forEach((unit, index) => {
          const id = unit.id ?? `teamA:${index}`
          enemies.set(id, { id, x: unit.x, z: unit.z })
        })
        payload?.B?.forEach((unit, index) => {
          if (index === 0) return // B[0] 是玩家
          const id = unit.id ?? `teamB:${index - 1}`
          allies.set(id, { id, x: unit.x, z: unit.z })
        })
        arenaReady = true
        autoAim?.syncTargetsFromSpawns(payload?.A, payload?.B)
        console.log('[战斗] 竞技场单位已同步', { enemyCount: enemies.size, allyCount: allies.size })
      })

      world.bus.on('arena/reset', () => {
        console.log('[战斗] 收到重置事件，清理战斗状态')
        resetState(world)
        playerAlive = true
      })

      world.bus.on('respawn/complete', (e) => {
        // 事件：单位重生完成（两队通用）
        // 需求：
        // - 敌方（teamA）：恢复 enemies 缓存、目标库与可视化。
        // - 友方（teamB，排除玩家）：恢复 allies 缓存、目标库与可视化。
        const payload = e.payload as { unitId?: string; teamId?: string; position?: { x: number; z: number } }
        if (!payload?.unitId || !payload.teamId || !payload.position) return
        const id = payload.unitId
        const position = payload.position
        const render: any = world.ports.render

        if (payload.teamId === 'teamA') {
          // 敌方复活
          enemies.set(id, { id, x: position.x, z: position.z })
          autoAim?.upsertTarget(id, 'teamA', position.x, position.z)
          if (render?.removeEntity) render.removeEntity(id)
          if (render?.ensureEntity && render?.applyEntity) {
            render.ensureEntity(id, 'teamA')
            render.applyEntity(id, { position: { x: position.x, y: 0.5, z: position.z }, rotationY: 0, scale: 1 })
          }
          // console.log('[战斗] 敌方单位在重生点回场', { id, position })
          return
        }

        if (payload.teamId === 'teamB') {
          // 友方复活（不包含玩家）
          if (id === 'player:1') return
          allies.set(id, { id, x: position.x, z: position.z })
          autoAim?.upsertTarget(id, 'teamB', position.x, position.z)
          if (render?.removeEntity) render.removeEntity(id)
          if (render?.ensureEntity && render?.applyEntity) {
            render.ensureEntity(id, 'teamB')
            render.applyEntity(id, { position: { x: position.x, y: 0.5, z: position.z }, rotationY: 0, scale: 1 })
          }
          // console.log('[战斗] 友军单位在重生点回场', { id, position })
          return
        }
      })

      world.bus.on('entity/destroyed', (e) => {
        const payload = e.payload as { id?: string }
        if (!payload?.id) return
        if (enemies.has(payload.id)) {
          enemies.delete(payload.id)
          // console.log('[战斗] 敌方实体已销毁，移出缓存', { id: payload.id })
        }
        if (allies.has(payload.id)) {
          allies.delete(payload.id)
          // console.log('[战斗] 友方实体已销毁，移出缓存', { id: payload.id })
        }
      })

      // 统一开火入口：任何实体均可通过事件触发发射
      world.bus.on('combat/fire', (e) => {
        const p = e.payload as { shooterId?: string; teamId?: TeamId; origin?: { x: number; z: number }; direction?: { x: number; z: number }; forceManualAim?: boolean } | undefined
        const shooterId = p?.shooterId ?? PLAYER_ID
        const teamId = (p?.teamId as TeamId) ?? PLAYER_TEAM
        if (!shooterId || !teamId) return
        // 若玩家已死亡且尝试以玩家身份开火，则丢弃
        if (shooterId === PLAYER_ID && !playerAlive) {
          // console.log('[战斗] 玩家死亡，阻止开火事件（combat/fire 被忽略）') // 调试日志：按需已注释
          return
        }
        // 方向计算策略（新）：
        // - 若未强制手动瞄准，则优先自动瞄准队首
        // - 否则按事件 direction（若提供）/玩家回退方向
        // - 最后兜底：玩家回退方向
        const forceManual = !!p?.forceManualAim

        // 确保射手已在自动瞄准控制器注册（AI/友军首次发射时自动补注册）
        if (autoAim) {
          autoAim.registerShooter(shooterId, teamId)
          if (p?.origin) autoAim.updateShooterPosition(shooterId, p.origin)
        }

        let dir: { x: number; z: number } | null = null
        const origin = p?.origin ?? (shooterId === PLAYER_ID && playerPos ? { x: playerPos.x, z: playerPos.z } : undefined)

        if (!forceManual && origin && autoAim) {
          dir = autoAim.resolveDirection(shooterId, origin)
        }

        if (!dir && p?.direction) {
          dir = p.direction
        }

        if (!dir && shooterId === PLAYER_ID) {
          dir = computeFireDirection(world)
        }
        if (!dir) {
          // 若仍无法解析方向，说明无可用目标或缺少手动方向，丢弃本次开火
          // console.log('[战斗] 开火被忽略：缺少有效方向', { shooterId, teamId })
          return
        }
        fireProjectile(world, dir, { id: shooterId, teamId, origin: p?.origin })
      })
      // 监听：玩家死亡/复活，切换战斗开关
      world.bus.on('entity/destroyed', (e) => {
        const p = e.payload as { id?: string } | undefined
        if (p?.id === PLAYER_ID) {
          playerAlive = false
          // console.log('[战斗] 玩家死亡，禁用键盘开火') // 调试日志：按需已注释
        }
      })
      world.bus.on('respawn/complete', (e) => {
        const p = e.payload as { unitId?: string } | undefined
        if (p?.unitId === PLAYER_ID) {
          playerAlive = true
          // console.log('[战斗] 玩家复活，恢复键盘开火') // 调试日志：按需已注释
        }
      })
    }

    // 输入处理：按 P 开火（沿屏幕中心或最近移动方向）
    const input = world.ports.input
    const state = input?.getState()
    const firePressed = !!state?.pressed?.has(FIRE_KEY)
    const lastClick = state?.lastClick
    if (playerAlive && firePressed && !fireLatch && lastClick && lastClick.button === 2) {
      const direction = computeFireDirection(world)
      if (!direction) {
        console.warn('[战斗] 缺少有效定向向量，忽略开火')
      } else {
        // console.log('[战斗] 触发开火 -> 转译为 combat/fire 事件（优先自动瞄准，若存在屏幕中心拾取则使用拾取方向）')
        let sendDir: { x: number; z: number } | undefined = undefined
        // 若屏幕中心存在拾取（例如测试中设置的 pick），则计算方向随事件一并发送
        const render: any = world.ports.render
        const pick = render?.pick ? render.pick(lastClick.xNdc, lastClick.yNdc) : null
        if (pick?.point && playerPos) {
          const dx = pick.point.x - playerPos.x
          const dz = pick.point.z - playerPos.z
          const len = Math.hypot(dx, dz)
          if (len > EPS) sendDir = { x: dx / len, z: dz / len }
        }
        world.bus.emit({
          type: 'combat/fire',
          payload: {
            shooterId: PLAYER_ID,
            teamId: PLAYER_TEAM,
            origin: playerPos ? { x: playerPos.x, z: playerPos.z } : undefined,
            direction: sendDir,
            forceManualAim: true
          }
        })
      }
    }
    fireLatch = firePressed

    if (dt <= 0 || projectiles.size === 0) return

    const destroyedProjectiles: string[] = []
    for (const proj of projectiles.values()) {
      const step = PROJECTILE_SPEED * dt
      if (step <= EPS) continue
      const remainingRange = MAX_RANGE - proj.travelled
      if (remainingRange <= EPS) {
        destroyedProjectiles.push(proj.id)
        continue
      }

      const physics = world.ports.physics
      const moveDist = Math.min(step, remainingRange)
      let projectileDestroyed = false
      if (physics) {
        let remainingMove = moveDist
        let friendlyBypassCount = 0
        // 循环推进：直到耗尽当帧位移或撞上可被销毁的目标
        while (remainingMove > EPS && !projectileDestroyed) {
          const origin: [number, number, number] = [proj.x, 1, proj.z]
          const dir: [number, number, number] = [proj.dirX, 0, proj.dirZ]
          const hit = physics.sphereCast(origin, dir, PROJECTILE_RADIUS, remainingMove)
          const travel = Math.max(0, Math.min(hit.distance ?? remainingMove, remainingMove))

          if (travel > EPS) {
            proj.x += proj.dirX * travel
            proj.z += proj.dirZ * travel
            proj.travelled += travel
            remainingMove -= travel
          }

          if (!hit.hit) {
            if (proj.travelled >= MAX_RANGE - EPS) {
              console.log('[战斗] 投射物已达最大射程，散灭')
              destroyedProjectiles.push(proj.id)
              projectileDestroyed = true
            } else {
              updateProjectileVisual(world, proj)
            }
            break
          }

          const kind = hit.objectKind as string | undefined
          const targetId = hit.objectId as string | undefined
          let targetTeam: TeamId | null = null
          if (kind === 'teamA') targetTeam = 'teamA'
          else if (kind === 'teamB') targetTeam = 'teamB'

          if (targetTeam && targetId) {
            const isFriendly = proj.ownerTeamId === targetTeam
            if (isFriendly) {
              // 友军判定：忽略伤害并继续沿剩余距离前进，不消耗有效射程
              friendlyBypassCount += 1
              console.log('[战斗] 光球命中友军已忽略，继续尝试命中后方目标', {
                projectile: proj.id,
                ownerTeam: proj.ownerTeamId,
                targetTeam,
                targetId,
                bypassCount: friendlyBypassCount
              })
              if (friendlyBypassCount > MAX_FRIENDLY_BYPASS_PER_FRAME) {
                console.warn('[战斗] 单帧友军判定次数超限，投射物本帧停止推进以防死循环', {
                  projectile: proj.id,
                  ownerTeam: proj.ownerTeamId,
                  remainingMove
                })
                remainingMove = 0
                break
              }
              const bypass = Math.max(EPS, Math.min(FRIENDLY_BYPASS_OFFSET, remainingMove))
              proj.x += proj.dirX * bypass
              proj.z += proj.dirZ * bypass
              remainingMove = Math.max(remainingMove - bypass, 0)
              continue
            }

            if (targetTeam === 'teamA') {
              const enemy = enemies.get(targetId)
              const nextHp = hp ? hp.damage('teamA', targetId, DAMAGE_PER_HIT) : 50
              if (enemy && nextHp <= 0) {
                world.bus.emit({ type: 'combat/kill', payload: { killerTeamId: proj.ownerTeamId, killerId: proj.ownerId, victimTeamId: 'teamA', victimId: targetId } })
                handleEnemyRemoval(world, enemy)
              }
            } else if (targetTeam === 'teamB') {
              const ally = allies.get(targetId)
              const nextHp = hp ? hp.damage('teamB', targetId, DAMAGE_PER_HIT) : 50
              if (ally && nextHp <= 0) {
                world.bus.emit({ type: 'combat/kill', payload: { killerTeamId: proj.ownerTeamId, killerId: proj.ownerId, victimTeamId: 'teamB', victimId: targetId } })
                handleEnemyRemoval(world, ally)
              }
              if (targetId === 'player:1' && nextHp <= 0) {
                const px = playerPos?.x ?? 0
                const pz = playerPos?.z ?? 0
                console.log('[战斗] 玩家 HP 归零，触发销毁与重生计划', { id: targetId, position: { x: px, z: pz } })
                world.bus.emit({ type: 'combat/kill', payload: { killerTeamId: proj.ownerTeamId, killerId: proj.ownerId, victimTeamId: 'teamB', victimId: targetId } })
                handleEnemyRemoval(world, { id: 'player:1', x: px, z: pz })
              }
            }

            destroyedProjectiles.push(proj.id)
            projectileDestroyed = true
          } else {
            if (kind === 'obstacle' && targetId) {
              const nextHp = obHp ? obHp.damage(targetId, DAMAGE_PER_HIT) : 50
              if (nextHp <= 0) {
                world.bus.emit({ type: 'combat/obstacle-destroyed', payload: { obstacleId: targetId, killerTeamId: proj.ownerTeamId, killerId: proj.ownerId } })
                console.log('[战斗] 障碍 HP 归零，触发销毁', { id: targetId })
                world.destroyEntity(targetId)
              }
              destroyedProjectiles.push(proj.id)
            } else {
              destroyedProjectiles.push(proj.id)
            }
            projectileDestroyed = true
          }
        }

        if (!projectileDestroyed && proj.travelled >= MAX_RANGE - EPS) {
          console.log('[战斗] 投射物已达最大射程，散灭')
          destroyedProjectiles.push(proj.id)
          projectileDestroyed = true
        }

        if (!projectileDestroyed && remainingMove <= EPS) {
          updateProjectileVisual(world, proj)
        }
      } else {
        // 无物理端口：按直线位移近似
        const travel = moveDist
        proj.x += proj.dirX * travel
        proj.z += proj.dirZ * travel
        proj.travelled += travel
        if (proj.travelled >= MAX_RANGE - EPS) {
          console.log('[战斗] 投射物已达最大射程，散灭')
          destroyedProjectiles.push(proj.id)
          projectileDestroyed = true
        } else {
          updateProjectileVisual(world, proj)
        }
      }
    }

    for (const id of destroyedProjectiles) {
      projectiles.delete(id)
      destroyVisual(world, id)
    }
  }

  return { name: 'Combat', update }
}
