/**
 * TODO（阶段 1：世界与调度测试）
 * - 验证系统注册顺序与 step(dt) 的传递与执行。
 * - 使用最小端口集合与假系统。
 */
// 引入世界工厂与事件总线：用于创建可调度的 World
import { createWorld } from '../../src/domain/core/world'
import { createEventBus } from '../../src/domain/core/event-bus'

describe('World', () => {
  it('按注册顺序执行系统，且传递 dt', () => {
    const bus = createEventBus()
    const world = createWorld({ bus, ports: {} })
    const order = []
    const seenDt = []

    world.registerSystem({
      name: 'A',
      update: (dt) => {
        order.push('A')
        seenDt.push(dt)
      }
    })
    world.registerSystem({
      name: 'B',
      update: (dt) => {
        order.push('B')
        seenDt.push(dt)
      }
    })

    world.step(16)

    expect(order).toEqual(['A', 'B'])
    expect(seenDt.every((x) => x === 16)).toBe(true)
  })
})

