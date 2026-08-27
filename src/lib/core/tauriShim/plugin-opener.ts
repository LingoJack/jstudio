/**
 * Shim for `@tauri-apps/plugin-opener` (Electron shell, via vite alias).
 * Maps to shell.openExternal in main.
 */

import { native } from './native';

export async function openUrl(url: string): Promise<void> {
  await native().shellOpen(url);
}
