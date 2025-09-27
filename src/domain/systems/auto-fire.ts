/**
 * 系统：自动开火（AI）
 * - 优先级：
 *   1) 优先攻击“最近的障碍物”；
 *   2) 若“任一敌军进入有效攻击距离（4m）”或“障碍物已全部被击毁”，则优先攻击“最近的敌人”。
 * - 每秒触发一次开火，通过 combat/fire 事件下发，并强制使用计算出的方向（跳过自动瞄准队列）。
 */
import type { System, World } from '@domain/core/world' // 引入：系统/世界类型
import { EFFECTIVE_ATTACK_DIST } from "./constants" // 引入：共享攻击有效距离常量

interface ShooterState { // 数据：射手状态
  id: string
  teamId: 'teamA' | 'teamB'
  x: number
  z: number
  cooldown: number
  // 敌人就近队列：进入射程先后顺序（FIFO），仅包含"敌对单位"且位于有效攻击距离内
  enemyQueue: string[]
  enemyInRange: Set<string>
  // 当前锁定目标：
  // - enemy：若离开射程则不再追逐；若死亡则切换到队列下一个
  // - obstacle：锁定直到障碍被销毁
  // 锁定签名：用于变更检测
  lockSig?: string
  locked?: { kind: 'enemy' | 'obstacle'; id: string }
}

const FIRE_INTERVAL = 1.0 // 常量：发射间隔（秒）
const DEBUG_AF = false // 调试：自动开火锁定变更中文日志（默认关闭，可按需改为 true）

/**
 * 创建自动开火系统
 * 返回：System — 注册后自动根据出生点/重生/销毁事件维护射手集合
 */
