/**
 * 面板：比分与击杀记录
 * - 固定显示蓝红双方比分
 * - 接收击杀事件并滚动展示最新记录
 */
// 引入：领域事件总线接口
import type { DomainEventBus } from '@domain/core/event-bus' // 引入：事件总线契约

interface ScoreboardOptions { // 配置：面板初始化参数
  maxKillLogs?: number
  teamLabels?: Record<string, string>
}

interface ScoreState { // 状态：存储比分数据（综合+明细）
  teamA: number // 综合分（用于总分展示）
  teamB: number
  killsA: number // 击杀原始计数（== 击杀分）
  killsB: number
  obstaclesA: number // 障碍原始计数（显示时×2）
  obstaclesB: number
}

export interface ScoreboardPanelHandle { // 导出：面板句柄供外部释放
  dispose(): void
}

/**
 * 创建比分面板并挂载至根节点
 * 参数：
 * - root: HTMLElement 根容器，用于承载 UI
 * - bus: DomainEventBus 领域事件总线
 * - opts: ScoreboardOptions 面板配置
 * 返回：ScoreboardPanelHandle 面板控制句柄
 */
export function createScoreboardPanel(root: HTMLElement, bus: DomainEventBus, opts?: ScoreboardOptions): ScoreboardPanelHandle { // 导出：比分面板供装配阶段调用
  const options: ScoreboardOptions = {
    maxKillLogs: opts?.maxKillLogs ?? 5,
    teamLabels: {
      teamA: '蓝队',
      teamB: '红队',
      ...opts?.teamLabels
    }
  }

  console.log('[UI] 比分面板初始化')

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '14px'
  container.style.left = '50%'
  container.style.transform = 'translateX(-50%)'
  container.style.zIndex = '9900'
  container.style.padding = '8px 16px'
  container.style.borderRadius = '12px'
  container.style.background = 'rgba(0,0,0,0.55)'
  container.style.color = '#f6f7fb'
  container.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  container.style.boxShadow = '0 3px 12px rgba(0,0,0,0.35)'
  container.style.minWidth = '240px'
  container.style.backdropFilter = 'blur(4px)'
  // 为容器添加 data-ui 标记，供其他 UI 组件（如快捷键提示）进行定位避让
  container.setAttribute('data-ui', 'scoreboard')

  const title = document.createElement('div')
  title.textContent = '战况概览'
  title.style.textAlign = 'center'
  title.style.fontWeight = '600'
  title.style.fontSize = '13px'
  title.style.marginBottom = '6px'
  container.appendChild(title)

  // 倒计时（显示在比分上方）
  const timeLine = document.createElement('div')
  timeLine.style.textAlign = 'center'
  timeLine.style.fontSize = '14px'
  timeLine.style.fontWeight = '700'
  timeLine.style.marginBottom = '4px'
  timeLine.textContent = '倒计时：--.-s'
  container.appendChild(timeLine)

  // 行：击杀分
  const killLine = document.createElement('div')
  killLine.style.display = 'flex'
  killLine.style.justifyContent = 'center'
  killLine.style.alignItems = 'baseline'
  killLine.style.gap = '8px'
  killLine.style.fontSize = '14px'
  container.appendChild(killLine)
  const killLabel = document.createElement('span')
  killLabel.textContent = '击杀分'
  killLabel.style.opacity = '0.85'
  const killValue = document.createElement('span')
  killValue.style.fontWeight = '700'
  killLine.appendChild(killLabel)
  killLine.appendChild(killValue)

  // 行：障碍分
  const obstLine = document.createElement('div')
  obstLine.style.display = 'flex'
  obstLine.style.justifyContent = 'center'
  obstLine.style.alignItems = 'baseline'
  obstLine.style.gap = '8px'
  obstLine.style.fontSize = '14px'
  container.appendChild(obstLine)
  const obstLabel = document.createElement('span')
  obstLabel.textContent = '障碍分'
  obstLabel.style.opacity = '0.85'
  const obstValue = document.createElement('span')
  obstValue.style.fontWeight = '700'
  obstLine.appendChild(obstLabel)
  obstLine.appendChild(obstValue)

  // 行：综合分（总分）
  const scoreLine = document.createElement('div')
  scoreLine.style.display = 'flex'
  scoreLine.style.justifyContent = 'center'
  scoreLine.style.alignItems = 'baseline'
  scoreLine.style.gap = '12px'
  scoreLine.style.fontSize = '18px'
  scoreLine.style.fontWeight = '700'
  container.appendChild(scoreLine)
  const leftLabel = document.createElement('span')
  leftLabel.style.color = '#5bc0ff'
  leftLabel.style.fontSize = '14px'
  const centerScore = document.createElement('span')
  centerScore.style.fontSize = '20px'
  centerScore.style.fontWeight = '800'
  const rightLabel = document.createElement('span')
  rightLabel.style.color = '#ff7a85'
  rightLabel.style.fontSize = '14px'
  scoreLine.appendChild(leftLabel)
  scoreLine.appendChild(centerScore)
  scoreLine.appendChild(rightLabel)

  const killListWrap = document.createElement('div')
  killListWrap.style.marginTop = '8px'
  killListWrap.style.maxHeight = '120px'
  killListWrap.style.overflow = 'hidden'

  const killList = document.createElement('ul')
  killList.style.listStyle = 'none'
  killList.style.padding = '0'
  killList.style.margin = '0'
  killList.style.display = 'flex'
  killList.style.flexDirection = 'column'
  killList.style.gap = '4px'

  killListWrap.appendChild(killList)
  container.appendChild(killListWrap)

  root.appendChild(container)

  const score: ScoreState = { teamA: 0, teamB: 0, killsA: 0, killsB: 0, obstaclesA: 0, obstaclesB: 0 }
  const unsubscribers: Array<() => void> = []

  const resolveLabel = (teamId?: string) => options.teamLabels?.[teamId ?? ''] ?? teamId ?? '未知阵营'

  const refreshScoreText = () => {
    leftLabel.textContent = resolveLabel('teamA')
    rightLabel.textContent = resolveLabel('teamB')
    centerScore.textContent = `${score.teamA} : ${score.teamB}`
    killValue.textContent = `${resolveLabel('teamA')} ${score.killsA} : ${resolveLabel('teamB')} ${score.killsB}`
    const obstA = score.obstaclesA * 2
    const obstB = score.obstaclesB * 2
    obstValue.textContent = `${resolveLabel('teamA')} ${obstA} : ${resolveLabel('teamB')} ${obstB}`
    // console.log('[UI] 比分更新', { teamA: score.teamA, teamB: score.teamB })
  }

  const appendKillLog = (detail: { killerTeamId?: string; killerId?: string; victimTeamId?: string; victimId?: string; note?: string }) => {
    const item = document.createElement('li')
    item.style.fontSize = '12px'
    item.style.lineHeight = '16px'
    item.style.whiteSpace = 'nowrap'
    const killerTeam = resolveLabel(detail.killerTeamId)
    const victimTeam = resolveLabel(detail.victimTeamId)
    const killerText = detail.killerId ? `${killerTeam}（${detail.killerId}）` : killerTeam
    const victimText = detail.victimId ? `${victimTeam}（${detail.victimId}）` : victimTeam
    item.textContent = detail.note ?? `${killerText} 击败了 ${victimText}`
    killList.insertBefore(item, killList.firstChild)
    while (killList.childElementCount > (options.maxKillLogs ?? 5)) {
      killList.removeChild(killList.lastChild as HTMLElement)
    }
    // console.log('[UI] 击杀记录更新', detail)
  }

  refreshScoreText()

  unsubscribers.push(
    bus.on('score/updated', (e) => {
      const payload = e.payload as { teamA?: number; teamB?: number; killerTeamId?: string; killerId?: string; victimTeamId?: string; victimId?: string; note?: string } | undefined
      if (!payload) return
      if (typeof payload.teamA === 'number') score.teamA = payload.teamA
      if (typeof payload.teamB === 'number') score.teamB = payload.teamB
      // 新增：读取明细（若不存在则保持默认 0）
      if (typeof (payload as any).killsA === 'number') score.killsA = (payload as any).killsA as number
      if (typeof (payload as any).killsB === 'number') score.killsB = (payload as any).killsB as number
      if (typeof (payload as any).obstaclesA === 'number') score.obstaclesA = (payload as any).obstaclesA as number
      if (typeof (payload as any).obstaclesB === 'number') score.obstaclesB = (payload as any).obstaclesB as number
      refreshScoreText()
      if (payload.killerTeamId || payload.victimTeamId || payload.note) {
        appendKillLog({
          killerTeamId: payload.killerTeamId,
          killerId: payload.killerId,
          victimTeamId: payload.victimTeamId,
          victimId: payload.victimId,
          note: payload.note
        })
      }
    })
  )

  unsubscribers.push(
    bus.on('arena/reset', () => {
      score.teamA = 0
      score.teamB = 0
      score.killsA = 0
      score.killsB = 0
      score.obstaclesA = 0
      score.obstaclesB = 0
      refreshScoreText()
      killList.innerHTML = ''
      console.log('[UI] 比分面板已重置')
    })
  )

  // 订阅回合计时，刷新倒计时文本
  unsubscribers.push(
    bus.on('round/time', (e) => {
      const p = e.payload as { remainingSeconds?: number; durationSeconds?: number } | undefined
      if (typeof p?.remainingSeconds === 'number') {
        const s = Math.max(0, p.remainingSeconds)
        timeLine.textContent = `倒计时：${s.toFixed(1)}s`
      }
    })
  )

  unsubscribers.push(
    bus.on('round/ended', (e) => {
      const p = e.payload as { duration?: number } | undefined
      const dur = typeof p?.duration === 'number' ? p!.duration : undefined
      timeLine.textContent = `倒计时：0.0s${dur ? ` / ${dur}s` : ''}`
    })
  )

  // 重置时清空倒计时
  unsubscribers.push(
    bus.on('arena/reset', () => {
      timeLine.textContent = '倒计时：--.-s'
    })
  )

  const dispose = () => {
    console.log('[UI] 销毁比分面板')
    container.remove()
    unsubscribers.splice(0).forEach((off) => off())
  }

  return { dispose }
}
