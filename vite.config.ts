import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

// JStudio Tauri 应用构建配置。
//
// 要点：
// - `base: './'`     —— Tauri production asset 使用相对路径
// - `outDir: 'dist'` —— 与 src-tauri/tauri.conf.json 的 frontendDist 对齐
// - 入口 HTML 使用 `index.html`
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  publicDir: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': '.',
    },
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
          if (id.includes('node_modules/tldraw/')) {
            return 'whiteboard-vendor'
          }
        },
      },
    },
    chunkSizeWarningLimit: 2000,
  },
})
