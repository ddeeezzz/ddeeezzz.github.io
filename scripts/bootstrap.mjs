/**
 * TODO（自动化流程）
 * - 顺序执行：
 *   1) 读取进度（可选）
 *   2) 生成锁文件：`npm install --package-lock-only`
 *   3) 安装依赖（使用锁）：`npm ci`
 *   4) 运行测试：`npm test`
 *   5) 保存进度（可选日志追加）
 *   6) 本地预览：`npm run dev`
 * - 选项：
 *   --skip-test 跳过测试；--with-dev 启动 dev（默认启用）；--no-dev 不启动。
 *   --force-lock 强制重建锁文件；--no-load 启动时不读取进度；--no-save 不保存进度；--log 追加日志到 SESSION_LOG。
 */
// 导入子进程工具：用于执行 npm 命令
import { spawn } from 'node:child_process'
// 导入文件系统与路径：用于检测锁文件是否存在
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/** 运行一个命令并继承输出来到控制台 */
function run(cmd, args) {
  return new Promise((resolvePromise, reject) => {
    console.log(`[执行] ${cmd} ${args.join(' ')}`)
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true })
    child.on('exit', (code) => {
      if (code === 0) resolvePromise(undefined)
      else reject(new Error(`${cmd} 退出码 ${code}`))
    })
  })
}

/** 解析命令行参数 */
function parseFlags(argv) {
  return {
    skipTest: argv.includes('--skip-test'),
    withDev: argv.includes('--with-dev') || !argv.includes('--no-dev'),
    forceLock: argv.includes('--force-lock'),
    noLoad: argv.includes('--no-load'),
    noSave: argv.includes('--no-save'),
    log: argv.includes('--log')
  }
}

/** 主流程：自动化安装/测试/预览 */
async function main() {
  const flags = parseFlags(process.argv.slice(2))
  const root = dirname(fileURLToPath(import.meta.url))
  console.log('[启动] 自动化流程开始')

  // 0) 读取进度（可选）
  if (!flags.noLoad) {
    try {
      await run('node', ['scripts/context/load.mjs'])
    } catch (e) {
      console.warn('[警告] 读取进度失败：', e?.message || e)
    }
  }

  // 1) 生成锁文件（首次）
  const lockPath = resolve(root, '../package-lock.json')
  const needLock = flags.forceLock || !existsSync(lockPath)
  if (needLock) {
    console.log('[步骤1] 生成 package-lock.json')
    await run('npm', ['install', '--package-lock-only'])
  } else {
    console.log('[步骤1] 已存在 package-lock.json，跳过生成')
  }

  // 2) 安装依赖（使用锁）
  console.log('[步骤2] 安装依赖（npm ci）')
  await run('npm', ['ci'])

  // 3) 运行测试
  if (!flags.skipTest) {
    console.log('[步骤3] 运行测试（npm test）')
    await run('npm', ['test'])
  } else {
    console.log('[步骤3] 跳过测试 (--skip-test)')
  }

  // 3.5) 保存进度
  if (!flags.noSave) {
    const args = ['scripts/context/save.mjs']
    if (flags.log) args.push('--append-log')
    console.log('[步骤3.5] 保存进度')
    try {
      await run('node', args)
    } catch (e) {
      console.warn('[警告] 保存进度失败：', e?.message || e)
    }
  }

  // 4) 本地预览
  if (flags.withDev) {
    console.log('[步骤4] 启动本地预览（npm run dev）')
    await run('npm', ['run', 'dev']) // 保持前台运行
  } else {
    console.log('[步骤4] 跳过本地预览 (--no-dev)')
  }
}

// 直接执行脚本时运行主流程
main().catch((err) => {
  console.error('[失败]', err?.message || err)
  process.exit(1)
})
