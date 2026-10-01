/**
 * Shim for `@tauri-apps/api/core` (Electron shell, via vite alias).
 *
 *   invoke('read_settings', …)        → sidecar JSON-RPC (same method names)
 *   convertFileSrc('/abs/path.png')   → jstudio-asset://localhost/…
 */

import { native } from './native';

/**
 * Methods served directly by the Electron main process (native OS APIs the
 * pure-Node sidecar cannot host). Everything else rides sidecarInvoke — the
 * main process then routes agent_* to the Rust agent host and the rest to
 * the Node sidecar (see electron/main.ts wireSidecar).
 */
const MAIN_ONLY_METHODS = new Set([
  'copy_image_to_clipboard',
  'copy_image_bytes_to_clipboard',
]);

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (MAIN_ONLY_METHODS.has(cmd)) {
    // PNG bytes / image file → main-process clipboard (Electron 44 async
    // ClipboardItem API — the sync readImage/writeImage era is gone).
    if (cmd === 'copy_image_bytes_to_clipboard') {
      const data = (args?.data ?? new Uint8Array()) as Uint8Array;
      return native().clipboardWriteImage(data) as T;
    }
    return native().clipboardWriteImageFile((args?.path ?? '') as string) as T;
  }
  return (await native().sidecarInvoke(cmd, args)) as T;
}

/**
 * Tauri format: `asset://localhost/<percent-encoded-path>` (macOS/Linux).
 * Each path segment is encoded separately so slashes survive; the main-side
 * protocol handler (electron/protocol.ts) decodes them symmetrically.
 */
export function convertFileSrc(filePath: string): string {
  const encoded = filePath.split('/').map(encodeURIComponent).join('/');
  return `jstudio-asset://localhost${encoded}`;
}
