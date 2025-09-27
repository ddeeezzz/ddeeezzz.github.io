# 端口：渲染 (`render.ts`)

该文件是领域层与渲染引擎（本项目中为 Three.js）之间的核心“端口”。它定义了一套标准的渲染操作接口 `RenderPort`，使得领域逻辑（如相机控制、实体移动）可以命令渲染层执行任务，而无需了解任何 Three.js 的具体 API。这种隔离是保持代码整洁、可测试和可维护的关键。

## 核心设计

- **命令式接口**: 领域层通过调用 `RenderPort` 的方法来“命令”渲染层执行操作，例如“应用这个相机状态”或“更新这个实体的位置”。
- **状态传递**: 领域层负责计算状态（如相机位置 `CameraState`、实体变换 `EntityTransform`），并将这些状态对象作为参数传递给渲染端口。渲染适配器则负责将这些抽象的状态转化为具体的渲染指令（如更新 `THREE.Camera` 的 `position` 和 `rotation`）。
- **渲染无关性**: 所有的系统（`System`）都只与 `RenderPort` 接口交互，完全不知道 Three.js 的存在。这使得未来更换渲染引擎或在无头环境（如服务器）中运行逻辑成为可能。

## 接口与类型

### `CameraState` 接口

定义了相机的抽象状态，由领域层的相机系统计算得出。

- **`yaw: number`**: 水平偏航角。
- **`pitch: number`**: 垂直俯仰角。
- **`distance: number`**: 相机与目标中心的距离。
- **`height: number`**: 相机在目标中心上方的高度。
- **`fov: number`**: 相机的视野角度（Field of View）。
- **`center: { x, y, z }`**: 相机所围绕的焦点，通常是玩家的位置。

### `EntityTransform` 接口

定义了一个游戏世界中实体的通用变换信息。

- **`position: { x, y, z }`**: 实体在世界中的三维坐标。
- **`rotationY: number`**: 实体沿 Y 轴的旋转角度（弧度）。
- **`scale?: number`**: 可选。实体的整体缩放比例。
- **`opacity?: number`**: 可选。实体的不透明度，`1` 为完全不透明，`0` 为完全透明。
- **`color?: number`**: 可选。实体的基础颜色（以十六进制数值表示，如 `0xff0000` 代表红色）。

### `RenderPort` 接口

渲染端口的契约，由 `ThreeRenderAdapter` 实现。

- **`requestFrame(cb)`**: 请求一个动画帧，在下一帧渲染前调用回调函数 `cb`。这是驱动整个游戏循环的核心。
- **`render()`**: 执行单次场景渲染。
- **`resize()`**: 当窗口尺寸变化时调用，用于更新渲染器和相机的宽高比。
- **`applyCamera(state)`**: 将一个 `CameraState` 对象应用到场景相机上。
- **`ensureEntity(id, kind)`**: 确保一个具有给定 `id` 和 `kind`（类型）的实体在渲染世界中存在。如果不存在，渲染适配器会根据 `kind` 创建一个对应的视觉表现（例如，为 `'player'` 创建一个胶囊体）。
- **`applyEntity(id, tf)`**: 将一个 `EntityTransform` 对象应用到指定 `id` 的实体上，更新其位置、旋转等视觉表现。
- **`removeEntity?(id)`**: 可选。从场景中移除指定 `id` 的实体。
- **`clearAll?()`**: 可选。清空场景中所有由 `ensureEntity` 创建的实体。
- **`pick?(xNdc, yNdc)`**: 可选。执行一次拾取操作，返回在归一化设备坐标（NDC） `(x, y)` 处的物体信息。这对于实现点击移动或与物体交互至关重要。
- **`dispose()`**: 销毁渲染器，释放所有相关资源和事件监听器。

## 使用流程

1.  **装配**: 应用启动时，创建 `ThreeRenderAdapter` 实例并注册为 `world.ports.render`。
2.  **游戏循环**: `main.ts` 通过 `requestFrame` 启动主循环。
3.  **状态同步**:
    - `CameraSystem` 在每帧计算新的 `CameraState`，并通过 `applyCamera` 应用它。
    - `RenderSyncSystem` 监听领域实体的变换事件，并通过 `ensureEntity` 和 `applyEntity` 将这些变化同步到渲染场景中的 `THREE.Mesh` 对象上。
4.  **交互**: `CombatSystem` 或其他系统可能使用 `pick` 接口来检测玩家点击了哪个物体或地面上的哪个点。
