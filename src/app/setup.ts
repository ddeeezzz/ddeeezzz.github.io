// 引入 World：领域世界创建与系统调度
import { createWorld, type World } from '@domain/core/world' // 引入：创建世界与类型
// 引入事件总线：系统间解耦通信
import { createEventBus } from '@domain/core/event-bus' // 引入：事件总线工厂
// 引入渲染端口类型：用于约束适配器实现
import type { RenderPort, CameraState } from '@ports/render' // 引入：渲染端口类型
// 相机系统
import { cameraFollowSystem, type CameraControl, type CameraConfig } from '@domain/systems/camera-follow' // 引入：相机系统与类型
import { cameraRotateHoldSystem } from '@domain/systems/camera-rotate-hold' // 引入：相机连续旋转系统（Q/E 按住以固定角速度旋转）
// 浏览器输入适配器与类型
import { createBrowserInputAdapter } from '@adapters/browser/input-adapter' // 引入：浏览器输入适配器
import type { InputPort } from '@ports/input' // 引入：输入端口类型
// 游戏系统
import { movementSystem, type MovementConfig } from '@domain/systems/movement' // 引入：玩家移动系统
import { renderSyncSystem, type MarkerConfig } from '@domain/systems/render-sync' // 引入：渲染同步系统与标记配置
import { arenaSystem, type ArenaConfig } from '@domain/systems/arena' // 引入：竞技场系统与配置
import { frameResetSystem } from '@domain/systems/frame-reset' // 引入：输入帧末重置系统
import { teamManagerSystem } from '@domain/systems/team-manager' // 引入：队伍管理系统
import { scoreSystem } from '@domain/systems/score-system' // 引入：击杀计分系统
import { respawnSystem } from '@domain/systems/respawn-system' // 引入：重生系统
import { combatSystem } from '@domain/systems/combat' // 引入：平A 战斗系统
// UI 组件
import { createSensitivityPanel } from '../components/ui/sensitivity-panel' // 引入：灵敏度调节面板
import { createScoreboardPanel, type ScoreboardPanelHandle } from '../components/ui/scoreboard-panel' // 引入：比分面板组件
import { createRespawnHud, type RespawnHudHandle } from '../components/ui/respawn-hud' // 引入：重生提示组件
import { createHotkeyHint, type HotkeyHintHandle } from '../components/ui/hotkey-hint' // 引入：快捷键提示组件
import type { PlayerStatsPanelHandle } from '../components/ui/player-stats-panel' // 引入：玩家统计面板句柄类型（仅类型）
// 物理适配器
import { createSimplePhysicsAdapter } from '@adapters/simple/physics-adapter' // 引入：简易物理适配器
// 日志静默工具（如需全局静默可在 main.ts 调用）
import { silenceLogs } from '@utils/silence-logs' // 引入：日志静默工具
/**
 * 阶段 1-3：装配根（事件总线/端口/系统）
 * - 构建并注入端口（Render/Input）
 * - 注册相机/移动/渲染同步系统
 * - 暴露应用生命周期供入口调用
 */
