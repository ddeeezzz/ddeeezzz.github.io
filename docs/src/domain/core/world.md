# 领域核心：世界 (`world.ts`)

`world.ts` 文件定义了项目的核心容器和调度器——`World`对象。在实体-组件-系统（ECS）架构思想的启发下，`World` 扮演着中心枢纽的角色，它聚合了所有系统（Systems）、外部接口（Ports）和事件总线（Event Bus），并负责驱动整个游戏世界的逻辑更新。

## 核心设计

- **中心容器**: `World` 对象本身不包含太多逻辑，但它是一个关键的“聚合根”。它持有对所有活动系统、所有外部端口以及全局事件总线的引用。
- **系统调度器**: `World` 的核心职责是调度。它的 `step(dt)` 方法会遍历所有已注册的系统，并按顺序调用它们的 `update(dt, world)` 方法，从而推动游戏状态逐帧前进。
- **依赖注入中心**: `World` 对象在创建时接收 `Ports` 和 `EventBus` 作为参数。当它被传递给每个系统的 `update` 方法时，它就充当了一个依赖注入容器，使得任何系统都能访问到如输入、渲染、物理等外部能力，或是发布/订阅领域事件。

## 接口与实现

### `EntityId` 类型

实体的唯一标识符。当前实现为 `number`，但未来可以增强为更安全的“品牌化类型”以避免与其他数字混淆。

### `System` 接口

定义了所有系统（游戏逻辑单元）必须遵循的契约。

- **`name: string`**: 系统的名称，主要用于调试和日志记录。
- **`update(dt: number, world: World): void`**:
  - **描述**: 系统的核心更新函数，每帧被 `World` 的 `step` 方法调用。
  - **参数**:
    - `dt`: 时间增量（delta time），表示自上一帧以来经过的时间（秒）。所有与时间相关的计算（如移动、冷却）都应基于 `dt`。
    - `world`: `World` 对象的实例，用于访问端口、事件总线或其他系统（如果需要）。

### `Ports` 接口

一个聚合了所有外部接口（端口）的集合。这使得 `World` 可以将所有外部依赖作为一个整体进行管理。

- **`render?: unknown`**: 渲染端口（详见 `render.md`）。
- **`input?: InputPort`**: 输入端口（详见 `input.md`）。
- **`rng?: RngPort`**: 随机数端口（详见 `rng.md`）。
- **`physics?: PhysicsPort`**: 物理端口（详见 `physics.md`）。
- *(未来可扩展其他端口，如音频、网络等)*

### `World` 接口

定义了 `World` 对象的核心 API。

- **`bus: DomainEventBus`**: 全局事件总线实例（详见 `event-bus.md`）。
- **`ports: Ports`**: 外部端口的集合。
- **`registerSystem(sys: System): void`**: 用于将一个系统注册到世界中。系统将按照注册的顺序被执行。
- **`step(dt: number): void`**: 驱动世界前进一个时间步。它会按顺序调用所有已注册系统的 `update` 方法。
- **`destroyEntity(id: string): void`**: 一个辅助方法，用于请求销毁一个实体。它并不直接执行销毁操作，而是发布一个 `entity/destroyed` 事件，让关心此事件的系统（如 `TeamManager`, `RenderSyncSystem`）去执行具体的清理逻辑。

### `createWorld()` 工厂函数

用于创建 `World` 实例的函数。

- **参数**: 接收一个包含 `bus` 和 `ports` 的配置对象。
- **逻辑**:
  1.  初始化一个空的系统数组 `systems`。
  2.  返回一个实现了 `World` 接口的对象。
  3.  `registerSystem` 方法会将系统推入 `systems` 数组。
  4.  `step` 方法会遍历 `systems` 数组并执行每个系统的 `update`。

## 使用流程

1.  **装配**: 在应用的顶层（`setup.ts`），首先创建所有端口的适配器实例和事件总线实例。
2.  **创建世界**: 调用 `createWorld()`，将上一步创建的 `bus` 和 `ports` 注入，得到 `world` 实例。
3.  **注册系统**: 创建所有需要的系统实例（`MovementSystem`, `CombatSystem` 等），并依次调用 `world.registerSystem()` 将它们注册到世界中。
4.  **启动循环**: 在主循环（`main.ts`）中，通过 `requestFrame` 驱动，每帧计算 `dt` 并调用 `world.step(dt)`。

这套流程构成了整个应用的核心架构：**端口和适配器**处理与外部世界的交互，**事件总线**处理模块间的通信，而**世界和系统**则负责驱动所有内部游戏逻辑的演进。
