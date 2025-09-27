/**
 * 面板：玩家统计
 * - 显示玩家血量、击杀数与被击杀数
 * - 监听队伍快照与统计更新事件
 */
import type { DomainEventBus } from '@domain/core/event-bus' // 引入：事件总线契约

export interface PlayerStatsPanelHandle { // 导出：面板句柄供外部释放
  dispose(): void
}

interface PlayerStats { // 数据：玩家统计快照
  hp: number
  kills: number
  deaths: number
}

const DEFAULT_STATS: PlayerStats = { hp: 0, kills: 0, deaths: 0 }

const formatNumber = (value: number) => Number.isFinite(value) ? value : 0

/**
 * 创建玩家统计面板
 * 参数：
 * - root: 根节点，用于挂载 DOM
 * - bus: 事件总线，用于监听领域事件
 * - opts: 额外配置，如玩家 ID
 * 返回：PlayerStatsPanelHandle，用于释放资源
 */
export function createPlayerStatsPanel(
  root: HTMLElement,
  bus: DomainEventBus,
  opts?: { playerId?: string }
): PlayerStatsPanelHandle { // 导出：玩家统计面板供装配阶段调用
  const playerId = opts?.playerId ?? 'player:1'
  console.log('[UI] 玩家统计面板初始化', { playerId })

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '16px'
  container.style.left = '16px'
  container.style.zIndex = '9950'
  container.style.padding = '12px 16px'
  container.style.background = 'rgba(0,0,0,0.55)'
  container.style.color = '#f1f3f8'
  container.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  container.style.fontSize = '14px'
  container.style.borderRadius = '10px'
  container.style.boxShadow = '0 2px 12px rgba(0,0,0,0.35)'
  container.style.backdropFilter = 'blur(4px)'
  // 为容器添加 data-ui 标记，供其他 UI 组件（如快捷键提示）进行定位避让
  container.setAttribute('data-ui', 'player-stats')

  const title = document.createElement('div')
  title.textContent = '玩家状态'
  title.style.fontWeight = '600'
  title.style.marginBottom = '6px'
  container.appendChild(title)

  const hpRow = document.createElement('div')
  hpRow.textContent = '血量：0'
  container.appendChild(hpRow)

  const killRow = document.createElement('div')
  killRow.textContent = '击杀：0'
  container.appendChild(killRow)

  const deathRow = document.createElement('div')
  deathRow.textContent = '被击杀：0'
  container.appendChild(deathRow)

  root.appendChild(container)

  const stats: PlayerStats = { ...DEFAULT_STATS }

  const applyStats = (next: PlayerStats) => {
    stats.hp = formatNumber(next.hp)
    stats.kills = formatNumber(next.kills)
    stats.deaths = formatNumber(next.deaths)
    hpRow.textContent = `血量：${stats.hp}`
    killRow.textContent = `击杀：${stats.kills}`
    deathRow.textContent = `被击杀：${stats.deaths}`
    // console.log('[UI] 玩家统计更新', { playerId, ...stats })
  }

  const resetStats = () => {
    applyStats(DEFAULT_STATS)
    console.log('[UI] 玩家统计面板已重置')
  }

  const unsubscribers: Array<() => void> = []

  unsubscribers.push(
    bus.on('team/state', (e) => {
      const payload = e.payload as {
        teams?: Record<string, { units: { id: string; hp?: number; kills?: number; deaths?: number }[] }>
      }
      const teams = payload?.teams
      if (!teams) return
      for (const info of Object.values(teams)) {
        const unit = info.units.find((item) => item.id === playerId)
        if (unit) {
          applyStats({
            hp: formatNumber(unit.hp ?? stats.hp),
            kills: formatNumber(unit.kills ?? stats.kills),
            deaths: formatNumber(unit.deaths ?? stats.deaths)
          })
          return
        }
      }
    })
  )

  unsubscribers.push(
    bus.on('team/stats-update', (e) => {
      const updates = e.payload as StatsUpdate[] | undefined
      if (!updates) return
      updates.forEach((update) => {
        if (update.unitId !== playerId) return
        applyStats({
          hp: typeof update.setHp === 'number' ? update.setHp : stats.hp,
          kills: stats.kills + (update.deltaKills ?? 0),
          deaths: stats.deaths + (update.deltaDeaths ?? 0)
        })
      })
    })
  )

  unsubscribers.push(
    bus.on('arena/reset', () => {
      resetStats()
    })
  )

  const dispose = () => {
    console.log('[UI] 销毁玩家统计面板')
    container.remove()
    unsubscribers.splice(0).forEach((off) => off())
  }

  return { dispose }
}

interface StatsUpdate { // 内部：统计更新条目
  unitId?: string
  deltaKills?: number
  deltaDeaths?: number
  setHp?: number
}
