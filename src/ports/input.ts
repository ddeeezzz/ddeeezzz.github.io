/**
 * TODO（阶段 4：输入端口定义）
 * - 抽象键鼠输入，支持按下/长按/释放状态与滚轮。
 * - 提供轮询式接口，便于系统读取统一输入状态。
 */
export type KeyCode = string // 导出：键值类型（如 'KeyW'）

export interface InputState { // 导出：输入聚合状态
  axes: { x: number; y: number }
  yawDelta: number
  pitchDelta: number
  wheelDelta: number
  pressed: Set<KeyCode>
  lastClick?: { xNdc: number; yNdc: number; button: number } // 新增：上一次鼠标点击（NDC 坐标，[-1,1]）
}

export interface InputPort { // 导出：输入端口契约
  getState(): InputState
  resetFrameDeltas(): void
}
