/**
 * 组件：线速度（仅平面 xz）
 */
export interface Velocity { // 导出：线速度组件，供移动系统更新
  vx: number
  vz: number
}

/**
 * 工具：创建初始速度
 */
export function createVelocity(vx = 0, vz = 0): Velocity { // 导出：速度工厂函数
  return { vx, vz }
}