export function autoFireSystem(): System { // 导出：自动开火系统供装配阶段使用
  console.log('[自瞄] 自动开火系统已初始化')

  const shooters = new Map<string, ShooterState>()
  // 缓存：障碍与单位位置
  const obstacles = new Map<string, { id: string; x: number; z: number }>()
  const units = new Map<string, { id: string; teamId: 'teamA' | 'teamB'; x: number; z: number }>()

  const upsert = (id: string, teamId: 'teamA' | 'teamB', x: number, z: number) => {
    const s = shooters.get(id)
    if (s) {
      s.x = x
      s.z = z
      // 不重置冷却，保持稳定节奏
    } else {
      shooters.set(id, { id, teamId, x, z, cooldown: 0, enemyQueue: [], enemyInRange: new Set() })
      // console.log('[自瞄] 登记射手', { id, teamId, x, z })
    }
  }

  const remove = (id: string) => {
    if (shooters.delete(id)) {
      // console.log('[自瞄] 移除射手', { id })
    }
  }

  const update: System['update'] = (dt, world: World) => {
    // 单例保护：仅允许第一个实例执行（避免重复注册导致双倍开火）
    if ((update as any).__primary == null) {
      const g: any = (globalThis as any)
      if (!g.__autoFirePrimaryTaken) {
        g.__autoFirePrimaryTaken = true
        ;(update as any).__primary = true
        console.log('[自瞄] 自动开火系统主实例生效')
      } else {
        ;(update as any).__primary = false
        console.warn('[自瞄] 检测到自动开火重复实例，本实例将不执行逻辑')
      }
    }
    if (!(update as any).__primary) return
    // 工具：设置锁并在变更时广播（仅变更时触发一次事件）
    const setLock = (s: ShooterState, next?: { kind: 'enemy' | 'obstacle'; id: string }) => {
      const sig = next ? (next.kind + ':' + next.id) : ''
      if (sig === (s.lockSig ?? '')) { s.locked = next; return }
      s.locked = next
      s.lockSig = sig
      world.bus.emit({ type: 'ai/locked-target', payload: { shooterId: s.id, teamId: s.teamId, lock: next ? { kind: next.kind, id: next.id } : undefined, queueLen: s.enemyQueue.length } })
    }
    if ((update as { sub?: boolean }).sub) {
      // 已订阅，继续逻辑
    } else {
      (update as { sub?: boolean }).sub = true
      // 出生点：登记全部非玩家单位为射手，同时记录单位索引（含玩家）
      world.bus.on('arena/spawn-points', (e) => {
        const payload = e.payload as {
          A?: { id?: string; x: number; z: number }[]
          B?: { id?: string; x: number; z: number }[]
        }
        // 敌方（teamA）全员
        payload?.A?.forEach((u, idx) => {
          const id = u.id ?? `teamA:${idx}`
          upsert(id, 'teamA', u.x, u.z)
          units.set(id, { id, teamId: 'teamA', x: u.x, z: u.z })
        })
        // 我方（teamB）除玩家（索引 0）
        payload?.B?.forEach((u, idx) => {
          const id = u.id ?? (idx === 0 ? 'player:1' : `teamB:${idx - 1}`)
          if (id === 'player:1') return
          upsert(id, 'teamB', u.x, u.z)
          units.set(id, { id, teamId: 'teamB', x: u.x, z: u.z })
        })
        // 初始化每个射手的敌人就近队列（按进入半径时序；此处以当前静态位置近似地全部入队）
        shooters.forEach((s) => {
          s.enemyQueue = []
          s.enemyInRange.clear()
          units.forEach((u) => {
            if (u.teamId === s.teamId) return
            const dx = u.x - s.x
            const dz = u.z - s.z
            const d = Math.hypot(dx, dz)
            if (d <= EFFECTIVE_ATTACK_DIST + 1e-6) {
              s.enemyInRange.add(u.id)
              if (!s.enemyQueue.includes(u.id)) s.enemyQueue.push(u.id)
            }
          })
        })
      })
      // 重生：恢复为射手（敌方与友军对称；友军排除玩家）
      world.bus.on('respawn/complete', (e) => {
        const p = e.payload as { unitId?: string; teamId?: 'teamA' | 'teamB'; position?: { x: number; z: number } }
        if (!p?.unitId || !p.teamId || !p.position) return
        if (p.teamId === 'teamA') {
          upsert(p.unitId, 'teamA', p.position.x, p.position.z)
          // console.log('[自瞄] 敌方射手重生恢复登记', { id: p.unitId })
        } else if (p.teamId === 'teamB' && p.unitId !== 'player:1') {
          upsert(p.unitId, 'teamB', p.position.x, p.position.z)
          // console.log('[自瞄] 红队射手重生恢复登记', { id: p.unitId })
        }
      })
      // 销毁：从射手集合移除
      world.bus.on('entity/destroyed', (e) => {
        const id = (e.payload as { id?: string } | undefined)?.id
        if (id) remove(id)
      })
      // 订阅单位移动：保持射手的 origin 与位置同步，并维护单位索引（含敌我，用于最近目标/队列计算）
      world.bus.on('unit/transform', (e) => {
        const p = e.payload as { id?: string; teamId?: 'teamA' | 'teamB'; position?: { x: number; z: number } } | undefined
        if (!p?.id || !p.position) return
        const s = shooters.get(p.id)
        if (s) {
          s.x = p.position.x
          s.z = p.position.z
          // 射手自身移动：需要重算该射手的 inRange 与队列（仅遍历敌对单位）
          units.forEach((u) => {
            if (u.teamId === s.teamId) return
            const dx = u.x - s.x
            const dz = u.z - s.z
            const d = Math.hypot(dx, dz)
            const within = d <= EFFECTIVE_ATTACK_DIST + 1e-6
            const was = s.enemyInRange.has(u.id)
            if (within && !was) {
              s.enemyInRange.add(u.id)
              if (!s.enemyQueue.includes(u.id)) s.enemyQueue.push(u.id)
            } else if (!within && was) {
              s.enemyInRange.delete(u.id)
              s.enemyQueue = s.enemyQueue.filter((q) => q !== u.id)
              // 若当前锁定目标为该敌人且离开射程：
              // - 队列非空：不追逐该目标，切换到队列下一个
              // - 队列为空：清空锁，交由行走系统触发回退寻路（最近障碍/敌/出生圈）
              if (s.locked?.kind === 'enemy' && s.locked.id === u.id) {
                const next = s.enemyQueue[0]
                if (next) {
                  if (typeof DEBUG_AF !== 'undefined' && DEBUG_AF) console.log('[自瞄] 锁定目标离射程（队列非空）：切换到队列头', { shooter: s.id, from: u.id, to: next })
                  setLock(s, { kind: 'enemy', id: next })
                } else {
                  if (typeof DEBUG_AF !== 'undefined' && DEBUG_AF) console.log('[自瞄] 锁定目标离射程（队列为空）：清空锁定，等待回退寻路', { shooter: s.id, from: u.id })
                  setLock(s, undefined)
                }
              }
            }
          })
        }
        // 更新单位索引（若能拿到 teamId 则写入，否则保持原值）
        const u = units.get(p.id)
        if (u) {
          u.x = p.position.x
          u.z = p.position.z
          // 敌对单位移动：仅对与其为敌的射手更新 inRange/队列（O(#shooters)）
          shooters.forEach((s2) => {
            if (s2.teamId === (p.teamId ?? u.teamId)) return
            const dx = (p.position as any).x - s2.x
            const dz = (p.position as any).z - s2.z
            const d = Math.hypot(dx, dz)
            const within = d <= EFFECTIVE_ATTACK_DIST + 1e-6
            const was = s2.enemyInRange.has(p.id)
            if (within && !was) {
              s2.enemyInRange.add(p.id)
              if (!s2.enemyQueue.includes(p.id)) s2.enemyQueue.push(p.id)
            } else if (!within && was) {
              s2.enemyInRange.delete(p.id)
              s2.enemyQueue = s2.enemyQueue.filter((q) => q !== p.id)
              if (s2.locked?.kind === 'enemy' && s2.locked.id === p.id) {
                const next = s2.enemyQueue[0]
                if (next) {
                  if (typeof DEBUG_AF !== 'undefined' && DEBUG_AF) console.log('[自瞄] 锁定目标离射程（队列非空）：切换到队列头', { shooter: s2.id, from: p.id, to: next })
                  setLock(s2, { kind: 'enemy', id: next })
                } else {
                  if (typeof DEBUG_AF !== 'undefined' && DEBUG_AF) console.log('[自瞄] 锁定目标离射程（队列为空）：清空锁定，等待回退寻路', { shooter: s2.id, from: p.id })
                  setLock(s2, undefined)
                }
              }
            }
          })
        }
      })

      // 玩家专用：同步玩家坐标到单位索引，便于成为 teamA 的敌方目标
      world.bus.on('entity/player/transform', (e) => {
        const tf = e.payload as { position?: { x: number; y?: number; z: number } } | undefined
        if (!tf?.position) return
        const prev = units.get('player:1')
        units.set('player:1', { id: 'player:1', teamId: 'teamB', x: tf.position.x, z: tf.position.z })
        // 同步触发 inRange/队列更新（与 unit/transform 对敌对射手的逻辑保持一致）
        shooters.forEach((s2) => {
          if (s2.teamId !== 'teamA') return // 仅 teamA 将玩家视为敌方
          const dx = tf.position!.x - s2.x
          const dz = tf.position!.z - s2.z
          const d = Math.hypot(dx, dz)
          const within = d <= EFFECTIVE_ATTACK_DIST + 1e-6
          const was = s2.enemyInRange.has('player:1')
          if (within && !was) {
            s2.enemyInRange.add('player:1')
            if (!s2.enemyQueue.includes('player:1')) s2.enemyQueue.push('player:1')
          } else if (!within && was) {
            s2.enemyInRange.delete('player:1')
            s2.enemyQueue = s2.enemyQueue.filter((q) => q !== 'player:1')
            if (s2.locked?.kind === 'enemy' && s2.locked.id === 'player:1') setLock(s2, undefined)
          }
        })
      })

      // 障碍列表：建立 obstacle:i 到坐标的索引
      world.bus.on('arena/obstacles', (e) => {
        obstacles.clear()
        const list = (e as any).payload as { x?: number; z?: number; scale?: number }[] | undefined
        if (Array.isArray(list)) {
          list.forEach((o, i) => {
            if (typeof o?.x === 'number' && typeof o?.z === 'number') {
              const id = `obstacle:${i}`
              obstacles.set(id, { id, x: o.x as number, z: o.z as number })
            }
          })
        }
      })

      // 移除：实体销毁（含障碍/单位）
      world.bus.on('entity/destroyed', (e) => {
        const id = (e.payload as { id?: string } | undefined)?.id
        if (!id) return
        shooters.delete(id) // 射手被销毁 → 从射手集合移除
        const wasUnit = units.delete(id)
        const wasObstacle = id.startsWith('obstacle:') ? obstacles.delete(id) : false
        // 若被移除的是“敌方单位”，需要从所有射手队列中清除，并按规则切换目标
        if (wasUnit) {
          shooters.forEach((s2) => {
            // 清理队列/范围集合
            if (s2.enemyInRange.delete(id)) {
              s2.enemyQueue = s2.enemyQueue.filter((q) => q !== id)
            } else {
              const before = s2.enemyQueue.length
              if (before) s2.enemyQueue = s2.enemyQueue.filter((q) => q !== id)
            }
            // 若当前锁定的是该敌人：立即切换到队列下一个（若有）
            if (s2.locked?.kind === 'enemy' && s2.locked.id === id) {
              const next = s2.enemyQueue[0]
              setLock(s2, next ? { kind: 'enemy', id: next } : undefined)
            }
          })
        }
        if (wasObstacle) {
          // 若任何射手锁定该障碍：清除锁，使其在下次冷却时按规则选择下一个
          shooters.forEach((s2) => {
            if (s2.locked?.kind === 'obstacle' && s2.locked.id === id) setLock(s2, undefined)
          })
        }
      })
    }

    if (dt <= 0) return
    // 工具：判断是否在有效射程内（根据共享常量）
    const canFireAt = (s: ShooterState, target: { kind: 'enemy' | 'obstacle'; id: string }): boolean => {
      if (target.kind === 'enemy') {
        const u = units.get(target.id)
        if (!u) return false
        const d = Math.hypot(u.x - s.x, u.z - s.z)
        return d <= EFFECTIVE_ATTACK_DIST + 1e-6
      }
      const o = obstacles.get(target.id)
      if (!o) return false
      const d = Math.hypot(o.x - s.x, o.z - s.z)
      return d <= EFFECTIVE_ATTACK_DIST + 1e-6
    }
    // 冷却推进与触发
    shooters.forEach((s) => {
      s.cooldown -= dt
      if (s.cooldown <= 0) {
        s.cooldown += FIRE_INTERVAL
        // 1) 若存在锁定目标，根据规则验证与发射
        let fired = false
        if (s.locked) {
          if (s.locked.kind === 'enemy') {
            const u = units.get(s.locked.id)
            if (!u) {
              // 敌人死亡 → 换队列下一个
              const next = s.enemyQueue[0]
              setLock(s, next ? { kind: 'enemy', id: next } : undefined)
            } else {
              const dx = u.x - s.x
              const dz = u.z - s.z
              const d = Math.hypot(dx, dz)
              if (d > EFFECTIVE_ATTACK_DIST + 1e-6) {
                // 离开攻击范围：若队列非空→切换到队列头；否则清空锁，交由行走系统回退
                const next = s.enemyQueue[0]
                if (next) {
                  if (typeof DEBUG_AF !== 'undefined' && DEBUG_AF) console.log('[自瞄] 冷却触发检查：离射程（队列非空），切换队列头', { shooter: s.id, from: s.locked.id, to: next })
                  setLock(s, { kind: 'enemy', id: next })
                } else {
                  if (typeof DEBUG_AF !== 'undefined' && DEBUG_AF) console.log('[自瞄] 冷却触发检查：离射程（队列为空），清空锁', { shooter: s.id, from: s.locked.id })
                  setLock(s, undefined)
                }
              } else {
                const len = d || 1
                const dir = { x: dx / len, z: dz / len }
                world.bus.emit({ type: 'combat/fire', payload: { shooterId: s.id, teamId: s.teamId, origin: { x: s.x, z: s.z }, direction: dir, forceManualAim: true } })
                fired = true
              }
            }
          } else if (s.locked.kind === 'obstacle') {
            const o = obstacles.get(s.locked.id)
            if (!o) {
              // 障碍被销毁 → 清锁
              setLock(s, undefined)
            } else {
              // 仅在进入有效射程时才开火；否则保持锁定并交由行走系统逼近
              const dx = o.x - s.x
              const dz = o.z - s.z
              const dist = Math.hypot(dx, dz)
              if (dist <= EFFECTIVE_ATTACK_DIST + 1e-6) {
                const len = dist || 1
                const dir = { x: dx / len, z: dz / len }
                world.bus.emit({ type: 'combat/fire', payload: { shooterId: s.id, teamId: s.teamId, origin: { x: s.x, z: s.z }, direction: dir, forceManualAim: true } })
                fired = true
              }
            }
          }
        }

        if (fired) return

        // 2) 若无锁定：
        // 2.1) 优先取队列头部敌人
        const head = s.enemyQueue[0]
        if (head && s.enemyInRange.has(head) && units.has(head)) {
          setLock(s, { kind: 'enemy', id: head })
        }

        // 2.2) 队列为空或不可用：按规则选择最近敌/障碍
        if (!s.locked) {
          const oppTeam: 'teamA' | 'teamB' = s.teamId === 'teamA' ? 'teamB' : 'teamA'
          // 计算最近敌人与是否在射程内
          let nearestEnemy: { id: string; x: number; z: number } | null = null
          let nearestEnemyD2 = Infinity
          units.forEach((u) => {
            if (u.teamId !== oppTeam) return
            const dx = u.x - s.x
            const dz = u.z - s.z
            const d2 = dx * dx + dz * dz
            if (d2 < nearestEnemyD2) { nearestEnemyD2 = d2; nearestEnemy = { id: u.id, x: u.x, z: u.z } }
          })
          const enemyDist = nearestEnemy ? Math.sqrt(nearestEnemyD2) : Infinity
          const enemyWithin = enemyDist <= EFFECTIVE_ATTACK_DIST + 1e-6

          // 计算最近障碍
          let nearestObstacle: { id: string; x: number; z: number } | null = null
          let nearestObstacleD2 = Infinity
          obstacles.forEach((o) => {
            const dx = o.x - s.x
            const dz = o.z - s.z
            const d2 = dx * dx + dz * dz
            if (d2 < nearestObstacleD2) { nearestObstacleD2 = d2; nearestObstacle = { id: o.id, x: o.x, z: o.z } }
          })

          // 队列为空时的决策规则（中文注释保留以便排查）：
          // - 若“任一敌军进入有效攻击距离”→ 优先锁定最近敌人；
          // - 否则：
          //    - 若仍存在障碍物 → 锁定最近障碍物；
          //    - 若障碍物已全部被击毁 → 不锁定敌人（若敌人在射程外），留给行走系统前压（向最近敌人推进）。
          if (!s.enemyQueue.length) {
            if (enemyWithin && nearestEnemy) {
              setLock(s, { kind: 'enemy', id: nearestEnemy.id })
            } else if (nearestObstacle) {
              setLock(s, { kind: 'obstacle', id: nearestObstacle.id })
            } else if (nearestEnemy && obstacles.size === 0) {
              // 敌人在射程外 & 障碍清空：不立即锁定，等待行走系统推进至射程内
              if (typeof DEBUG_AF !== 'undefined' && DEBUG_AF) console.log('[自瞄] 障碍清空且敌在射程外，暂不锁定，等待行走系统推进', { shooter: s.id, enemy: nearestEnemy.id })
            }
          }
        }

        // 2.3) 若已选定锁定目标，且在射程内，立即发射一次（避免首发延迟）
        if (s.locked && canFireAt(s, s.locked)) {
          if (s.locked.kind === 'enemy') {
            const u = units.get(s.locked.id)
            if (u) {
              const dx = u.x - s.x
              const dz = u.z - s.z
              const len = Math.hypot(dx, dz) || 1
              const dir = { x: dx / len, z: dz / len }
              world.bus.emit({ type: 'combat/fire', payload: { shooterId: s.id, teamId: s.teamId, origin: { x: s.x, z: s.z }, direction: dir, forceManualAim: true } })
            }
          } else {
            const o = obstacles.get(s.locked.id)
            if (o) {
              const dx = o.x - s.x
              const dz = o.z - s.z
              const len = Math.hypot(dx, dz) || 1
              const dir = { x: dx / len, z: dz / len }
              world.bus.emit({ type: 'combat/fire', payload: { shooterId: s.id, teamId: s.teamId, origin: { x: s.x, z: s.z }, direction: dir, forceManualAim: true } })
            }
          }
        }
      }
    })
  }

  return { name: 'AutoFire', update }
}
