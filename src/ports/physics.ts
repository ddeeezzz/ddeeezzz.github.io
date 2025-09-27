/**
 * 端口：基础物理（阶段 7）
 * - 提供球形射线检测（sphere cast），供移动、战斗等系统使用。
 * - 默认实现为简易近似，可在适配层替换为真实物理引擎。
 */
export interface SphereCastHit { // 导出：球射线检测结果
  hit: boolean
  distance: number
  point?: [number, number, number]
  normal?: [number, number, number]
  objectId?: string
  objectKind?: string
}

export interface PhysicsPort { // 导出：物理端口契约
  sphereCast(origin: [number, number, number], dir: [number, number, number], radius: number, maxDist: number): SphereCastHit
}

