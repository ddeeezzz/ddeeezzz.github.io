/**
 * TODO（阶段 1：事件总线测试）
 * - 验证事件订阅/发布与取消订阅行为。
 * - 仅使用 Node 环境，不依赖 Three。
 */
// 引入事件总线工厂：用于创建可发布/订阅的总线实例
import { createEventBus } from '../../src/domain/core/event-bus'

describe('DomainEventBus', () => {
  it('emit 应触发订阅回调', () => {
    const bus = createEventBus()
    let called = 0
    bus.on('Ping', (e) => {
      expect(e.type).toBe('Ping')
      expect(e.payload).toEqual({ x: 1 })
      called++
    })
    bus.emit({ type: 'Ping', payload: { x: 1 } })
    expect(called).toBe(1)
  })

  it('取消订阅后不再触发', () => {
    const bus = createEventBus()
    let called = 0
    const off = bus.on('Once', () => {
      called++
    })
    off() // 取消订阅
    bus.emit({ type: 'Once' })
    expect(called).toBe(0)
  })
})

