/**
 * TODO（阶段 0：脚手架与基建）
 * - 配置 Vite 基础开发与构建。
 * - 配置路径别名，与 tsconfig.json 保持一致。
 * - 绑定到 0.0.0.0，便于本机/局域网访问，避免 localhost 解析问题。
 */
// 导入 Vite 配置方法：用于导出开发/构建配置
import { defineConfig } from 'vite'
// 导入 Node URL 工具：用于解析别名路径到绝对路径
import { fileURLToPath, URL } from 'node:url'

// 导出：Vite 配置对象，供开发与构建使用
export default defineConfig({
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 5174, strictPort: true },
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
