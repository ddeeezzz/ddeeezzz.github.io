/**
 * 系统：相机连续旋转（按住 Q/E 以固定角速度旋转）
 * - 通过 camera/adjust 事件为相机目标 yaw（ty）施加增量，保留 followLag 平滑。
 * - 语义：逆时针 = yaw 增大；顺时针 = yaw 减小（俯视坐标系常用约定）。
 */
import type { System, World } from '@domain/core/world' // 引入：系统/世界类型

/**
 * 创建相机连续旋转系统
 * 参数：rateDegPerSec —— 角速度（度/秒），默认 90；leftKey/rightKey —— 默认 KeyQ/KeyE
 * 返回：System —— 每帧根据按键施加相机 yaw 增量
 */
export function cameraRotateHoldSystem(opts?: { rateDegPerSec?: number; leftKey?: string; rightKey?: string }): System { // 导出：相机连续旋转系统（leftKey 表示逆时针，rightKey 表示顺时针）
  const rateDegPerSec = opts?.rateDegPerSec ?? 90
  const leftKey = opts?.leftKey ?? 'KeyQ' // 逆时针键（yaw 增大）
  const rightKey = opts?.rightKey ?? 'KeyE' // 顺时针键（yaw 减小）
  const rateRadPerSec = (Math.PI / 180) * rateDegPerSec

  // 状态：仅用于打印开始/停止日志
  let prevDir = 0 // -1 右转，0 静止，+1 左转

  function update(dt: number, world: World) {
    const input = world.ports.input
    const state = input?.getState()
    const pressed: Set<string> = state?.pressed ?? new Set()

    const qDown = pressed.has(leftKey)
    const eDown = pressed.has(rightKey)
    const dir = (qDown ? 1 : 0) + (eDown ? -1 : 0) // 逆时针为正，顺时针为负；同时按下相互抵消

    if (dir !== 0 && dt > 0) {
      const yawDelta = dir * rateRadPerSec * dt
      world.bus.emit({ type: 'camera/adjust', payload: { yawDelta } })
    }

    if (dir !== prevDir) {
      if (prevDir === 0 && dir !== 0) {
        console.log(`[相机] 连续旋转开始：${dir > 0 ? '逆时针' : '顺时针'}，速率=${rateDegPerSec}°/s`)
      } else if (prevDir !== 0 && dir === 0) {
        console.log('[相机] 连续旋转停止')
      } else if (prevDir !== 0 && dir !== 0 && dir !== prevDir) {
        console.log(`[相机] 连续旋转方向切换：${dir > 0 ? '→逆时针' : '→顺时针'}，速率=${rateDegPerSec}°/s`)
      }
      prevDir = dir
    }
  }

  return { name: 'CameraRotateHold', update }
}
