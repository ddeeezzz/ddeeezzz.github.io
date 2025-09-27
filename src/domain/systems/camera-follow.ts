/**
 * TODO（阶段 3：第三人称相机基础）
 * - 计算并输出相机状态：yaw/pitch/距离/高度/FOV。
 * - 支持夹角/距离限制与临界阻尼插值（followLag）。
 * - 后续将由输入系统提供 yaw/pitch/zoom 的帧增量。
 */
// 引入系统与世界接口：用于注册与调度
import type { System, World } from '@domain/core/world'
// 引入渲染端口与相机状态类型：用于将结果应用到渲染层
import type { CameraState, RenderPort } from '@ports/render' // 引入：渲染端口/相机状态类型

// 导出：相机控制采样接口（由输入层或测试桩实现）
export interface CameraControl { // 导出：相机控制输入采样接口
  sampleFrame(): { yawDelta: number; pitchDelta: number; zoomDelta: number }
}

// 导出：相机配置参数
export interface CameraConfig { // 导出：相机配置参数
  yaw: number
  pitch: number
  distance: number
  height: number
  fovBase: number
  yawSpeed: number
  pitchSpeed: number
  zoomSpeed: number
  pitchMin: number
  pitchMax: number
  minDistance: number
  maxDistance: number
  followLag: number // 秒级时间常数；0 表示无阻尼，立即跟随
  mouseLag: number // 鼠标输入平滑时间常数；0 表示无平滑
  deadzone: number // 鼠标增量死区（像素），低于此值忽略
  maxDelta: number // 每帧增量上限（像素），防止抖动或尖峰
}

/** 临界阻尼插值：将 current 向 target 逼近。 */
function damp(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target
  const a = 1 - Math.exp(-dt / tau)
  return current + (target - current) * a
}

/** 夹角限制 */
function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x))
}

const CAMERA_COLLISION_RADIUS = 0.75
const CAMERA_COLLISION_BUFFER = 0.25
const CAMERA_EPS = 1e-3

