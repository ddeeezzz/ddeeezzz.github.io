/**
 * TODO（阶段 1/2：时间端口）
 * - 固定逻辑步与渲染可变所需的时间来源与节流。
 */
export interface TimePort { // 导出：时间来源端口
  now(): number
}
