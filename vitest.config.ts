/**
 * TODO（测试基建）
 * - 配置 Vitest：Node 环境、全局测试 API、覆盖率门槛与包含规则。
 * - 后续可按需切换到 jsdom 以测试 DOM/渲染相关逻辑。
 */
// 导入 Vitest 配置方法：用于导出测试配置
import { defineConfig } from 'vitest/config'
// 导入 Node URL 工具：为测试环境配置同样的路径别名
import { fileURLToPath, URL } from 'node:url'

// 导出：Vitest 配置，供 `npm test` 使用
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.spec.js', 'tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/core/**'],
      exclude: ['scripts/**', 'src/app/**', 'src/adapters/**'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 50, functions: 50, branches: 40, statements: 50 }
    }
  },
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@domain': fileURLToPath(new URL('./src/domain', import.meta.url)),
      '@ports': fileURLToPath(new URL('./src/ports', import.meta.url)),
      '@adapters': fileURLToPath(new URL('./src/adapters', import.meta.url)),
      '@types': fileURLToPath(new URL('./src/types', import.meta.url)),
      '@world': fileURLToPath(new URL('./src/world', import.meta.url))
    }
  }
})

