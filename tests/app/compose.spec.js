/**
 * TODO（阶段 2：渲染冒烟测试）
 * - 使用假 RenderPort 验证 composeApp 的循环会调用 render，并推进 world.step。
 * - 采用 jsdom 环境提供 DOM 容器，但不依赖 Three。
 */
// @vitest-environment jsdom

// 引入 composeApp：应用组合根，用于装配世界与循环
import { composeApp } from '../../src/app/setup.ts'

/** 创建一个假渲染端口，记录调用并手动触发帧 */
function createFakeRender() {
  let cb = null
  return {
    requestFrame(fn) {
      cb = fn // 记录回调，测试中手动触发
    },
    renderCalls: 0,
    render() {
      this.renderCalls++
    },
    resize() {},
    applyCamera() {},
    dispose() {},
    _fire(t = 0) {
      if (cb) cb(t)
    }
  }
}

describe('composeApp 渲染冒烟', () => {
  it('首次帧回调触发后应调用 render 且推进 world.step', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const fake = createFakeRender()
    const { world } = await composeApp(root, { render: fake })

    let ticks = 0
    world.registerSystem({
      name: 'Tick',
      update: () => {
        ticks++
      }
    })

    // 触发一次帧
    fake._fire(16)

    expect(fake.renderCalls).toBe(1)
    expect(ticks).toBe(1)
  })
})

