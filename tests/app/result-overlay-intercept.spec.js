/**
 * 验证：结果覆盖层显示后，鼠标事件不再冒泡到 window（从而不会触发输入适配器日志）。
 */
// @vitest-environment jsdom

import { composeApp } from '../../src/app/setup.ts' // 引入：应用装配入口

function createFakeRender() {
  let cb = null
  return {
    requestFrame(fn) { cb = fn },
    render() {},
    resize() {},
    applyCamera() {},
    dispose() {},
    _fire(t = 0) { const f = cb; cb = null; if (f) f(t) }
  }
}

describe('结果覆盖层输入拦截', () => {
  it('round/ended 后在覆盖层上点击不应冒泡到 window', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const fake = createFakeRender()

    const { world } = await composeApp(root, { render: fake })

    // 触发一帧，完成装配与订阅
    fake._fire(16)

    // 让覆盖层显示
    world.bus.emit({ type: 'round/ended', payload: { winnerTeam: 'teamB', teamA: 1, teamB: 2 } })

    const overlay = root.querySelector('[data-testid="result-overlay"]')
    expect(overlay).not.toBeNull()

    let windowMouseCount = 0
    window.addEventListener('mousedown', () => { windowMouseCount++ })

    // 在覆盖层上派发鼠标事件（应被捕获并阻止冒泡）
    const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    overlay.dispatchEvent(evt)

    expect(windowMouseCount).toBe(0)
  })
})
