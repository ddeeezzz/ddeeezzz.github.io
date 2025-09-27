/**
 * 场景：回合结束后应停止继续调度（方案A）
 * - 使用假 RenderPort：每次触发当前帧回调后清空回调，只有当循环再次调用 requestFrame 才会注册新的回调。
 * - 在世界更新阶段内主动发出 round/ended，验证循环不再注册下一帧。
 */
// @vitest-environment jsdom

// 引入 composeApp：应用装配根
import { composeApp } from '../../src/app/setup.ts'

/** 创建带“清空回调”特性的假渲染端口 */
function createFakeRender() {
  /** @type {null | ((t?: number)=>void)} */
  let cb = null
  return {
    /** 注册下一帧回调 */
    requestFrame(fn) {
      cb = fn
    },
    /** 统计：render 调用次数 */
    renderCalls: 0,
    /** 渲染 */
    render() {
      this.renderCalls++
    },
    resize() {},
    applyCamera() {},
    dispose() {},
    /** 触发当前帧，并在触发前清空回调以便观察是否被重新注册 */
    _fire(t = 0) {
      const fn = cb
      cb = null // 清空，若循环末尾未再次调用 requestFrame，则保持为 null
      if (fn) fn(t)
    },
    /** 查询：是否已有下一帧回调被注册 */
    _hasNext() {
      return cb != null
    }
  }
}

describe('对局结束后暂停循环', () => {
  it('收到 round/ended 后不再注册下一帧', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const fake = createFakeRender()

    const { world } = await composeApp(root, { render: fake })

    // 在下一次 world.step 中发出 round/ended 事件
    let emitted = false
    world.registerSystem({
      name: 'EmitRoundEnd',
      update: (_dt, w) => {
        if (!emitted) {
          emitted = true
          w.bus.emit({ type: 'round/ended', payload: { winnerTeam: 'teamB', teamA: 1, teamB: 2 } })
        }
      }
    })

    // 触发一帧：系统会在本帧发出 round/ended，循环应在本帧末停止继续调度
    fake._fire(16)

    // 断言：无下一帧回调已注册（即未再次 requestFrame）
    expect(fake._hasNext()).toBe(false)

    // 渲染至少被调用 1 次
    expect(fake.renderCalls).toBeGreaterThan(0)
  })
})

