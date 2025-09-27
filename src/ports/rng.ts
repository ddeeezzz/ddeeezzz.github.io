/**
 * TODO（阶段 1：随机端口）
 * - 可注入的种子随机数，确保测试可复现。
 */
export interface RngPort { // 导出：可注入的随机数端口
  next(): number // [0,1)
}
