/**
 * TODO（阶段 2：渲染端口定义）
 * - 用端口隔离 Three.js，领域层仅依赖本接口。
 * - 提供请求帧/渲染/尺寸更新/相机应用等方法占位。
 */
export interface CameraState { // 导出：相机状态数据（域层→渲染适配器）
  yaw: number
  pitch: number
  distance: number
  height: number
  fov: number
  center: { x: number; y: number; z: number } // 相机跟随中心（例如玩家位置）
}

// 导出：实体变换数据（供渲染端同步 Mesh 位置与朝向）
export interface EntityTransform { // 导出：实体变换（位置与 Y 轴朝向）
  position: { x: number; y: number; z: number }
  rotationY: number
  scale?: number // 可选：整体缩放（用于标记涟漪）
  opacity?: number // 可选：不透明度（用于标记渐隐）
  color?: number // 可选：材质颜色（用于标记换色）
}

export interface RenderPort { // 导出：渲染端口契约
  requestFrame(cb: (t?: number) => void): void
  render(): void
  resize(): void
  applyCamera(state: CameraState): void
  // 下列为阶段5新增：基础实体创建与变换同步（最小化接口，用于玩家可视化）
  ensureEntity(id: string, kind: 'player' | string): void // 导出：确保实体已创建（按种类生成基本几何体）
  applyEntity(id: string, tf: EntityTransform): void // 导出：应用实体变换（位置与朝向）
  removeEntity?(id: string): void // 导出：可选移除实体（清理 Mesh）
  clearAll?(): void // 导出：可选清空当前已创建的所有实体
  pick?(xNdc: number, yNdc: number): { objectId: string, objectKind: string, point: { x: number, y: number, z: number } } | null // 导出：可选的拾取接口
  dispose(): void // 清理资源与事件监听
}
