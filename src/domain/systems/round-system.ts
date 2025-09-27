/**
 * 系统：回合计时（10s 一局）
 * - 在固定时长内（默认 10 秒）推进计时；到时根据比分判定胜负并广播结果。
 * - 比分来源：订阅 score/updated 事件，缓存最新 teamA/teamB 分数。
 */
import type { System, World } from '@domain/core/world' // 引入：系统/世界类型

interface RoundConfig { // 导出：回合配置（供装配层传入）
  durationSeconds: number
}

/**
 * 创建回合计时系统
 * 返回：System — 注册后自动推进计时并在结束时广播 round/ended
 */
export function roundSystem(cfg: RoundConfig): System { // 导出：回合系统供装配阶段使用
  console.log('[回合] 回合计时系统已初始化', cfg)

  let timeLeft = Math.max(0, cfg.durationSeconds)
  let running = true
  let scoreA = 0
  let scoreB = 0

  const reset = (duration?: number) => {
    timeLeft = Math.max(0, duration ?? cfg.durationSeconds)
    running = true
    console.log('[回合] 计时已重置', { timeLeft })
  }

  const emitTime = (world: World) => {
    const remain = Math.max(0, timeLeft)
    world.bus.emit({ type: 'round/time', payload: { remainingSeconds: remain, durationSeconds: cfg.durationSeconds } })
  }

  const update: System['update'] = (dt, world: World) => {
    if (!(update as { sub?: boolean }).sub) {
      (update as { sub?: boolean }).sub = true

      // 订阅比分更新：缓存最新比分
      world.bus.on('score/updated', (e) => {
        const p = e.payload as { teamA?: number; teamB?: number }
        if (typeof p?.teamA === 'number') scoreA = p.teamA
        if (typeof p?.teamB === 'number') scoreB = p.teamB
      })

      // 场景重置：重开一局
      world.bus.on('arena/reset', () => {
        reset()
        emitTime(world)
      })
      // 初始广播一次时间，便于 UI 显示
      emitTime(world)
    }

    if (!running) return
    if (dt <= 0) return
    timeLeft -= dt
    emitTime(world)
    if (timeLeft > 0) return

    // 到时判定胜负：玩家为 teamB
    running = false
    const winnerTeam = scoreA === scoreB ? 'draw' : scoreB > scoreA ? 'teamB' : 'teamA'
    world.bus.emit({ type: 'round/ended', payload: { winnerTeam, teamA: scoreA, teamB: scoreB, duration: cfg.durationSeconds } })
    console.log('[回合] 回合结束', { winnerTeam, teamA: scoreA, teamB: scoreB })
  }

  return { name: 'Round', update }
}
