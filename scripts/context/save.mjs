/**
 * TODO（进度保存脚本）
 * - 生成 `.context/context.json`：保存时间、关键文件、Node/npm 版本、未完成任务。
 * - 可选 `--append-log`：向 `docs/SESSION_LOG.md` 追加“自动快照”小节。
 */
// 导入 Node URL 工具：解析当前脚本目录
import { fileURLToPath } from 'node:url'
// 导入 Node 路径工具：拼接工程内路径
import { dirname, resolve } from 'node:path'
// 导入文件系统：读写配置与进度文件
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
// 导入子进程：读取 npm 版本等信息
import { spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..', '..')

function readJSON(p) {
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null }
}

function getNpmVersion() {
  const r = spawnSync('npm', ['-v'], { encoding: 'utf-8' })
  return r.status === 0 ? (r.stdout || '').trim() : ''
}

function extractNextTasks(md) {
  const key = '## 未完成内容'
  const i = md.indexOf(key)
  if (i < 0) return []
  const tail = md.slice(i + key.length)
  const j = tail.indexOf('\n## ')
  const sect = j >= 0 ? tail.slice(0, j) : tail
  return sect
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('- ') || s.startsWith('* '))
}

function main() {
  const pkgPath = resolve(root, 'package.json')
  const agentsPath = resolve(root, 'AGENTS.md')
  const sessionPath = resolve(root, 'docs', 'SESSION_LOG.md')
  const ctxDir = resolve(root, '.context')
  const ctxFile = resolve(ctxDir, 'context.json')

  const pkg = readJSON(pkgPath) || {}
  const sessionMd = existsSync(sessionPath) ? readFileSync(sessionPath, 'utf-8') : ''
  const nextTasks = extractNextTasks(sessionMd)

  if (!existsSync(ctxDir)) mkdirSync(ctxDir)

  const payload = {
    savedAt: new Date().toISOString(),
    node: process.version,
    npm: getNpmVersion(),
    files: ['AGENTS.md', 'docs/SESSION_LOG.md', 'vite.config.ts', 'package.json'],
    pkgName: pkg.name || '',
    scripts: pkg.scripts || {},
    lastDevPort: 5173,
    nextTasks
  }

  writeFileSync(ctxFile, JSON.stringify(payload, null, 2), 'utf-8')
  console.log(`[保存] 进度已写入 ${ctxFile}`)

  if (process.argv.includes('--append-log')) {
    const stamp = new Date().toLocaleString()
    const lines = [
      `\n### 自动快照 ${stamp}`,
      `- Node: ${payload.node} / npm: ${payload.npm}`,
      `- 关键文件：${payload.files.join(', ')}`,
      `- 未完成任务条目数：${payload.nextTasks.length}`
    ]
    appendFileSync(sessionPath, `\n${lines.join('\n')}\n`, 'utf-8')
    console.log(`[保存] 已向 ${sessionPath} 追加自动快照`)
  }
}

main()

