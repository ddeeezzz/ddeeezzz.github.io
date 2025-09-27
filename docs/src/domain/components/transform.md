# 领域组件：变换 (`transform.ts`)

这是游戏世界中最基础、最重要的组件之一。`Transform` 组件负责存储一个实体在三维空间中的位置和朝向信息。任何在世界中可见或拥有物理位置的实体，都必须拥有一个 `Transform` 组件。

## 核心设计

- **纯粹的数据**: 遵循 ECS 的原则，`Transform` 接口本身只定义了数据结构，不包含任何方法或逻辑。所有对位置和旋转的修改都由“系统”（Systems）来完成，例如 `MovementSystem`。
- **最小化**: 当前的 `Transform` 实现非常精简，只包含了在本项目中进行平面运动所必需的数据：三维坐标 `position` 和沿 Y 轴的旋转 `rotationY`。这足以满足俯视角（Top-down）或 第三人称（Third-person）游戏的需求。如果未来需要更复杂的旋转（例如飞行模拟），可以将其扩展为使用四元数（Quaternion）。

## 接口与函数

### `Transform` 接口

定义了实体的位置和朝向。

- **`position: { x: number; y: number; z: number }`**:
  - **描述**: 一个包含实体在世界坐标系中 `x`, `y`, `z` 坐标的对象。
- **`rotationY: number`**:
  - **描述**: 实体沿世界 Y 轴（垂直轴）的旋转角度，以弧度为单位。`0` 通常表示朝向 Z 轴正方向。

### `createTransform()` 工厂函数

一个用于创建并初始化 `Transform` 组件实例的便捷工具函数。

- **`createTransform(x = 0, y = 0, z = 0, rotationY = 0): Transform`**:
  - **描述**: 创建一个新的 `Transform` 对象。
  - **参数**:
    - `x`, `y`, `z`: 可选的初始位置坐标，默认为 `0`。
    - `rotationY`: 可选的初始 Y 轴旋转，默认为 `0`。
  - **返回**: 一个新的 `Transform` 实例。

## 使用流程

1.  **实体创建**: 当一个新的实体被创建时，通常会立即为其附加一个 `Transform` 组件，以定义其在世界中的初始状态。

    **伪代码示例：**
    ```typescript
    import { createTransform } from './transform';

    const enemyEntity = world.createEntity();
    const initialTransform = createTransform(10, 0, -5, Math.PI); // 在 (10, 0, -5) 位置，朝向 Z 轴负方向
    world.addComponent(enemyEntity, initialTransform);
    ```

2.  **系统访问与修改**:
    - **`MovementSystem`**: 读取输入或 AI 指令，计算新的位置，并更新实体的 `Transform` 组件的 `position` 字段。
    - **`RenderSyncSystem`**: 监听 `Transform` 组件的变化，并将更新后的 `position` 和 `rotationY` 通过渲染端口（`RenderPort`）传递给渲染引擎，从而更新屏幕上模型的视觉表现。
    - **`CombatSystem`**: 读取 `Transform` 组件来确定子弹的发射位置和方向。
