## 目标
- Three.js 原生几何 5v5 单机对战展示
- 架构：ECS + 端口/适配器（Ports & Adapters）+ 事件驱动
- 相机：第三人称跟随；输入：键鼠；无音频与外部模型

## 已完成
- 阶段0 脚手架：搭建 TypeScript + Vite + Vitest 工程，锁定 Node 版本，配置 .npmrc 确保依赖一致。
- 阶段1 世界与事件总线：抽象 World、事件总线与端口契约，建立 ECS 调度的测试基线。
- 阶段2 渲染基线：实现 Three.js 渲染适配器，自适应帧调度，RenderPort.dispose 冒烟测试通过。
- 阶段3 相机能力：CameraFollowSystem 支持跟随、俯仰/缩放限制与输入平滑（mouseLag、deadzone、maxDelta）。
- 阶段4 输入适配：整合浏览器键盘、鼠标、滚轮输入，统一归一化后分发，相关测试全部通过。
- 阶段5 玩家与移动：建立玩家组件与 MovementSystem（加速度、阻尼、相机系移动），RenderSyncSystem 同步 Three Mesh。
- 阶段6 竞技场与交互：
  - 出生圈连线生成方形地图；障碍（三棱锥）在方形内采样并避开出生圈。
  - AB 队为圆柱，玩家随机生成在自身出生圈内，队友与障碍维持原位；重置场景时仅刷新数据不重建阵列。
  - 鼠标左键地面点击移动，点击位置生成可配置涟漪标记；右键菜单已屏蔽。
  - UI 面板提供旋转/缩放灵敏度调节、地面标记参数与显示开关；切换显示时仅更新渲染状态。
  - 相机自动对齐：重置或出生圈变化时读取敌方出生圈圆心，使其位于屏幕上方中央，同时通过 camera/force 同步 yaw/pitch/距离。
  - 玩家出生位置、障碍与出生圈信息通过事件广播，供其他系统使用。
- 阶段7 轻量碰撞：
  - 引入 PhysicsPort 与简易物理适配器，缓存障碍与边界并提供 sphereCast。
  - 玩家移动新增障碍滑动与边界约束，点击障碍回执红色标记；相机命中时自动缩臂。
  - 补充移动与相机的碰撞测试，覆盖障碍外推与缩臂恢复。

- 阶段8 武器与弹丸：
  - 完成光球武器按 P 发射的主流程，沿移动向量或首次默认方向取射线。
  - 统一射击方向状态与日志标注，区分刷新/重置来源便于排查。
  - 贯通命中与目标销毁回调链，保持轻量实现暂不引入冷却与对象池。

- 阶段9 进展总结（2025-09-27）
  - 已实现 TeamManager：管理阵营目录、单位增删、快照广播；维护统计并在实体移除/重生时同步。核心：`src/domain/systems/team-manager.ts`
  - 已实现 ScoreSystem：监听 `combat/enemy-removed`，累计比分并广播 `score/updated`，同时推送 `team/stats-update`。核心：`src/domain/systems/score-system.ts`
  - 已实现 RespawnSystem：安排倒计时并广播 `respawn/countdown`/`respawn/ready`/`respawn/complete`，支持场景重置清理。核心：`src/domain/systems/respawn-system.ts`
  - UI 接入：比分与击杀记录面板 `src/components/ui/scoreboard-panel.ts`；重生 HUD `src/components/ui/respawn-hud.ts`；装配位置 `src/app/setup.ts`


## 未完成内容（细化待办）
- 阶段10 AI 行为
- 后续：相机进阶：遮挡缩臂、锁定可见目标、冲刺/瞄准动态 FOV。测试最小距离、肩位和 FOV 过渡、UI 细节打磨、性能与日志面板增强。

## 关键文件
- 应用层：src/app/main.ts, src/app/setup.ts
- 领域层：src/domain/core/*, src/domain/systems/camera-follow.ts
- 端口层：src/ports/*
- 适配层：src/adapters/three/render-adapter.ts, src/adapters/browser/input-adapter.ts
- 配置与脚本：vite.config.ts, scripts/bootstrap.mjs
- 测试：	ests/**/*

## 运行方式
- 安装依赖并运行测试：
npm run bootstrap:no-dev
- 开发预览：
npm run dev → 打开 http://localhost:5173
- 全流程（含预览）：
npm run bootstrap

## 规范
- 依据 AGENTS.md：所有 import/export、函数需中文注释；统一 2 空格缩进；遵循提交与 PR 规范。

## 下一步（阶段 10 起）
阶段10 ；战斗AI 后续 相机进阶 与 UI 细节打磨、性能与日志面板增强。

### 变更记录 2025/09/27
- 配置：将重生时间由 10s 调整为 2s（装配传参：src/app/setup.ts:117；未改动系统默认值）。

- 修复：红队（teamB，排除玩家）重生后不可见/不开火的问题
  - combat：在 `respawn/complete` 中为 teamB 非玩家单位执行可视化重建与目标库更新。
    - 文件：src/domain/systems/combat.ts（监听 `respawn/complete`，对称处理 teamA 与 teamB）。
  - auto-fire：为 teamB 非玩家单位在重生后恢复射手登记，恢复自动开火节奏。
    - 文件：src/domain/systems/auto-fire.ts（监听 `respawn/complete`，调用 upsert）。
  - 测试：新增 `tests/domain/red-team-respawn.test.js` 验证可视化重建与自动开火恢复。
  - 影响范围：仅涉及红队 AI，未改动玩家相关命中/重生链路。


