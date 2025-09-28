/**
 * 系统：简易移动 AI（非玩家）
 * - 让除玩家外的单位（teamA 全员 + teamB 除玩家）朝最近的敌方或锁定的障碍移动。
 * - 与自动开火系统保持目标一致：通过 ai/locked-target 事件同步“移动目标 = 攻击对象”。
 * - 使用 Map 存储障碍（key=obstacle:i），避免因数组 splice 导致 id 与索引错位，从而引发“原地不动不攻”。
 * - 障碍清空后配合自动开火持续追击敌人，直到逼近至安全距离再收步。
*/
import type { System, World } from '@domain/core/world' // 引入：系统/世界类型
import { PLAYER_COLLISION_RADIUS } from '@domain/systems/movement' // 引入：与玩家相同的碰撞半径，用作 AI 单位半径
import { EFFECTIVE_ATTACK_DIST } from './constants' // 引入：共享攻击有效距离，保证与开火一致

type TeamId = 'teamA' | 'teamB'

interface Walker { // 数据：被 AI 控制的单位
  id: string
  teamId: TeamId
  x: number
  z: number
}

const SPEED = 8 // 常量：AI 移动速度（m/s）固定为 8
const AGENT_RADIUS = PLAYER_COLLISION_RADIUS // 常量：AI 单位半径
const ENGAGE_HOLD_DIST = 0.5 // 常量：与敌人保持的最小交战距离（米）
const DEBUG_AI = false // 调试：控制本系统的中文日志开关（默认关闭）

