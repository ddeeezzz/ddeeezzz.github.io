/**
 * UI：对局结果覆盖层（胜利/失败/平局）
 * - 订阅 round/ended 事件，在 10s 结束后显示结果。
 */
import type { DomainEventBus } from '@domain/core/event-bus' // 引入：事件总线类型

interface MatchResultOptions { // 导出：结果面板构造参数
  playerTeamId?: 'teamA' | 'teamB'
}

/**
 * 创建对局结果覆盖层
 * 参数：
 * - root: HTMLElement — 宿主容器
 * - bus: DomainEventBus — 事件总线
 * - opts?: MatchResultOptions — 可选配置，默认玩家为 teamB
 * 返回：{ dispose }
 */
export function createMatchResultOverlay(root: HTMLElement, bus: DomainEventBus, opts?: MatchResultOptions) { // 导出：供装配阶段创建
  const playerTeam = opts?.playerTeamId ?? 'teamB'

  const overlay = document.createElement('div')
  overlay.style.position = 'fixed'
  overlay.style.inset = '0'
  overlay.style.display = 'none'
  overlay.style.alignItems = 'center'
  overlay.style.justifyContent = 'center'
  overlay.style.background = 'rgba(0,0,0,0.45)'
  overlay.style.backdropFilter = 'blur(2px)'
  overlay.style.zIndex = '10000'
  overlay.setAttribute('data-testid', 'result-overlay') // 测试标识：便于用例定位元素

  const box = document.createElement('div')
  box.style.padding = '18px 24px'
  box.style.borderRadius = '10px'
  box.style.background = 'rgba(0,0,0,0.7)'
  box.style.boxShadow = '0 6px 20px rgba(0,0,0,0.5)'
  box.style.color = '#fff'
  box.style.textAlign = 'center'
  box.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'

  const title = document.createElement('div')
  title.style.fontSize = '36px'
  title.style.fontWeight = '800'
  title.style.letterSpacing = '2px'
  title.style.marginBottom = '8px'

  const score = document.createElement('div')
  score.style.fontSize = '18px'
  score.style.opacity = '0.9'

  // 操作区：重新开始（刷新）按钮
  const actions = document.createElement('div')
  actions.style.marginTop = '12px'
  actions.style.display = 'flex'
  actions.style.justifyContent = 'center'
  actions.style.gap = '10px'
  const restartBtn = document.createElement('button')
  restartBtn.textContent = '重新开始'
  restartBtn.style.cursor = 'pointer'
  restartBtn.style.background = '#444'
  restartBtn.style.color = '#fff'
  restartBtn.style.border = '1px solid #666'
  restartBtn.style.borderRadius = '6px'
  restartBtn.style.padding = '6px 10px'
  restartBtn.addEventListener('click', () => {
    console.log('[UI] 重新开始（刷新界面）')
    try {
      restartBtn.disabled = true
      restartBtn.textContent = '正在刷新…'
    } catch {}
    try {
      window.location.reload()
    } catch (e) {
      console.error('[UI] 刷新失败', e)
    }
  })
  actions.appendChild(restartBtn)

  box.appendChild(title)
  box.appendChild(score)
  box.appendChild(actions)
  overlay.appendChild(box)
  root.appendChild(overlay)

  // 拦截输入：当覆盖层可见时，阻止鼠标与滚轮事件冒泡到 window，从而屏蔽输入适配器日志
  let loggedIntercept = false // 仅首次打印提示日志，避免刷屏
  const intercept = (e: Event) => {
    // 仅在覆盖层显示时拦截（冒泡阶段拦截，保证子元素仍能接收到事件，例如“重新开始”按钮）
    if (overlay.style.display !== 'none') {
      if (!loggedIntercept) {
        console.log('[UI] 结果覆盖层已激活，拦截输入事件（暂停）')
        loggedIntercept = true
      }
      try { e.stopPropagation() } catch {}
      // 避免页面滚动/默认菜单，仅对 wheel/contextmenu 阻止默认行为
      if (e.type === 'wheel' || e.type === 'contextmenu') {
        try { (e as Event & { preventDefault: () => void }).preventDefault() } catch {}
      }
    }
  }
  // 在冒泡阶段拦截，确保事件能到达按钮等子元素
  overlay.addEventListener('mousedown', intercept)
  overlay.addEventListener('mouseup', intercept)
  overlay.addEventListener('click', intercept)
  overlay.addEventListener('mousemove', intercept)
  overlay.addEventListener('wheel', intercept, { passive: false })
  overlay.addEventListener('contextmenu', intercept)

  const unsub = bus.on('round/ended', (e) => {
    const p = e.payload as { winnerTeam?: string; teamA?: number; teamB?: number } | undefined
    const a = typeof p?.teamA === 'number' ? p!.teamA : 0
    const b = typeof p?.teamB === 'number' ? p!.teamB : 0
    let text = '平局'
    if (p?.winnerTeam === 'teamA') text = playerTeam === 'teamA' ? '胜利' : '失败'
    else if (p?.winnerTeam === 'teamB') text = playerTeam === 'teamB' ? '胜利' : '失败'
    title.textContent = text
    score.textContent = `比分：蓝队 ${a} : 红队 ${b}`
    overlay.style.display = 'flex'
    // console.log('[UI] 对局结果显示', { text, teamA: a, teamB: b })
  })

  function dispose() { // 导出：销毁覆盖层
    try { unsub() } catch {}
    overlay.remove()
  }

  return { dispose }
}
