/**
 * 系统：输入帧末重置
 * - 在每帧逻辑末尾统一清理 yaw/pitch/wheel/lastClick 增量
 * - 目的：避免在相机 sample 时过早清理，导致其他系统拿不到点击事件
 */
import type { System, World } from '@domain/core/world' // 引入：世界/系统类型

export function frameResetSystem(): System { // 导出：输入帧末重置系统
  return {
    name: 'FrameReset',
    update: (_dt: number, world: World) => {
      world.ports.input?.resetFrameDeltas()
    }
  }
}

