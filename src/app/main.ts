/**
 * TODO（阶段 2：渲染基线 & 阶段 3：相机基础）
 * - 创建/挂载画布容器，初始化渲染适配器（Three）。
 * - 读取 config/ 下配置（相机/世界），调用组合根完成装配。
 * - 帧循环：固定逻辑步（预留），渲染可变；窗口缩放适配。
 */
// 导入应用装配函数：用于初始化端口与世界对象
import { composeApp } from './setup' // 应用装配入口，用于初始化端口与世界
import { silenceLogs } from '../utils/silence-logs' // 引入：日志静默工具，用于生产环境关闭调试输出

/**
 * 确保并创建页面根节点。
 * 参数：无
 * 返回：用于挂载渲染画布的 DOM 容器。
 */
function ensureRoot(): HTMLElement {
  let root = document.getElementById('app')
  if (!root) {
    root = document.createElement('div')
    root.id = 'app'
    document.body.style.margin = '0'
    document.body.appendChild(root)
  }
  return root
}

/**
 * 应用入口：准备容器并装配应用。
 * - 关键日志：启动与装配完成。
 */
async function main() {
  const root = ensureRoot()
  // 在生产环境或显式设置下静默调试日志（保留 warn/error）
  try {
    const isProd = (import.meta as any)?.env?.PROD === true
    const silentFlag = typeof localStorage !== 'undefined' && localStorage.getItem('log:silent') === '1'
    if (isProd || silentFlag) {
      silenceLogs({ keepWarn: true, keepError: true })
    }
  } catch {}
  // 中文日志：启动应用
  console.log('[启动] 初始化应用容器')
  // 全局错误日志（未处理异常/Promise 拒绝）
  window.addEventListener('error', (e) => {
    console.error('[错误] 未处理异常:', e.message, e.error)
  })
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[错误] 未处理 Promise 拒绝:', e.reason)
  })
  try {
    await composeApp(root)
    console.log('[完成] 应用装配完成，等待后续系统接入')
  } catch (err) {
    console.error('[错误] 应用装配失败:', err)
  }
}

void main()

