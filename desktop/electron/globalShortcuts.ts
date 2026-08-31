/**
 * globalShortcuts.ts — OS-level global shortcuts (replaces
 * src-tauri/src/commands/global_shortcut.rs + tauri-plugin-global-shortcut).
 *
 * The frontend's flow is unchanged: `unregister_all_global_shortcuts` then
 * one `register_global_shortcut` per enabled config, carrying the action
 * config JSON. When the OS fires the shortcut we broadcast
 * `global-shortcut-triggered` with that config as payload; the main
 * window's ACTION_REGISTRY dispatches it.
 */

import { globalShortcut } from 'electron';

export const SHORTCUT_EVENT = 'global-shortcut-triggered';

/**
 * Convert the frontend binding format (`"mod+shift+p"`) to Electron's
 * accelerator format (`"CommandOrControl+Shift+P"`). Same mapping the Rust
 * side applied for global-hotkey.
 */
export function toAccelerator(binding: string): string {
  const parts: string[] = [];
  for (const raw of binding.split('+')) {
    const token = raw.trim();
    if (!token) continue;
    switch (token.toLowerCase()) {
      case 'mod':
      case 'cmd':
      case 'meta':
      case 'super':
        parts.push('CommandOrControl');
        break;
      case 'alt':
      case 'option':
      case 'opt':
        parts.push('Alt');
        break;
      case 'shift':
        parts.push('Shift');
        break;
      case 'ctrl':
      case 'control':
        parts.push('Control');
        break;
      default:
        parts.push(token.length === 1 ? token.toUpperCase() : token[0].toUpperCase() + token.slice(1));
    }
  }
  if (parts.length < 2) {
    throw new Error(`Invalid shortcut '${binding}': at least one modifier + one key is required`);
  }
  return parts.join('+');
}

/** Map frontend binding → registered accelerator (for unregister). */
const registered = new Map<string, string>();

export function registerOne(
  shortcutStr: string,
  actionConfigJson: unknown,
  fire: (payload: unknown) => void,
): void {
  const accel = toAccelerator(shortcutStr);
  const ok = globalShortcut.register(accel, () => fire(actionConfigJson));
  if (!ok) throw new Error(`Failed to register shortcut '${shortcutStr}' (accelerator '${accel}')`);
  registered.set(shortcutStr, accel);
}

export function unregisterOne(shortcutStr: string): void {
  const accel = registered.get(shortcutStr) ?? toAccelerator(shortcutStr);
  globalShortcut.unregister(accel);
  registered.delete(shortcutStr);
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll();
  registered.clear();
}
