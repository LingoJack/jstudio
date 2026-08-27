import { fileURLToPath } from 'node:url'
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
//
// Electron 迁移（P2）：`JSTUDIO_SHELL=electron` 时把 `@tauri-apps/*` 全部
// alias 到 src/lib/core/tauriShim/ —— 调用点零改动；Tauri 壳（默认）不受影响。
const isElectronShell = process.env.JSTUDIO_SHELL === 'electron'
const shim = (name: string) =>
  fileURLToPath(new URL(`./src/lib/core/tauriShim/${name}`, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: isElectronShell
    ? {
        alias: {
          '@tauri-apps/api/core': shim('core.ts'),
          '@tauri-apps/api/event': shim('event.ts'),
          '@tauri-apps/api/window': shim('window.ts'),
          '@tauri-apps/api/webviewWindow': shim('webviewWindow.ts'),
          '@tauri-apps/plugin-dialog': shim('plugin-dialog.ts'),
          '@tauri-apps/plugin-clipboard-manager': shim('plugin-clipboard-manager.ts'),
          '@tauri-apps/plugin-opener': shim('plugin-opener.ts'),
        },
      }
    : undefined,
  base: './',
  publicDir: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
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
          if (id.includes('node_modules/@excalidraw/')) {
            return 'excalidraw-vendor'
          }
          if (id.includes('node_modules/mermaid/') || id.includes('node_modules/@mermaid-js/')) {
            return 'mermaid-vendor'
          }
          if (id.includes('node_modules/cytoscape')) {
            return 'cytoscape-vendor'
          }
          if (id.includes('node_modules/katex')) {
            return 'katex-vendor'
          }
          if (id.includes('node_modules/mammoth')) {
            return 'mammoth-vendor'
          }
        },
      },
    },
    chunkSizeWarningLimit: 2000,
  },
})
