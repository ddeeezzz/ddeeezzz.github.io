/**
 * 组件：快捷键提示条
 * - 固定显示在顶部，位于“玩家状态栏（左上）”与“比分面板（顶中）”之间。
 * - 自动避让：根据 player-stats 与 scoreboard 的 DOM 位置计算合适的 left。
 * - 监听窗口尺寸变化与比分更新事件，动态重算位置。
 */
// 引入：领域事件总线类型（可选，便于订阅比分更新触发重排）
import type { DomainEventBus } from '@domain/core/event-bus' // 引入：事件总线契约（可选依赖，仅用于监听重排时机）

export interface HotkeyHintHandle { // 导出：组件句柄，供应用装配/销毁阶段使用
  /** 销毁组件并移除事件监听 */
  dispose(): void
}

/**
 * 创建快捷键提示组件
 * 参数：
 * - root: 根节点，用于挂载 DOM
 * - bus: 可选事件总线，用于订阅比分/时间变化以触发重排
 * - text: 提示文本（默认："WASD/左键移动，右键攻击，Q/E/鼠标移动旋转"）
 * 返回：HotkeyHintHandle，用于释放资源
 */
export function createHotkeyHint(
  root: HTMLElement,
  bus?: DomainEventBus,
  text: string = 'WASD/左键移动，右键攻击，Q/E/鼠标移动旋转'
): HotkeyHintHandle { // 导出：创建函数供装配阶段调用
  console.log('[UI] 快捷键提示初始化')

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '16px'
  container.style.left = '240px' // 初始左距，后续会基于测量重算
  container.style.zIndex = '9890' // 比比分面板略低，避免覆盖关键信息
  container.style.padding = '8px 12px'
  container.style.borderRadius = '10px'
  container.style.background = 'rgba(0,0,0,0.45)'
  container.style.color = '#f6f7fb'
  container.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  container.style.fontSize = '14px'
  container.style.lineHeight = '20px'
  container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)'
  container.style.backdropFilter = 'blur(4px)'
  container.style.pointerEvents = 'none' // 不拦截鼠标交互
  container.setAttribute('data-ui', 'hotkey-hint')

  const label = document.createElement('div')
  label.textContent = text
  label.style.fontWeight = '700' // 中文：加粗以强化可读性
  container.appendChild(label)

  // 中文日志：样式调整记录，便于上线后排查
  console.log('[UI] 快捷键提示样式调整：字号=14px，加粗')

  root.appendChild(container)

  // —— 定位计算 ——
  const SAFE_LEFT = 220 // 未能测量到其他面板时的安全左距
  const GAP = 12 // 与相邻面板的左右间距

  const measureAndPlace = () => {
    try {
      const statsEl = document.querySelector('[data-ui="player-stats"]') as HTMLElement | null
      const scoreEl = document.querySelector('[data-ui="scoreboard"]') as HTMLElement | null
      const rectHint = container.getBoundingClientRect()
      const widthHint = rectHint.width || container.offsetWidth || 160

      // 目标：尽量放在 stats 右侧与 scoreboard 左侧之间
      let left = SAFE_LEFT
      if (statsEl) {
        const r = statsEl.getBoundingClientRect()
        left = Math.max(left, (r.right || 0) + GAP)
      }

      // 若会与比分面板重叠，则将其左移到比分左侧以保持 GAP
      if (scoreEl) {
        const r = scoreEl.getBoundingClientRect()
        const overlapRight = left + widthHint
        if (overlapRight > r.left - GAP) {
          left = Math.max(GAP, r.left - widthHint - GAP)
        }
      }

      // 边界保护：不超出窗口宽度
      const winW = window.innerWidth || 800
      if (left + widthHint + GAP > winW) {
        left = Math.max(GAP, winW - widthHint - GAP)
      }

      container.style.left = `${Math.round(left)}px`
      // console.log('[UI] 快捷键提示重新定位', { left: Math.round(left), width: Math.round(widthHint) })
    } catch (e) {
      console.warn('[UI] 快捷键提示定位失败，采用安全左距', e)
      container.style.left = `${SAFE_LEFT}px`
    }
  }

  // 初次与下一帧测量，确保布局稳定后计算
  measureAndPlace()
  const rafId = requestAnimationFrame(() => measureAndPlace())

  // 窗口尺寸变化时重排
  const onResize = () => measureAndPlace()
  window.addEventListener('resize', onResize)

  // 订阅比分/时间更新，触发重排（可选）
  const unsubs: Array<() => void> = []
  if (bus && (bus as any).on) {
    const off1 = bus.on('score/updated', () => measureAndPlace())
    const off2 = bus.on('round/time', () => measureAndPlace())
    const off3 = bus.on('arena/reset', () => setTimeout(measureAndPlace, 0))
    unsubs.push(off1, off2, off3)
  }

  const dispose = () => {
    console.log('[UI] 销毁快捷键提示')
    window.removeEventListener('resize', onResize)
    unsubs.splice(0).forEach((off) => {
      try { off() } catch {}
    })
    try { cancelAnimationFrame(rafId) } catch {}
    container.remove()
  }

  return { dispose }
}
