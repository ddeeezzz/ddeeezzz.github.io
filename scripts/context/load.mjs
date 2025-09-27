/**
 * TODO（进度读取脚本）
 * - 读取 `.context/context.json` 并输出关键信息与下一步任务摘要。
 * - 若缺失，上报提示并建议先运行 `npm run ctx:save`。
 */
// 导入 Node URL 工具：解析当前脚本目录
import { fileURLToPath } from 'node:url'
// 导入 Node 路径工具：拼接工程内路径
import { dirname, resolve } from 'node:path'
// 导入文件系统：读取进度与文档
import { existsSync, readFileSync } from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..', '..')

function printHeader(title) {
  console.log('\n=== ' + title + ' ===')
}

function main() {
  const ctxFile = resolve(root, '.context', 'context.json')
  const sessionPath = resolve(root, 'docs', 'SESSION_LOG.md')

  if (!existsSync(ctxFile)) {
    console.log('[读取] 未发现 .context/context.json，请先运行：npm run ctx:save')
    return
  }

  const ctx = JSON.parse(readFileSync(ctxFile, 'utf-8'))
  printHeader('进度概要')
  console.log(`保存时间: ${ctx.savedAt}`)
  console.log(`Node/npm: ${ctx.node} / ${ctx.npm}`)
  console.log(`关键文件: ${ctx.files.join(', ')}`)
  console.log(`建议端口: ${ctx.lastDevPort}`)

  printHeader('未完成任务（摘要）')
  if (ctx.nextTasks?.length) {
    ctx.nextTasks.slice(0, 12).forEach((line) => console.log(line))
  } else {
    console.log('（暂无或未解析到，参考 docs/SESSION_LOG.md）')
  }

  if (existsSync(sessionPath)) {
    printHeader('SESSION_LOG 片段（末尾 40 行）')
    const lines = readFileSync(sessionPath, 'utf-8').split(/\r?\n/)
    console.log(lines.slice(-40).join('\n'))
  }

  printHeader('建议提示（供智能体恢复进度）')
  console.log(
    '请读取并基于以下文件恢复进度：AGENTS.md、docs/SESSION_LOG.md、package.json 脚本与 vite.config.ts。然后总结当前阶段进度，并从 docs/SESSION_LOG.md 的“阶段xxxxx”开始执行与补测。'
  )
}

main()

