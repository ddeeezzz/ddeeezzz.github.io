/**
 * 面板：玩家重生提示
 * - 死亡后显示倒计时与出生点信息
 * - 重生完成或场景重置时自动隐藏
 */
// 引入：事件总线接口
import type { DomainEventBus } from '@domain/core/event-bus' // 引入：事件总线契约

interface RespawnHudOptions { // 配置：重生提示参数
  playerId?: string
  spawnPointLabels?: Record<string, string>
}

export interface RespawnHudHandle { // 导出：HUD 句柄供外部释放
  dispose(): void
  showImmediate(message: string): void
  hide(): void
}

/**
 * 创建重生提示 HUD 并挂载至根节点
 * 参数：
 * - root: HTMLElement 根容器
 * - bus: DomainEventBus 事件总线
 * - opts: RespawnHudOptions 自定义配置
 * 返回：RespawnHudHandle 控制句柄
 */
export function createRespawnHud(root: HTMLElement, bus: DomainEventBus, opts?: RespawnHudOptions): RespawnHudHandle { // 导出：供装配阶段调用
  const playerId = opts?.playerId ?? 'player:1'
  const labels = opts?.spawnPointLabels ?? {}

  console.log('[UI] 重生 HUD 初始化')

  const overlay = document.createElement('div')
  overlay.style.position = 'fixed'
  overlay.style.top = '50%'
  overlay.style.left = '50%'
  overlay.style.transform = 'translate(-50%, -50%)'
  overlay.style.padding = '18px 28px'
  overlay.style.background = 'rgba(0, 0, 0, 0.65)'
  overlay.style.borderRadius = '16px'
  overlay.style.color = '#f7f9fc'
  overlay.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  overlay.style.fontSize = '20px'
  overlay.style.fontWeight = '600'
  overlay.style.letterSpacing = '0.5px'
  overlay.style.textAlign = 'center'
  overlay.style.pointerEvents = 'none'
  overlay.style.zIndex = '12000'
  overlay.style.display = 'none'

  const info = document.createElement('div')
  info.textContent = '准备中…'
  overlay.appendChild(info)

  root.appendChild(overlay)

  let visible = false
  let currentUnit: string | null = null

  const ensureVisible = () => {
    if (!visible) {
      overlay.style.display = 'block'
      visible = true
    }
  }

  const hideOverlay = () => {
    if (visible) {
      overlay.style.display = 'none'
      visible = false
      currentUnit = null
    }
  }

  const formatSpawnLabel = (spawnId?: string) => {
    if (!spawnId) return '默认出生点'
    return labels[spawnId] ?? spawnId
  }

  const unsubscribers: Array<() => void> = []

  unsubscribers.push(
    bus.on('respawn/countdown', (e) => {
      const payload = e.payload as { unitId?: string; teamId?: string; remainingSeconds?: number; spawnPointId?: string } | undefined
      if (!payload?.unitId || payload.unitId !== playerId) return
      currentUnit = payload.unitId
      const seconds = typeof payload.remainingSeconds === 'number' ? Math.max(0, payload.remainingSeconds) : 0
      const spawnLabel = formatSpawnLabel(payload.spawnPointId)
      info.textContent = `${seconds.toFixed(1)} 秒后将在 ${spawnLabel} 重生`
      ensureVisible()
      // console.log('[UI] 重生倒计时更新', { unitId: payload.unitId, seconds, spawnLabel })
    })
  )

  unsubscribers.push(
    bus.on('respawn/ready', (e) => {
      const payload = e.payload as { unitId?: string; spawnPointId?: string } | undefined
      if (!payload?.unitId || payload.unitId !== playerId) return
      currentUnit = payload.unitId
      const spawnLabel = formatSpawnLabel(payload.spawnPointId)
      info.textContent = `即将在 ${spawnLabel} 重生`
      ensureVisible()
      console.log('[UI] 重生准备完成', { unitId: payload.unitId, spawnLabel })
    })
  )

  unsubscribers.push(
    bus.on('respawn/complete', (e) => {
      const payload = e.payload as { unitId?: string } | undefined
      if (!payload?.unitId || payload.unitId !== playerId) return
      console.log('[UI] 重生完成，隐藏提示', { unitId: payload.unitId })
      hideOverlay()
    })
  )

  unsubscribers.push(
    bus.on('arena/reset', () => {
      console.log('[UI] 场景重置，关闭重生提示')
      hideOverlay()
    })
  )

  const dispose = () => {
    console.log('[UI] 销毁重生 HUD')
    overlay.remove()
    unsubscribers.splice(0).forEach((off) => off())
  }

  const showImmediate = (message: string) => {
    info.textContent = message
    ensureVisible()
    console.log('[UI] 重生 HUD 手动显示', { message })
  }

  const manualHide = () => {
    hideOverlay()
    console.log('[UI] 重生 HUD 手动隐藏', { unit: currentUnit })
  }

  return { dispose, showImmediate, hide: manualHide }
}
