/**
 * Shim for `@tauri-apps/api/core` (Electron shell, via vite alias).
 *
 *   invoke('read_settings', …)        → sidecar JSON-RPC (same method names)
 *   convertFileSrc('/abs/path.png')   → jstudio-asset://localhost/…
 */

import { native } from './native';

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
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
