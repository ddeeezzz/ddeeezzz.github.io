/**
 * 组件：变换（位置 + Y 轴旋转）
 * - 仅包含平面运动所需的最小数据结构
 */
export interface Transform { // 导出：实体变换组件，供移动/渲染系统使用
  position: { x: number; y: number; z: number }
  rotationY: number
}

/**
 * 工具：创建初始 Transform
 * 参数：可选的初始坐标与朝向
 * 返回：Transform 实例
 */
export function createTransform(x = 0, y = 0, z = 0, rotationY = 0): Transform { // 导出：工厂函数，供实体初始化
  return { position: { x, y, z }, rotationY }
}

