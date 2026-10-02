import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

// JStudio 应用构建配置（Electron 壳）。
//
// 要点：
// - `base: './'`     —— production asset 使用相对路径
// - `outDir: 'dist'` —— 与 electron-builder.yml 的 files 对齐
// - 平台调用统一走 src/lib/platform/（普通相对导入，无需 alias）。

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Prefer TypeScript sources over stale compiled artefacts: `src/` may
    // contain leftover `*.js` emitted by an older tsc run (they are
    // gitignored), and Vite's default order resolves `.js` before `.ts` —
    // so the app would silently run the stale copy instead of the source.
    extensions: ['.mjs', '.mts', '.ts', '.tsx', '.jsx', '.js', '.json'],
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
