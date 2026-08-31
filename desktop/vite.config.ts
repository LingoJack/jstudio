import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

// JStudio 应用构建配置（Electron 壳）。
//
// 要点：
// - `base: './'`     —— production asset 使用相对路径
// - `outDir: 'dist'` —— 与 electron-builder.yml 的 files 对齐
// - `@tauri-apps/*` 全部 alias 到 src/lib/core/tauriShim/（Electron 桥），
//   前端调用点零改动 —— 历史遗留的导入名，仅此而已。
const shim = (name: string) =>
  fileURLToPath(new URL(`./src/lib/core/tauriShim/${name}`, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Prefer TypeScript sources over stale compiled artefacts: `src/` may
    // contain leftover `*.js` emitted by an older tsc run (they are
    // gitignored), and Vite's default order resolves `.js` before `.ts` —
    // so the app would silently run the stale copy instead of the source.
    extensions: ['.mjs', '.mts', '.ts', '.tsx', '.jsx', '.js', '.json'],
    alias: {
      '@tauri-apps/api/core': shim('core.ts'),
      '@tauri-apps/api/event': shim('event.ts'),
      '@tauri-apps/api/window': shim('window.ts'),
      '@tauri-apps/api/webviewWindow': shim('webviewWindow.ts'),
      '@tauri-apps/plugin-dialog': shim('plugin-dialog.ts'),
      '@tauri-apps/plugin-clipboard-manager': shim('plugin-clipboard-manager.ts'),
      '@tauri-apps/plugin-opener': shim('plugin-opener.ts'),
    },
  },
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
