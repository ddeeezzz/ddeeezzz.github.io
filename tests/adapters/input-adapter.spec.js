/**
 * TODO（阶段 4：输入适配器测试）
 * - 验证键盘按键聚合（WASD/方向键）、鼠标增量与滚轮。
 * - 每帧重置后增量应清零，pressed 集合应保留。
 */
// @vitest-environment jsdom

// 引入浏览器输入适配器：监听 DOM 事件生成输入状态
import { createBrowserInputAdapter } from '../../src/adapters/browser/input-adapter.ts'

describe('BrowserInputAdapter', () => {
  it('WASD/方向键应聚合为正确的轴值', () => {
    const adapter = createBrowserInputAdapter()
    // 模拟按下 W 与 D
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }))
    const s1 = adapter.getState()
    expect(s1.axes).toEqual({ x: 1, y: 1 })
    // 松开 D，按下左方向键
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }))
    const s2 = adapter.getState()
    expect(s2.axes).toEqual({ x: -1, y: 1 })
  })

  it('鼠标与滚轮增量应累计，并在 reset 后清零', () => {
    const adapter = createBrowserInputAdapter()
    // 需两次事件以便基于 clientX/Y 计算增量
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 110, clientY: 95 }))
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }))
    const s1 = adapter.getState()
    expect(s1.yawDelta).toBeGreaterThan(0)
    expect(s1.pitchDelta).toBeGreaterThan(0) // 上移 100→95，取反为正
    expect(s1.wheelDelta).toBeGreaterThan(0)
    adapter.resetFrameDeltas()
    const s2 = adapter.getState()
    expect(s2.yawDelta).toBe(0)
    expect(s2.pitchDelta).toBe(0)
    expect(s2.wheelDelta).toBe(0)
  })
})
