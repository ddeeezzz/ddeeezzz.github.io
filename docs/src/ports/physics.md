# 端口：物理 (`physics.ts`)

该文件定义了与物理计算相关的核心接口，是领域层与具体物理引擎实现之间的桥梁。通过定义一个标准的 `PhysicsPort`，领域内的系统（如战斗、移动）可以发起物理查询（如射线检测），而无需关心底层是使用了 `ammo.js`, `cannon-es` 还是一个简单的自定义实现。

## 核心设计

- **能力抽象**: 将复杂的物理计算能力抽象成一个简洁的接口。目前，它专注于提供“球形射线检测”（Sphere Cast），这是游戏逻辑中非常常见的需求，例如检测子弹是否命中、角色是否会碰撞墙壁等。
- **可替换性**: 领域逻辑仅依赖于 `PhysicsPort` 接口。这意味着开发者可以在“适配器层”提供不同的物理实现。在开发的早期阶段，可以使用一个简单的、基于数学近似的适配器；在后期，可以无缝切换到一个功能完备的物理引擎，而无需修改任何领域代码。

## 接口与类型

### `SphereCastHit` 接口

描述一次球形射线检测的返回结果。

- **`hit: boolean`**:
  - **描述**: 布尔值，表示检测是否发生碰撞。`true` 为命中，`false` 为未命中。

- **`distance: number`**:
  - **描述**: 命中的距离。如果未命中，此值通常等于或大于 `maxDist`。

- **`point?: [number, number, number]`**:
  - **描述**: 可选。碰撞点的三维坐标 `[x, y, z]`。

- **`normal?: [number, number, number]`**:
  - **描述**: 可选。碰撞点所在表面的法线向量 `[x, y, z]`。

- **`objectId?: string`**:
  - **描述**: 可选。被命中物体的唯一标识符。

- **`objectKind?: string`**:
  - **描述**: 可选。被命中物体的种类或标签，例如 `'teamA'`, `'obstacle'`。这对于在命中后执行不同的逻辑至关重要。

### `PhysicsPort` 接口

物理端口的契约，由具体的物理适配器实现。

- **`sphereCast(origin: [number, number, number], dir: [number, number, number], radius: number, maxDist: number): SphereCastHit`**:
  - **描述**: 执行一次球形射线检测。想象一个半径为 `radius` 的球体，从 `origin` 点出发，沿着 `dir` 方向移动 `maxDist` 的距离，检测途中是否与其他物体发生碰撞。
  - **参数**:
    - `origin`: 起点坐标 `[x, y, z]`。
    - `dir`: 方向向量 `[x, y, z]`（应为单位向量）。
    - `radius`: 球体半径。
    - `maxDist`: 最大检测距离。
  - **返回**: 一个 `SphereCastHit` 对象，包含了详细的碰撞信息。

## 使用流程

1.  **装配**: 在应用启动时，创建一个具体的 `PhysicsPort` 实现（例如 `createSimplePhysicsAdapter`）并将其注册到 `World` 对象的 `ports.physics` 中。
2.  **系统内使用**:
    - **战斗系统**: 在计算投射物飞行路径时，使用 `sphereCast` 来检测子弹是否在本帧内命中了敌人或障碍物。
    - **移动系统**: 在角色移动前，可以沿着移动方向进行一次 `sphereCast`，以预判是否会发生碰撞，从而实现滑动或停止，避免穿墙。
