import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

// Viewer bundle — a second, self-contained build used by the HTML export.
//
// Unlike the app build it is:
//   - a single entry (`viewer.html`) with `inlineDynamicImports`, so the
//     export can inline one JS file with no cross-chunk imports
//   - emitted under fixed names (`viewer.js` / `viewer.css`) into
//     `dist-viewer/`, so the exporter can find them without a manifest
//
// Everything else (React plugin, Tailwind) mirrors vite.config.ts: the
// viewer renders the app's real components. 平台调用统一走
// src/lib/platform/（普通相对导入，无需 alias）。

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    extensions: ['.mjs', '.mts', '.ts', '.tsx', '.jsx', '.js', '.json'],
  },
  base: './',
  publicDir: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist-viewer',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'viewer.html',
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'viewer.js',
        assetFileNames: 'viewer[extname]',
      },
    },
    chunkSizeWarningLimit: 8000,
  },
})
