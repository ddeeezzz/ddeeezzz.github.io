/**
 * 系统：计分（击杀分/障碍分/综合分）
 * - 击杀分：combat/kill 事件驱动，击杀方阵营 +1。
 * - 障碍分：combat/obstacle-destroyed 事件驱动，摧毁方阵营 +2。
 * - 综合分：用于 UI 与回合胜负判定（teamA/teamB 字段即综合分）。
 * - 维护单位归属映射（仅用于 combat/kill 受害方阵营推断），并向队伍系统推送个人统计（击杀/死亡/HP）。
 * - 每次变更通过 score/updated 广播：包含综合分、击杀/障碍原始计数与中文提示 note。
 */
import type { System, World } from '@domain/core/world' // 引入：系统与世界类型

interface ScoreBoard { // 数据：双方比分（按类别与综合）
  killsA: number
  killsB: number
  obstaclesA: number // 障碍被摧毁个数（分值 = *2）
  obstaclesB: number
  totalA: number // 综合分 = killsA*1 + obstaclesA*2
  totalB: number
}

interface KillPayload { // 数据：击杀事件详情
  killerTeamId?: string
  killerId?: string
  victimTeamId?: string
  victimId?: string
  note?: string
}

interface StatsUpdate { // 数据：击杀引发的统计变更
  unitId?: string
  teamId?: string
  deltaKills?: number
  deltaDeaths?: number
  setHp?: number
}

const TEAM_LABELS: Record<string, string> = { teamA: '蓝队', teamB: '红队' }

/**
 * 创建计分系统
 * 返回：System —— 注册后自动处理击杀与比分广播
 */
