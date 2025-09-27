# 端口：时间 (`time.ts`)

该文件定义了与时间获取相关的“端口”。它提供了一个标准接口 `TimePort`，作为领域层获取当前时间戳的唯一来源。

## 核心设计

- **时间控制与可测试性**: 将时间获取抽象为一个端口，与 `RngPort`（随机数端口）的设计目的一致，都是为了实现“依赖注入”和“控制反转”。
  - 在自动化测试中，可以注入一个手动控制的 `TimePort` 实现。例如，测试代码可以精确地模拟时间的流逝（`time.advance(16)` // 前进16毫秒），从而可以对与时间相关的逻辑（如冷却时间、动画、物理积分）进行确定性的、可复现的测试。
  - 在正常应用中，注入一个基于 `performance.now()` 或 `Date.now()` 的真实时间源。

## 接口与类型

### `TimePort` 接口

时间端口的契约。

- **`now(): number`**:
  - **描述**: 获取当前的时间戳。
  - **返回**: 一个高精度的时间戳数字，通常表示自某个固定时间点（如页面加载）以来经过的毫秒数。

## 使用流程

1.  **装配**:
    - **生产环境**: 在应用启动时，创建一个 `TimePort` 实现，其 `now()` 方法内部调用 `performance.now()`，并将其注册到 `world.ports.time`。
    - **测试环境**: 在测试框架的 `beforeEach` 或 `setup` 中，创建一个可手动控制的 `TimePort` 模拟对象，并将其注册。

2.  **系统内使用**:
    - **主循环**: 在 `main.ts` 的主循环中，通过 `world.ports.time.now()` 获取当前帧的时间和上一帧的时间，计算出时间差 `dt`，并将其传递给所有系统的 `update(dt, world)` 方法。
    - **时间相关逻辑**: 任何需要计时、计算冷却或执行定时任务的系统，都应通过 `world.ports.time.now()` 来获取当前时间，而不是直接调用全局时间函数。

    ```typescript
    // 在某个 System 中
    const currentTime = world.ports.time.now();
    if (currentTime > this.nextFireTime) {
      this.fire();
      this.nextFireTime = currentTime + FIRE_COOLDOWN;
    }
    ```