// 导出：创建相机跟随系统工厂
export function cameraFollowSystem(opts: {
  render: RenderPort
  control: CameraControl
  config: CameraConfig
}): System { // 导出：第三人称相机系统（基础版）
  const { render, control } = opts
  // 目标状态与当前状态
  let ty = opts.config.yaw
  let tp = opts.config.pitch
  let td = opts.config.distance
  let cy = ty
  let cp = tp
  let cd = td
  // 输入增量的平滑值
  let sy = 0
  let sp = 0
  // 跟随中心（默认原点），订阅玩家变换更新
  let center = { x: 0, y: 0, z: 0 }

  // 预设相机静态高度与 FOV
  const height = opts.config.height
  const fov = opts.config.fovBase
  let cameraCollisionActive = false

  function update(dt: number, world: World) {
    if (!(update as any)._sub) {
      (update as any)._sub = world.bus.on('entity/player/transform', (e) => {
        const p = e.payload as { position: { x: number; y: number; z: number } }
        if (p && p.position) {
          center.x = p.position.x
          center.y = p.position.y
          center.z = p.position.z
        }
      })
      // 允许外部强制设定初始机位（按出生圈重置）
      ;(update as any)._subForceCamera = world.bus.on('camera/force', (evt) => {
        const payload = evt.payload as Partial<{ yaw: number; pitch: number; distance: number }>
        if (!payload) return
        if (typeof payload.yaw === 'number' && Number.isFinite(payload.yaw)) {
          ty = payload.yaw
          cy = payload.yaw
          opts.config.yaw = payload.yaw
        }
        if (typeof payload.pitch === 'number' && Number.isFinite(payload.pitch)) {
          const clampedPitch = clamp(payload.pitch, opts.config.pitchMin, opts.config.pitchMax)
          tp = clampedPitch
          cp = clampedPitch
          opts.config.pitch = clampedPitch
        }
        if (typeof payload.distance === 'number' && Number.isFinite(payload.distance)) {
          const clampedDist = clamp(payload.distance, opts.config.minDistance, opts.config.maxDistance)
          td = clampedDist
          cd = clampedDist
          opts.config.distance = clampedDist
        }
        console.log('[相机] 收到初始机位强制设定', { yaw: ty.toFixed(3), pitch: tp.toFixed(3), distance: td.toFixed(2) })
      })
      // 允许外部以“增量方式”调整目标机位（与鼠标输入叠加，保留 followLag 平滑）
      ;(update as any)._subAdjustCamera = world.bus.on('camera/adjust', (evt) => {
        const payload = evt.payload as Partial<{ yawDelta: number; pitchDelta: number; distanceDelta: number }>
        if (!payload) return
        // yaw 增量：正为左转，负为右转
        if (typeof payload.yawDelta === 'number' && Number.isFinite(payload.yawDelta)) {
          ty += payload.yawDelta
          // console.log('[相机] 目标 yaw 外部调整', { yawDelta: payload.yawDelta.toFixed(4), ty: ty.toFixed(3) })
        }
        // pitch/距离增量（预留，可按需开启）
        if (typeof payload.pitchDelta === 'number' && Number.isFinite(payload.pitchDelta)) {
          const clamped = clamp(tp + payload.pitchDelta, opts.config.pitchMin, opts.config.pitchMax)
          tp = clamped
          opts.config.pitch = clamped
        }
        if (typeof payload.distanceDelta === 'number' && Number.isFinite(payload.distanceDelta)) {
          const clamped = clamp(td + payload.distanceDelta, opts.config.minDistance, opts.config.maxDistance)
          td = clamped
          opts.config.distance = clamped
        }
      })
    }
    const { yawDelta, pitchDelta, zoomDelta } = control.sampleFrame()
    // 预处理输入：死区、上限与平滑（降低“过于灵活”的手感）
    const dz = opts.config.deadzone
    const cap = opts.config.maxDelta
    const ry = Math.abs(yawDelta) < dz ? 0 : clamp(yawDelta, -cap, cap)
    const rp = Math.abs(pitchDelta) < dz ? 0 : clamp(pitchDelta, -cap, cap)
    // 鼠标输入平滑
    sy = damp(sy, ry, dt, opts.config.mouseLag)
    sp = damp(sp, rp, dt, opts.config.mouseLag)
    // 应用输入增量到目标值（帧无关不变性：此处不乘 dt，完全由参数控制）
    ty += sy * opts.config.yawSpeed
    tp = clamp(tp + sp * opts.config.pitchSpeed, opts.config.pitchMin, opts.config.pitchMax)
    td = clamp(td - clamp(zoomDelta, -cap, cap) * opts.config.zoomSpeed, opts.config.minDistance, opts.config.maxDistance)

    // 临界阻尼插值到当前值
    cy = damp(cy, ty, dt, opts.config.followLag)
    cp = damp(cp, tp, dt, opts.config.followLag)
    cd = damp(cd, td, dt, opts.config.followLag)

    const physics = world.ports.physics
    let effectiveDistance = cd
    let collided = false
    if (physics) {
      // 变更：相机缩臂忽略单位命中（teamA/teamB），仅对障碍/边界生效。
      // 做法：沿射线迭代探测，若命中单位则前移一个极小偏移后继续探测剩余距离。
      const baseOrigin: [number, number, number] = [center.x, center.y + height, center.z]
      const dir: [number, number, number] = [
        -Math.cos(cy) * Math.cos(cp),
        Math.sin(cp),
        -Math.sin(cy) * Math.cos(cp)
      ]
      let remaining = cd
      let curOrigin: [number, number, number] = [baseOrigin[0], baseOrigin[1], baseOrigin[2]]
      const MAX_RAY_STEPS = 5
      for (let i = 0; i < MAX_RAY_STEPS && remaining > CAMERA_EPS; i++) {
        const res = physics.sphereCast(curOrigin, dir, CAMERA_COLLISION_RADIUS, remaining)
        if (!res?.hit) break
        const kind = res.objectKind as string | undefined
        const dist = Math.max(0, Math.min(typeof res.distance === 'number' ? res.distance : remaining, remaining))
        if (kind === 'teamA' || kind === 'teamB') {
          // 命中单位：跳过并从命中点之后继续
          const epsStep = Math.max(CAMERA_EPS, 0.01)
          curOrigin = [
            curOrigin[0] + dir[0] * (dist + epsStep),
            curOrigin[1] + dir[1] * (dist + epsStep),
            curOrigin[2] + dir[2] * (dist + epsStep)
          ]
          remaining -= (dist + epsStep)
          continue
        }
        // 命中障碍/边界/未知物体：计算安全距离并结束
        const safe = Math.max(opts.config.minDistance, Math.min(cd, dist - CAMERA_COLLISION_BUFFER))
        if (safe < effectiveDistance - CAMERA_EPS) effectiveDistance = safe
        collided = safe < cd - CAMERA_EPS
        break
      }
    }
    if (collided) {
      if (!cameraCollisionActive) {
        // console.log('[相机] 缩臂以避障', { distance: effectiveDistance.toFixed(2) })
      }
      cameraCollisionActive = true
    } else if (cameraCollisionActive) {
      // console.log('[相机] 缩臂解除')
      cameraCollisionActive = false
    }
    // 使用阻尼插值平滑地调整相机距离，而不是瞬间拉近，以消除震动
    const collisionLag = 0.1 // 为碰撞调整设置一个较短的缓冲时间
    cd = damp(cd, Math.max(opts.config.minDistance, Math.min(effectiveDistance, opts.config.maxDistance)), dt, collisionLag)

    // 输出到渲染端口
    const state: CameraState = { yaw: cy, pitch: cp, distance: cd, height, fov, center }
    render.applyCamera(state)
    // 广播相机状态（供移动系统获取相机朝向进行相对移动）
    world.bus.emit({ type: 'camera/state', payload: state })
  }

  return { name: 'CameraFollow', update }
}




