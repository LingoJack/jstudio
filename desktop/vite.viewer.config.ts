import { fileURLToPath } from 'node:url'
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
// Everything else (React plugin, Tailwind, the `@tauri-apps/*` shims) mirrors
// vite.config.ts: the viewer renders the app's real components.
const shim = (name: string) =>
  fileURLToPath(new URL(`./src/lib/core/tauriShim/${name}`, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
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
