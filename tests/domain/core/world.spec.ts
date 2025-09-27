/**
 * 测试 createWorld 的核心生命周期行为。
 */
// 引入 Vitest 工具方法，用于编写单元测试断言与伪函数
import { describe, it, expect, vi } from 'vitest'
// 引入领域事件总线类型，确保测试桩实现契约一致
import type { DomainEventBus } from '@domain/core/event-bus'
// 引入 createWorld 工厂函数，验证销毁实体时的事件广播逻辑
import { createWorld } from '@domain/core/world'

describe('createWorld 销毁流程', () => {
  it('调用 destroyEntity 会通过事件总线广播实体销毁事件', () => {
    const emitSpy = vi.fn()
    const stopListening = () => {}
    const bus: DomainEventBus = {
      emit: emitSpy,
      on: vi.fn().mockReturnValue(stopListening)
    }

    const world = createWorld({ bus, ports: {} })
    world.destroyEntity('enemy-01')

    expect(emitSpy).toHaveBeenCalledTimes(1)
    expect(emitSpy).toHaveBeenCalledWith({
      type: 'entity/destroyed',
      payload: { id: 'enemy-01' }
    })
  })
})
