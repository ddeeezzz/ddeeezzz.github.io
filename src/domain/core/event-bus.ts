/**
 * TODO（阶段 1：事件总线）
 * - 定义领域事件的发布/订阅接口，提供最小实现。
 * - 后续支持一次性订阅、优先级与回放以增强测试性。
 */
export type DomainEvent = { type: string; payload?: unknown } // 导出：领域事件类型

export interface DomainEventBus { // 导出：事件总线契约
  emit: (e: DomainEvent) => void
  on: (type: string, fn: (e: DomainEvent) => void) => () => void
}

/**
 * 创建事件总线：提供基础的发布/订阅能力。
 * 返回：DomainEventBus —— emit/on API 与取消订阅句柄。
 */
export function createEventBus(): DomainEventBus {
  const map = new Map<string, Set<(e: DomainEvent) => void>>()
  console.log('[事件] 事件总线已创建')
  return {
    emit: (e) => {
      const set = map.get(e.type)
      if (!set) return
      set.forEach((fn) => fn(e))
    },
    on: (type, fn) => {
      if (!map.has(type)) map.set(type, new Set())
      map.get(type)!.add(fn)
      return () => map.get(type)!.delete(fn)
    }
  }
}