export async function composeApp(root: HTMLElement, opts?: { render?: RenderPort; input?: InputPort }) {
  const bus = createEventBus()
  console.log('[装配] 事件总线已创建')
  const render: RenderPort =
    opts?.render ??
    (await (async () => {
      console.log('[装配] 尝试加载默认渲染适配器')
      try {
        const mod = await import('@adapters/three/render-adapter') // 引入：Three 渲染适配器模块（别名路径）
        console.log('[装配] 默认渲染适配器加载完成')
        return mod.createThreeRenderAdapter({ root, bus })
      } catch (e1) {
        console.error('[错误] 加载 @adapters/three/render-adapter 失败，尝试相对路径', e1)
        try {
          const mod = await import('../adapters/three/render-adapter') // 引入：Three 渲染适配器模块（相对路径备用）
          console.log('[装配] 备用渲染适配器加载完成')
          return mod.createThreeRenderAdapter({ root, bus })
        } catch (e2) {
          console.error('[致命] 无法加载渲染适配器模块', e2)
          throw e2
        }
      }
    })())
  console.log('[装配] 渲染端口准备完毕')
  const input: InputPort = opts?.input ?? createBrowserInputAdapter()
  console.log('[装配] 创建输入适配器')
  const physics = createSimplePhysicsAdapter(bus)
  console.log('[装配] 物理适配器已创建')
  const world: World = createWorld({ bus, ports: { render, input, physics } })

  // 注册：第三人称相机（基础），将输入端口转换为相机控制增量
  const controlFromInput: CameraControl = {
    sampleFrame: () => {
      const s = input.getState()
      // 鼠标：movementX → 向右转；movementY → 向上看（已在适配器转换为正）
      // 无需右键长按：直接根据鼠标移动旋转视角
      const yawDelta = s.yawDelta
      const pitchDelta = s.pitchDelta
      // 滚轮：deltaY>0 常见为滚远，这里定义 zoomDelta = -wheelDelta 来符合“滚轮向上拉近”直观
      const zoomDelta = -s.wheelDelta
      return { yawDelta, pitchDelta, zoomDelta }
    }
  }
  const camCfg: CameraConfig = {
    yaw: 0,
    pitch: 0.3,
    distance: 12,
    height: 2,
    fovBase: 60,
    // 旋转与缩放灵敏度（默认值，可被 UI 面板倍数调整）
    yawSpeed: 0.0015,
    pitchSpeed: 0.0012,
    zoomSpeed: 0.003,
    // 俯仰范围限制（按需可在此调整）
    pitchMin: 0.1,
    pitchMax: 0.8,
    // 距离范围
    minDistance: 10,
    maxDistance: 20,
    // 阻尼与输入平滑
    followLag: 0.12,
    mouseLag: 0.1,
    // 输入死区与尖峰限制（像素）
    deadzone: 0.25,
    maxDelta: 50
  }
  world.registerSystem(cameraFollowSystem({ render, control: controlFromInput, config: camCfg }))
  // 注册：Q/E 连续旋转（90°/s），与鼠标旋转叠加且保留 followLag 平滑
  // 语义：leftKey=逆时针，rightKey=顺时针；按需交换键位以满足“Q 顺时针 / E 逆时针”的定制
  world.registerSystem(cameraRotateHoldSystem({ rateDegPerSec: 90, leftKey: 'KeyE', rightKey: 'KeyQ' }))

  // 注册：玩家移动与渲染同步系统
  const moveCfg: MovementConfig = { maxSpeed: 10, acceleration: 30, dampingTau: 0.25 } // 玩家默认速度提升为 2 倍（5→10）
  world.registerSystem(movementSystem(moveCfg))
  const markerCfg: MarkerConfig = { rippleAmp: 0.15, fadeDuration: 1.5, color: '#ffcc00' }
  world.registerSystem(renderSyncSystem(render, 'player:1', markerCfg))
  world.registerSystem(teamManagerSystem())
  world.registerSystem(scoreSystem())
  world.registerSystem(respawnSystem(2))
  world.registerSystem(combatSystem())
  // AI：移动与开火
  try {
    const mod = await import('@domain/systems/ai-walker')
    world.registerSystem(mod.aiWalkerSystem())
  } catch (e1) {
    try {
      const mod = await import('../domain/systems/ai-walker')
      world.registerSystem(mod.aiWalkerSystem())
    } catch (e2) {
      console.error('[装配] 无法加载移动 AI 系统模块', e2)
    }
  }
  // 注册：自动开火（非玩家）与回合计时（30s）
  try {
    const mod = await import('@domain/systems/auto-fire')
    world.registerSystem(mod.autoFireSystem())
  } catch (e1) {
    try {
      const mod = await import('../domain/systems/auto-fire')
      world.registerSystem(mod.autoFireSystem())
    } catch (e2) {
      console.error('[装配] 无法加载自动开火系统模块', e2)
    }
  }
  try {
    const mod = await import('@domain/systems/round-system')
    world.registerSystem(mod.roundSystem({ durationSeconds: 30 }))
  } catch (e1) {
    try {
      const mod = await import('../domain/systems/round-system')
      world.registerSystem(mod.roundSystem({ durationSeconds: 30 }))
    } catch (e2) {
      console.error('[装配] 无法加载回合系统模块', e2)
    }
  }
  try {
    const mod = await import('@domain/systems/auto-fire') // 引入：自动开火系统（域内路径）
    world.registerSystem(mod.autoFireSystem())
  } catch (e1) {
    try {
      const mod = await import('../domain/systems/auto-fire') // 引入：自动开火系统（相对路径回退）
      world.registerSystem(mod.autoFireSystem())
    } catch (e2) {
      console.error('[装配] 无法加载自动开火系统模块', e2)
    }
  }
  // 注册：竞技场（地面/障碍/出生点）
  const arenaCfg: ArenaConfig = { size: 60, obstacleCount: 20, obstacleMin: 1.8, obstacleMax: 4.8, spawnPerTeam: 5, spawnMinDist: 2.5, spawnMargin: 2.0, spawnRadius: 6 }
  world.registerSystem(arenaSystem(arenaCfg))
  // 帧末：统一清理输入增量，避免相机采样过早清除点击
  world.registerSystem(frameResetSystem())

  // UI：创建灵敏度调节面板（旋转/缩放）
  // 捕获最近相机状态（供“设当前相机为初始”使用）
  let lastCamera: any = null
  let uiPanelHandle: { dispose: () => void; setZoomValue: (distance: number) => void } | null = null
  let scoreboardHandle: ScoreboardPanelHandle | null = null
  let respawnHudHandle: RespawnHudHandle | null = null
  let playerStatsHandle: PlayerStatsPanelHandle | null = null
  let speedPanelHandle: { dispose: () => void; setSpeedValue: (v: number) => void } | null = null
  let hotkeyHintHandle: HotkeyHintHandle | null = null
  bus.on('camera/state', (e) => {
    lastCamera = e.payload
    const camState = e.payload as CameraState | undefined
    if (camState?.distance != null) {
      uiPanelHandle?.setZoomValue(camState.distance)
    }
  })
  // 记录最新出生圈信息，便于按出生区域设定初始机位
  let spawnCircles: null | {
    A: { center: { x: number; z: number }; radius: number }
    B: { center: { x: number; z: number }; radius: number }
  } = null
  let pendingCameraAutoAlign = true
  let lastPlayerSpawn: { x: number; z: number } | null = null

  const alignCameraBySpawn = (): boolean => {
    const selfCircle = spawnCircles?.B ?? spawnCircles?.A
    if (!selfCircle) return false

    const anchor = lastPlayerSpawn ?? selfCircle.center
    let enemyCircle: { center: { x: number; z: number }; radius: number } | null = null
    if (spawnCircles?.A && spawnCircles?.B) {
      enemyCircle = selfCircle === spawnCircles.B ? spawnCircles.A : spawnCircles.B
    }

    let dir = enemyCircle
      ? { x: enemyCircle.center.x - anchor.x, z: enemyCircle.center.z - anchor.z }
      : { x: -anchor.x, z: -anchor.z }
    if (Math.abs(dir.x) < 1e-5 && Math.abs(dir.z) < 1e-5) {
      dir = { x: Math.cos(camCfg.yaw), z: Math.sin(camCfg.yaw) }
    }
    const yaw = Math.atan2(dir.z, dir.x)
    const pitchTarget = Math.max(camCfg.pitchMin, Math.min(camCfg.pitchMax, 0.42))
    let distanceTarget = Math.max(selfCircle.radius * 2.4, camCfg.distance, camCfg.minDistance)
    if (enemyCircle) {
      const groundDist = Math.hypot(enemyCircle.center.x - anchor.x, enemyCircle.center.z - anchor.z)
      const desired = groundDist * 0.6 + enemyCircle.radius
      distanceTarget = Math.max(distanceTarget, desired)
    }
    distanceTarget = Math.min(camCfg.maxDistance, Math.max(camCfg.minDistance, distanceTarget))

    camCfg.yaw = yaw
    camCfg.pitch = pitchTarget
    camCfg.distance = distanceTarget
    uiPanelHandle?.setZoomValue(distanceTarget)
    bus.emit({ type: 'camera/force', payload: { yaw, pitch: pitchTarget, distance: distanceTarget } })
    console.log('[相机] 自动对齐出生圈视角', {
      yaw: yaw.toFixed(3),
      pitch: pitchTarget.toFixed(3),
      distance: distanceTarget.toFixed(2)
    })
    return true
  }

  // 监听出生点广播，保存出生圈供相机计算初始机位
  bus.on('arena/spawn-points', (e) => {

    const payload = e.payload as {
      player?: { x: number; z: number }
      circle?: {
        A: { center: { x: number; z: number }; radius: number }
        B: { center: { x: number; z: number }; radius: number }
      }
    }
    if (payload?.player) {
      lastPlayerSpawn = payload.player
      console.log('[装配] 接收到玩家出生坐标', payload.player)
    }
    if (payload?.circle) {
      spawnCircles = payload.circle
      console.log('[装配] 出生圈参考已更新')
      if (pendingCameraAutoAlign && alignCameraBySpawn()) {
        pendingCameraAutoAlign = false
      }
    }
  })

  bus.on('player/spawn', (e) => {
    const payload = e.payload as { x: number; z: number } | undefined
    if (!payload) return
    lastPlayerSpawn = payload
    console.log('[装配] 玩家出生事件已同步', payload)
    if (pendingCameraAutoAlign && alignCameraBySpawn()) {
      pendingCameraAutoAlign = false
    }
  })

  uiPanelHandle = createSensitivityPanel(root, {
    camConfig: camCfg,
    marker: {
      rippleAmp: markerCfg.rippleAmp,
      fadeDuration: markerCfg.fadeDuration,
      color: markerCfg.color,
      onChange: (m) => {
        markerCfg.rippleAmp = m.rippleAmp;
        markerCfg.fadeDuration = m.fadeDuration;
        markerCfg.color = m.color;
      }
    },
    onReset: () => {
      console.log('[装配] 收到界面重置指令，准备刷新场景');
      pendingCameraAutoAlign = true;
      (render as any).clearAll?.();
      bus.emit({ type: 'arena/reset' });
    },
    zoomControl: {
      min: camCfg.minDistance,
      max: camCfg.maxDistance,
      step: 0.1,
      initial: camCfg.distance,
      onChange: (distance) => {
        const clamped = Math.min(camCfg.maxDistance, Math.max(camCfg.minDistance, distance));
        camCfg.distance = clamped;
        bus.emit({ type: 'camera/force', payload: { distance: clamped } });
        console.log('[装配] 手动设定镜头距离', { distance: clamped.toFixed(2) });
      }
    }
  })

  // 在右上角增加“玩家速度（m/s）”滑块面板
  try {
    const mod = await import('../components/ui/player-speed-panel') // 引入：玩家速度面板模块（动态导入避免路径差异）
    speedPanelHandle = mod.createPlayerSpeedPanel(root, {
      min: 5,
      max: 20,
      step: 0.5,
      initial: moveCfg.maxSpeed,
      onChange: (v: number) => {
        const clamped = Math.max(5, Math.min(20, v))
        moveCfg.maxSpeed = clamped
        bus.emit({ type: 'movement/config', payload: { maxSpeed: clamped } })
        console.log('[装配] 玩家速度已更新', { maxSpeed: clamped.toFixed(2) })
      }
    })
  } catch (e) {
    console.error('[装配] 无法加载玩家速度面板模块', e)
  }

  scoreboardHandle = createScoreboardPanel(root, bus, {
    maxKillLogs: 6,
    teamLabels: { teamA: '蓝队', teamB: '红队' }
  })

  respawnHudHandle = createRespawnHud(root, bus, {
    playerId: 'player:1',
    spawnPointLabels: { north: '北侧出生点', south: '南侧出生点' }
  })

  const { createPlayerStatsPanel } = await import('../components/ui/player-stats-panel') // 引入：玩家状态栏面板（动态导入以兼容路径）
  playerStatsHandle = createPlayerStatsPanel(root, bus, { playerId: 'player:1' })

  // 创建：快捷键提示（位于左上“玩家状态栏”与“顶部居中比分面板”之间）
  try {
    hotkeyHintHandle = createHotkeyHint(root, bus, 'WASD/左键移动，右键攻击，Q/E/鼠标移动旋转')
  } catch (e) {
    console.error('[装配] 无法创建快捷键提示组件', e)
  }

  // UI：对局结果覆盖层（胜利/失败）
  try {
    const mod = await import('../components/ui/match-result-overlay')
    const overlayHandle = mod.createMatchResultOverlay(root, bus, { playerTeamId: 'teamB' })
    // 追加销毁挂钩
    const prevDispose = playerStatsHandle?.dispose ?? (() => {})
    playerStatsHandle = {
      dispose: () => { try { overlayHandle.dispose() } catch {}; prevDispose() }
    } as any
  } catch (e) {
    console.error('[装配] 无法加载对局结果覆盖层', e)
  }

  // UI → Arena 配置桥接：监听 UI 自定义事件，转发到 bus
  document.addEventListener('ui:arena-config', (e: any) => {
    bus.emit({ type: 'arena/config', payload: e.detail })
  })

  // 渲染循环（占位）：后续可接入固定逻辑
  // 暂停控制：当回合结束显示结果后，停止后续帧调度（方案A）
  let pauseRequested = false // 标记：收到 round/ended 后请求暂停
  let paused = false // 状态：是否已暂停
  // 订阅：对局结束，显示结果后暂停循环
  bus.on('round/ended', () => {
    // 中文日志：收到 round/ended 事件，请求暂停下一帧
    console.log('[循环] 收到 round/ended，申请暂停循环')
    pauseRequested = true
  })

  let last = performance.now()
  const loop = (t?: number) => {
    const now = t ?? performance.now()
    const dt = (now - last) / 1000
    last = now
    // 推进一帧逻辑
    world.step(dt)
    render.render()

    // 若收到暂停请求，则本帧结束后不再调度下一帧
    if (pauseRequested) {
      paused = true
      console.log('[循环] 游戏已暂停，停止后续帧调度')
      return // 不再调用 requestFrame
    }
    if (!paused) {
      render.requestFrame(loop)
    }
  }
  render.requestFrame(loop)

  const dispose = () => {
    console.log('[装配] 释放应用资源')
    uiPanelHandle?.dispose()
    scoreboardHandle?.dispose()
    respawnHudHandle?.dispose()
    playerStatsHandle?.dispose()
    hotkeyHintHandle?.dispose()
    speedPanelHandle?.dispose()
    render.dispose()
  }

  return { world, dispose }
}




