export function scoreSystem(): System { // 导出：计分系统供装配阶段使用
  console.log('[计分] 计分系统已初始化（击杀+障碍）')

  const unitTeam = new Map<string, string>()
  const scores: ScoreBoard = { killsA: 0, killsB: 0, obstaclesA: 0, obstaclesB: 0, totalA: 0, totalB: 0 }

  const resolveTeamLabel = (teamId?: string) => TEAM_LABELS[teamId ?? ''] ?? teamId ?? '未知阵营'

  const emitScoreUpdate = (world: World, detail: KillPayload & { note?: string }) => {
    const payload = {
      // 综合分（供 UI/回合系统使用）
      teamA: scores.totalA,
      teamB: scores.totalB,
      // 明细：原始计数（UI 可据此计算三行文案）
      killsA: scores.killsA,
      killsB: scores.killsB,
      obstaclesA: scores.obstaclesA,
      obstaclesB: scores.obstaclesB,
      ...detail
    }
    world.bus.emit({ type: 'score/updated', payload })
    // console.log('[计分] 推送比分更新', payload)
  }

  const emitStatsUpdate = (world: World, updates: StatsUpdate[]) => {
    if (!updates.length) return
    world.bus.emit({ type: 'team/stats-update', payload: updates })
  }

  const resetScore = (world: World) => {
    scores.killsA = 0
    scores.killsB = 0
    scores.obstaclesA = 0
    scores.obstaclesB = 0
    scores.totalA = 0
    scores.totalB = 0
    emitScoreUpdate(world, { note: '比分重置' })
    console.log('[计分] 场景重置，比分归零')
  }

  const update: System['update'] = (dt, world) => {
    if ((update as { subscribed?: boolean }).subscribed) return
    (update as { subscribed?: boolean }).subscribed = true

    world.bus.on('team/unit-registered', (e) => {
      const payload = e.payload as { id?: string; teamId?: string }
      if (!payload?.id || !payload.teamId) return
      unitTeam.set(payload.id, payload.teamId)
      // console.log('[计分] 记录单位归属', payload)
    })

    world.bus.on('team/unit-removed', (e) => {
      const payload = e.payload as { id?: string }
      if (!payload?.id) return
      unitTeam.delete(payload.id)
      // console.log('[计分] 移除单位归属记录', payload)
    })

    world.bus.on('arena/reset', () => {
      resetScore(world)
    })

    world.bus.on('combat/enemy-removed', (e) => {
      // 已迁移至 combat/kill 事件处理；此处直接返回避免重复累计（尤其是被击杀次数）
      return
      const payload = e.payload as { id?: string }
      if (!payload?.id) {
        console.warn('[计分] 收到无效击败事件，缺少单位 ID', e.payload)
        return
      }
      const victimId = payload.id
      const victimTeamId = unitTeam.get(victimId) ?? 'teamA'
      const killerTeamId = victimTeamId === 'teamA' ? 'teamB' : 'teamA'
      const killerId = undefined // 只按阵营累计比分，不在此处绑定玩家击杀

      if (killerTeamId === 'teamA') {
        scores.teamA += 1
      } else if (killerTeamId === 'teamB') {
        scores.teamB += 1
      }

      const killerLabel = resolveTeamLabel(killerTeamId)
      const victimLabel = resolveTeamLabel(victimTeamId)
      console.log(`[计分] ${killerLabel} 击败 ${victimId}（${victimLabel}），比分 ${scores.teamA}:${scores.teamB}`)

      const statsUpdates: StatsUpdate[] = []
      if (killerId) {
        statsUpdates.push({ unitId: killerId, teamId: killerTeamId, deltaKills: 1 })
      }
      statsUpdates.push({ unitId: victimId, teamId: victimTeamId, deltaDeaths: 1, setHp: 0 })
      emitStatsUpdate(world, statsUpdates)

      emitScoreUpdate(world, { killerTeamId, killerId, victimTeamId, victimId })
    })

    // 新：统一由 combat/kill 更新队伍分与个人统计，并广播 score/updated
    world.bus.on('combat/kill', (e) => {
      const p = e.payload as { killerTeamId?: string; killerId?: string; victimTeamId?: string; victimId?: string } | undefined
      if (!p?.victimId) return
      const victimId = p.victimId
      const victimTeamId = (p.victimTeamId as string | undefined) ?? unitTeam.get(victimId) ?? 'teamA'
      const killerTeamId = (p.killerTeamId as string | undefined) ?? (victimTeamId === 'teamA' ? 'teamB' : 'teamA')
      const killerId = p.killerId // 只有明确击杀者时才计入个人击杀

      // 1) 击杀分累计（仅按击杀方阵营）
      if (killerTeamId === 'teamA') scores.killsA += 1
      else if (killerTeamId === 'teamB') scores.killsB += 1

      // 1.1) 重算综合分
      scores.totalA = scores.killsA + scores.obstaclesA * 2
      scores.totalB = scores.killsB + scores.obstaclesB * 2

      // 2) 个人统计（仅击杀者 + 受害者）
      const statsUpdates: StatsUpdate[] = []
      if (killerId) statsUpdates.push({ unitId: killerId, teamId: killerTeamId, deltaKills: 1 })
      statsUpdates.push({ unitId: victimId, teamId: victimTeamId, deltaDeaths: 1, setHp: 0 })
      emitStatsUpdate(world, statsUpdates)

      // 3) 广播比分更新（供 UI/回合系统使用）
      const killerLabel = resolveTeamLabel(killerTeamId)
      emitScoreUpdate(world, { killerTeamId, killerId, victimTeamId, victimId, note: `${killerLabel} 击杀 +1` })
      // console.log('[计分] 收到击杀，已更新队伍比分并广播', { teamA: scores.teamA, teamB: scores.teamB, killerTeamId, killerId, victimTeamId, victimId })
    })

    // 新：障碍摧毁事件 → 累计障碍分（+2）并广播综合比分
    world.bus.on('combat/obstacle-destroyed', (e) => {
      const p = e.payload as { killerTeamId?: string; killerId?: string; obstacleId?: string } | undefined
      const killerTeamId = (p?.killerTeamId as string | undefined) ?? 'teamA'
      if (killerTeamId === 'teamA') scores.obstaclesA += 1
      else if (killerTeamId === 'teamB') scores.obstaclesB += 1
      // 重算综合分
      scores.totalA = scores.killsA + scores.obstaclesA * 2
      scores.totalB = scores.killsB + scores.obstaclesB * 2
      const killerLabel = resolveTeamLabel(killerTeamId)
      emitScoreUpdate(world, { killerTeamId, killerId: p?.killerId, note: `${killerLabel} 摧毁障碍物 +2` })
    })
  }

  return { name: 'Score', update }
}
