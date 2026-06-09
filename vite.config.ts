import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// jstudio Tauri 应用构建配置。
//
// 要点：
// - `base: './'`     —— Tauri production asset 使用相对路径
// - `outDir: 'dist'` —— 与 src-tauri/tauri.conf.json 的 frontendDist 对齐
// - 入口 HTML 使用 `index.html`
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  // Reader SPA 不需要任何 public 资源，禁用 public 目录拷贝以保持产物精简。
  publicDir: false,
  resolve: {
    alias: [
      // 关键：把裸 `refractor` 包重定向到 `refractor/core`（empty kernel），
      // 避免把 ~280 种语言全打进 bundle。子路径 `refractor/<lang>` 不受影响
      // —— 用精确正则只匹配裸名，子路径仍走 package exports。
      { find: /^refractor$/, replacement: 'refractor/core' },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  clearScreen: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html',
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/')
          ) {
            return 'react-vendor'
          }
          // refractor 走单独 chunk
          if (id.includes('node_modules/refractor/')) {
            return 'editor-vendor'
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
