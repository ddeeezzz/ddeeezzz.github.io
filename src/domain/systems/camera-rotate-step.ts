/**
 * 系统：相机离散旋转（Q/E 每次旋转 45°）
 * - 读取输入端口 pressed 集合，检测 KeyQ/KeyE 的上升沿，向左/向右旋转固定角度。
 * - 通过事件 `camera/force` 强制设置 yaw，使相机在下一帧立即跳转到位。
 */
import type { System, World } from '@domain/core/world' // 引入：系统/世界类型（用于注册与调度）

/**
 * 创建相机离散旋转系统
 * 参数：可选 angleDeg/leftKey/rightKey；默认 45°、KeyQ/KeyE
 * 返回：System —— 在每帧根据按键触发旋转
 */
export function cameraRotateStepSystem(opts?: { angleDeg?: number; leftKey?: string; rightKey?: string }): System { // 导出：相机离散旋转系统（装配使用）
  const angleDeg = (opts?.angleDeg ?? 45)
  const leftKey = opts?.leftKey ?? 'KeyQ' // 逆时针键（yaw 增大）
  const rightKey = opts?.rightKey ?? 'KeyE' // 顺时针键（yaw 减小）
  const angleRad = (Math.PI / 180) * angleDeg

  // 最近一次相机 yaw（由 camera/state 同步）
  let currentYaw = 0
  // 上升沿锁存：避免长按连发
  let qLatch = false
  let eLatch = false

  // 将角度归一化到 [-PI, PI)（仅为便于日志阅读，功能不依赖归一化）
  function normPi(x: number): number {
    let v = x
    const PI2 = Math.PI * 2
    if (!Number.isFinite(v)) return 0
    v = v % PI2
    if (v >= Math.PI) v -= PI2
    if (v < -Math.PI) v += PI2
    return v
  }

  function update(_dt: number, world: World) {
    // 首次调用时建立订阅：同步相机当前 yaw
    if (!(update as any)._sub) {
      (update as any)._sub = world.bus.on('camera/state', (e) => {
        const s = e.payload as { yaw?: number } | undefined
        if (typeof s?.yaw === 'number') currentYaw = s.yaw
      })
    }

    const input = world.ports.input
    const state = input?.getState()
    const pressed: Set<string> = state?.pressed ?? new Set()

    const qDown = pressed.has(leftKey)
    const eDown = pressed.has(rightKey)

    // Q：左转（定义为 yaw 增大）
    if (qDown && !qLatch) {
      const prev = currentYaw
      const next = currentYaw + angleRad
      currentYaw = next
      world.bus.emit({ type: 'camera/force', payload: { yaw: next } })
      console.log(`[相机] Q 键触发：逆时针 ${angleDeg}° → yaw: ${normPi(prev).toFixed(3)} → ${normPi(next).toFixed(3)}`)
    }
    // E：右转（定义为 yaw 减小）
    if (eDown && !eLatch) {
      const prev = currentYaw
      const next = currentYaw - angleRad
      currentYaw = next
      world.bus.emit({ type: 'camera/force', payload: { yaw: next } })
      console.log(`[相机] E 键触发：顺时针 ${angleDeg}° → yaw: ${normPi(prev).toFixed(3)} → ${normPi(next).toFixed(3)}`)
    }

    // 更新锁存状态（上升沿检测）
    qLatch = qDown
    eLatch = eDown
  }

  return { name: 'CameraRotateStep', update }
}
