# 领域核心：事件总线 (`event-bus.ts`)

`event-bus.ts` 是领域驱动设计中的一个关键组件，它提供了一个全局的事件发布/订阅机制。这使得项目中不同的模块和系统之间可以实现低耦合的通信。一个模块可以发布一个事件，而无需知道哪些模块会关心或响应这个事件。

## 核心设计

- **解耦**: 事件总线是实现模块间解耦的核心。例如，当战斗系统（`CombatSystem`）判定一个敌人被击败时，它只需发布一个 `combat/kill` 事件。计分系统（`ScoreSystem`）和重生系统（`RespawnSystem`）可以分别订阅这个事件来更新分数和安排重生，但战斗系统本身并不知道这两个系统的存在。
- **集中式通信**: 所有领域事件都通过同一个总线进行分发，便于调试和追踪数据流。可以很容易地在 `emit` 方法中加入日志，来监控整个游戏世界中发生的所有事件。

## 接口与实现

### `DomainEvent` 类型

定义了所有领域事件的基础结构。

- **`type: string`**:
  - **描述**: 事件的唯一标识符，通常采用 `domain/event-name` 的命名约定，例如 `combat/kill`, `arena/reset`。
- **`payload?: unknown`**:
  - **描述**: 可选。事件所携带的数据。它是一个灵活的 `unknown` 类型，具体的事件订阅者需要根据 `type` 来断言其具体的数据结构。

### `DomainEventBus` 接口

定义了事件总线必须提供的 API。

- **`emit(e: DomainEvent): void`**:
  - **描述**: 发布一个领域事件。所有订阅了该事件类型（`e.type`）的监听器都将被同步调用。
- **`on(type: string, fn: (e: DomainEvent) => void): () => void`**:
  - **描述**: 订阅一个特定类型的事件。
  - **参数**:
    - `type`: 要订阅的事件类型。
    - `fn`: 事件发生时要执行的回调函数。
  - **返回**: 一个“取消订阅”函数。调用此函数将移除本次订阅，避免内存泄漏。

### `createEventBus()` 工厂函数

创建一个事件总线的实例。

- **实现**: 内部使用一个 `Map<string, Set<Function>>` 来存储事件类型到监听器集合的映射。
- **`emit` 逻辑**: 查找对应事件类型的所有监听器，并依次执行它们。
- **`on` 逻辑**: 将监听器添加到一个 `Set` 中（`Set` 自动处理了重复添加的问题），并返回一个从该 `Set` 中删除此监听器的闭包函数。

## 使用流程

1.  **创建**: 在 `World` 对象被创建时，会同步创建一个 `DomainEventBus` 实例，并作为 `world.bus` 存在。
2.  **订阅**: 各个系统（`System`）在初始化时（通常是在它们的 `update` 方法第一次被调用时），通过 `world.bus.on(...)` 来订阅它们关心的事件。它们必须妥善保管返回的“取消订阅”函数，以便在系统被销毁时调用。
3.  **发布**: 当某个系统或服务的内部逻辑达到某个关键节点时，它会通过 `world.bus.emit(...)` 来发布一个事件，通知世界的其他部分。

**示例：**
```typescript
// ScoreSystem 订阅击杀事件
world.bus.on('combat/kill', (e) => {
  const payload = e.payload as { killerId: string, victimId: string };
  this.updateScores(payload.killerId);
});

// CombatSystem 发布击杀事件
if (enemy.hp <= 0) {
  world.bus.emit({
    type: 'combat/kill',
    payload: { killerId: 'player:1', victimId: enemy.id }
  });
}
```
