/**
 * 工具：静默控制台日志
 * - 用途：在生产环境或指定条件下，关闭 console.log/info/debug（可保留 warn/error）。
 * - 注意：不修改调用方代码，通过覆盖全局 console 方法实现。
 */
export interface SilenceOptions { // 导出：静默选项，供应用入口调用
  keepWarn?: boolean // 是否保留 console.warn（默认 true）
  keepError?: boolean // 是否保留 console.error（默认 true）
}

/**
 * 静默日志：将 console.log/info/debug 替换为无操作函数，可选保留 warn/error。
 * 参数：
 * - options.keepWarn: 是否保留 warn，默认 true
 * - options.keepError: 是否保留 error，默认 true
 */
export function silenceLogs(options?: SilenceOptions) { // 导出：供入口 main.ts 在生产环境调用
  const keepWarn = options?.keepWarn !== false
  const keepError = options?.keepError !== false
  try {
    const noop = () => {}
    // 仅静默常见调试输出
    console.log = noop
    console.info = noop
    console.debug = noop
    // 按需静默 warn/error
    if (!keepWarn) console.warn = noop
    if (!keepError) console.error = noop
  } catch {
    // 忽略：某些运行环境可能不允许重写 console
  }
}