export function aiWalkerSystem(): System { // 导出：AI 行走系统供装配使用
  console.log('[AI] 移动 AI 系统已初始化')

  const walkers = new Map<string, Walker>()
  const units = new Map<string, { id: string; teamId: TeamId; x: number; z: number }>() // 全部单位（含玩家）
  const obstacles = new Map<string, { x: number; z: number; scale: number }>() // 障碍缓存：以 obstacle:i 为 key
  let bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null
  // 出生圈信息：用于“障碍清空且无敌人”时的推进方向（前压到敌方出生圈）
  const spawnCircle = {
    A: { center: null as null | { x: number; z: number }, radius: 0 },
    B: { center: null as null | { x: number; z: number }, radius: 0 }
  }
  // 锁定目标映射：由 auto-fire 广播，保持“移动目标=攻击目标”
  const locks = new Map<string, { kind: 'enemy' | 'obstacle'; id: string } | undefined>()

  const isPlayer = (id: string) => id === 'player:1'

  const upsertWalker = (id: string, teamId: TeamId, x: number, z: number) => {
    if (isPlayer(id)) return
    walkers.set(id, { id, teamId, x, z })
    units.set(id, { id, teamId, x, z })
  }
  const removeWalker = (id: string) => {
    walkers.delete(id)
    units.delete(id)
  }

  const clampInBounds = (x: number, z: number): { x: number; z: number } => {
    if (!bounds) return { x, z }
    const margin = 0.5
    const cx = Math.min(bounds.maxX - margin, Math.max(bounds.minX + margin, x))
    const cz = Math.min(bounds.maxZ - margin, Math.max(bounds.minZ + margin, z))
    return { x: cx, z: cz }
  }

  const update: System['update'] = (dt, world: World) => {
    if (!(update as { sub?: boolean }).sub) {
      (update as { sub?: boolean }).sub = true

      // 订阅：场景重置，清空缓存，避免残留状态影响下一局
      world.bus.on('arena/reset', () => {
        walkers.clear()
        units.clear()
        obstacles.clear()
        bounds = null
        locks.clear()
        if (DEBUG_AI) console.log('[AI] 收到场景重置，已清空单位与障碍缓存')
      })

      world.bus.on('arena/spawn-points', (e) => {
        const p = e.payload as {
          A?: { id?: string; x: number; z: number }[]
          B?: { id?: string; x: number; z: number }[]
          circle?: { A?: { center?: { x: number; z: number }; radius?: number }; B?: { center?: { x: number; z: number }; radius?: number } }
        }
        walkers.clear()
        units.clear()
        p?.A?.forEach((u, idx) => {
          const id = u.id ?? `teamA:${idx}`
          upsertWalker(id, 'teamA', u.x, u.z)
        })
        p?.B?.forEach((u, idx) => {
          const id = u.id ?? (idx === 0 ? 'player:1' : `teamB:${idx - 1}`)
          if (isPlayer(id)) {
            // 玩家不加入 walkers，但加入单位索引，以供敌方趋近/避障
            units.set(id, { id, teamId: 'teamB', x: u.x, z: u.z })
          } else {
            upsertWalker(id, 'teamB', u.x, u.z)
          }
        })
        // 解析出生圈信息，提供回退推进目标
        const cA = p?.circle?.A?.center
        const cB = p?.circle?.B?.center
        if (cA && typeof cA.x === 'number' && typeof cA.z === 'number') {
          spawnCircle.A.center = { x: cA.x, z: cA.z }
          spawnCircle.A.radius = p?.circle?.A?.radius ?? 0
        }
        if (cB && typeof cB.x === 'number' && typeof cB.z === 'number') {
          spawnCircle.B.center = { x: cB.x, z: cB.z }
          spawnCircle.B.radius = p?.circle?.B?.radius ?? 0
        }
        if (DEBUG_AI) console.log('[AI] 已同步行走单位与出生圈', { walkers: walkers.size, hasCircleA: !!spawnCircle.A.center, hasCircleB: !!spawnCircle.B.center })
      })

      world.bus.on('arena/bounds', (e) => {
        const b = e.payload as { minX: number; maxX: number; minZ: number; maxZ: number } | undefined
        if (b) bounds = b
      })

      // 订阅：障碍列表（使用 Map 存储，键为 obstacle:i，避免索引错位）
      world.bus.on('arena/obstacles', (e) => {
        const list = (e as any).payload as { x?: number; z?: number; scale?: number }[] | undefined
        obstacles.clear()
        if (Array.isArray(list)) {
          list.forEach((o, i) => {
            if (typeof o?.x === 'number' && typeof o?.z === 'number' && typeof o?.scale === 'number') {
              const id = `obstacle:${i}`
              obstacles.set(id, { x: o.x as number, z: o.z as number, scale: o.scale as number })
            }
          })
        }
        if (DEBUG_AI) console.log('[AI] 已同步障碍列表', { count: obstacles.size })
      })

      // 订阅：攻击锁定目标变更（来自 auto-fire）。保持“移动目标=当前攻击对象”。
      world.bus.on('ai/locked-target', (e) => {
        const p = e.payload as { shooterId?: string; teamId?: TeamId; lock?: { kind: 'enemy' | 'obstacle'; id: string } } | undefined
        const sid = p?.shooterId
        if (!sid || sid === 'player:1') return
        if (p?.lock) {
          locks.set(sid, p.lock)
          if (DEBUG_AI) console.log('[AI] 锁定目标更新', { shooterId: sid, lock: p.lock })
        } else {
          locks.set(sid, undefined)
          if (DEBUG_AI) console.log('[AI] 清除锁定目标', { shooterId: sid })
        }
      })

      world.bus.on('respawn/complete', (e) => {
        const p = e.payload as { unitId?: string; teamId?: TeamId; position?: { x: number; z: number } }
        if (!p?.unitId || !p.teamId || !p.position) return
        if (isPlayer(p.unitId)) return
        upsertWalker(p.unitId, p.teamId, p.position.x, p.position.z)
      })

      world.bus.on('entity/destroyed', (e) => {
        const id = (e.payload as { id?: string } | undefined)?.id
        if (!id) return
        removeWalker(id)
        locks.delete(id)
        if (id.startsWith('obstacle:')) {
          const removed = obstacles.delete(id)
          if (DEBUG_AI) console.log('[AI] 移除已销毁障碍的避障数据', { id, removed })
        }
      })

      // 同步单位移动：维护 units 索引，便于其他单位趋近与避障
      world.bus.on('unit/transform', (e) => {
        const p = e.payload as { id?: string; teamId?: TeamId; position?: { x: number; z: number } } | undefined
        if (!p?.id || !p.position) return
        const u = units.get(p.id)
        if (u) {
          u.x = p.position.x
          u.z = p.position.z
        } else if (p.teamId) {
          units.set(p.id, { id: p.id, teamId: p.teamId, x: p.position.x, z: p.position.z })
        }
        const w = walkers.get(p.id)
        if (w) {
          w.x = p.position.x
          w.z = p.position.z
        }
      })
    }

    if (dt <= 0 || walkers.size === 0) return
    const render: any = world.ports.render

    // 构造敌方查找索引：按 teamId 过滤
    const byTeam: Record<TeamId, { id: string; x: number; z: number }[]> = { teamA: [], teamB: [] }
    units.forEach((u) => byTeam[u.teamId].push(u))

    walkers.forEach((w) => {
      const oppTeam: TeamId = w.teamId === 'teamA' ? 'teamB' : 'teamA'
      const list = byTeam[oppTeam]

      // 解析：当前移动目标（与攻击锁定一致）
      const currentLock = locks.get(w.id)
      let target: { x: number; z: number } | null = null
      if (currentLock?.kind === 'obstacle') {
        const ob = obstacles.get(currentLock.id)
        if (ob) {
          target = { x: ob.x, z: ob.z }
        } else {
          if (DEBUG_AI) console.warn('[AI] 锁定障碍无法解析坐标，进入回退策略', { walker: w.id, lock: currentLock })
        }
      } else if (currentLock?.kind === 'enemy') {
        const en = units.get(currentLock.id)
        if (en) {
          const dx = en.x - w.x
          const dz = en.z - w.z
          const dist = Math.hypot(dx, dz)
          // 攻击对象是角色：无论是否进入射程，只要未贴近到安全距离就持续追击
          if (dist > ENGAGE_HOLD_DIST + 1e-6) {
            target = { x: en.x, z: en.z }
            if (DEBUG_AI) console.log('[AI] 锁定敌人，持续追击', { walker: w.id, target: currentLock.id, distance: dist })
          } else {
            target = null
            if (DEBUG_AI) console.log('[AI] 已贴近锁定敌人，收束推进', { walker: w.id, target: currentLock.id, distance: dist })
          }
        }
      }

      // 若无锁定或锁定解析失败，按“队列为空时”的三条规则选择移动目标
      if (!currentLock || (currentLock?.kind === 'obstacle' && !target)) {
        // 最近敌方
        let nearestEnemy: { x: number; z: number } | null = null
        let bestD2 = Infinity
        for (const t of list) {
          const dx = t.x - w.x
          const dz = t.z - w.z
          const d2 = dx * dx + dz * dz
          if (d2 < bestD2) { bestD2 = d2; nearestEnemy = { x: t.x, z: t.z } }
        }
        const enemyDist = nearestEnemy ? Math.sqrt(bestD2) : Infinity
        const enemyWithin = enemyDist <= EFFECTIVE_ATTACK_DIST + 1e-6
        const shouldAdvanceEnemy = nearestEnemy ? enemyDist > ENGAGE_HOLD_DIST + 1e-6 : false
        if (!enemyWithin) {
          // 最近敌方在攻击距离外 → 若有障碍则去最近障碍，否则去最近敌方；若连敌人都没有且障碍清空 → 去敌方出生圈中心
          if (obstacles.size > 0) {
            let bestO2 = Infinity
            let bestO: { x: number; z: number } | null = null
            for (const o of obstacles.values()) {
              const dx = o.x - w.x
              const dz = o.z - w.z
              const d2 = dx * dx + dz * dz
              if (d2 < bestO2) { bestO2 = d2; bestO = { x: o.x, z: o.z } }
            }
            target = bestO
          } else if (nearestEnemy) {
            target = nearestEnemy
          } else {
            // 敌人列表为空且障碍清空：前压至敌方出生圈中心
            const circle = oppTeam === 'teamA' ? spawnCircle.A.center : spawnCircle.B.center
            if (circle) {
              target = { x: circle.x, z: circle.z }
              if (DEBUG_AI) console.log('[AI] 障碍清空且无敌方存活，前往敌方出生圈', { walker: w.id, to: target })
            } else {
              if (DEBUG_AI) console.warn('[AI] 无法解析敌方出生圈中心，保持原地等待', { walker: w.id, oppTeam })
              target = null
            }
          }
        } else if (shouldAdvanceEnemy && nearestEnemy) {
          target = nearestEnemy
          if (DEBUG_AI) console.log('[AI] 敌人已入射程，继续压进缩短距离', { walker: w.id, enemy: nearestEnemy, distance: enemyDist })
        } else {
          target = null
        }
      }

      // 若无目标则不移动（保持朝向不变）
      const step = SPEED * dt
      let dirX = 0
      let dirZ = 1
      let nxPos = w.x
      let nzPos = w.z
      // 标记：目标是否为敌方出生圈圆心（若是→允许在到达圆心时停下）
      let targetIsSpawnCenter = false
      if (!currentLock && obstacles.size === 0) {
        const circle = oppTeam === 'teamA' ? spawnCircle.A.center : spawnCircle.B.center
        if (circle && target && Math.abs(target.x - circle.x) < 1e-6 && Math.abs(target.z - circle.z) < 1e-6) {
          targetIsSpawnCenter = true
        }
      }
      if (target) {
        const dx = target.x - w.x
        const dz = target.z - w.z
        const len = Math.hypot(dx, dz) || 1
        // 若目标为出生圈圆心且本帧可到达 → 直接停在圆心
        if (targetIsSpawnCenter && len <= step + 1e-6) {
          nxPos = target.x
          nzPos = target.z
          dirX = dx / len
          dirZ = dz / len
        } else {
          dirX = dx / len
          dirZ = dz / len
          nxPos = w.x + dirX * step
          nzPos = w.z + dirZ * step
        }
      }

      // 简单双圆避障/分离：对障碍与其他单位做最小分离
      const minSep = 1e-3
      // 1) 障碍（半径 = scale*0.5）
      for (const o of obstacles.values()) {
        const or = o.scale * 0.5
        const dx = nxPos - o.x
        const dz = nzPos - o.z
        const dist = Math.hypot(dx, dz)
        const minDist = or + AGENT_RADIUS
        if (dist < minDist && dist > minSep) {
          const push = (minDist - dist)
          nxPos += (dx / dist) * push
          nzPos += (dz / dist) * push
        }
      }
      // 2) 其他单位（半径 = AGENT_RADIUS）
      for (const u of units.values()) {
        if (u.id === w.id) continue
        const dx = nxPos - u.x
        const dz = nzPos - u.z
        const dist = Math.hypot(dx, dz)
        const minDist = AGENT_RADIUS + AGENT_RADIUS
        if (dist < minDist && dist > minSep) {
          const push = (minDist - dist)
          nxPos += (dx / dist) * push
          nzPos += (dz / dist) * push
        }
      }

      const clamped = clampInBounds(nxPos, nzPos)
      const mvx = clamped.x - w.x
      const mvz = clamped.z - w.z
      // 更新方向用于朝向展示
      const mvLen = Math.hypot(mvx, mvz) || 1
      dirX = mvx / mvLen
      dirZ = mvz / mvLen
      w.x = clamped.x
      w.z = clamped.z
      // 渲染与广播
      if (render?.applyEntity) {
        render.applyEntity(w.id, { position: { x: w.x, y: 0.5, z: w.z }, rotationY: Math.atan2(dirZ, dirX), scale: 1 })
      }
      world.bus.emit({ type: 'unit/transform', payload: { id: w.id, teamId: w.teamId, position: { x: w.x, z: w.z } } })
      // 更新单位索引位置（供其它 walker 参考本帧最新位置）
      units.set(w.id, { id: w.id, teamId: w.teamId, x: w.x, z: w.z })
    })
  }

  return { name: 'AIWalker', update }
}
