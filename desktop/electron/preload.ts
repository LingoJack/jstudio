/**
 * preload.ts — the ONLY renderer↔main bridge (contextIsolation on).
 *
 * Exposes `window.jstudioNative` — the surface the renderer-side
 * `@tauri-apps/*` shim (src/lib/core/tauriShim/) builds on:
 *   - sidecarInvoke(method, params) → Rust sidecar JSON-RPC
 *   - onEvent(cb)                   → unified main→renderer event bus
 *   - emitEvent(event, payload)     → broadcast to all windows (incl. self)
 *   - windowLabel                   → this window's label (?label= param)
 *   - windowOp(op)                  → close/show/hide/focus/isFocused
 *   - windowCreate(label, options)  → open a child window
 *   - windowGetByLabel(label)       → does a window with this label exist?
 *   - dialogOpen/Save(options)      → native file dialogs
 *   - clipboardReadText/Image       → native clipboard
 *   - shellOpen(url)                → open external URL
 *   - openDevtools()                → open Chromium devtools
 */

import { contextBridge, ipcRenderer } from 'electron';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const windowLabel = params.get('label') ?? 'main';

contextBridge.exposeInMainWorld('jstudioNative', {
  // ── sidecar ──
  sidecarInvoke: (method: string, invokeParams?: unknown): Promise<unknown> =>
    ipcRenderer.invoke('sidecar-invoke', method, invokeParams),

  // ── unified event bus ('jstudio-event': sidecar notifications + main-originated) ──
  onEvent: (cb: (event: string, label: string | undefined, payload: unknown) => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      event: string,
      label: string | undefined,
      payload: unknown,
    ) => cb(event, label, payload);
    ipcRenderer.on('jstudio-event', listener);
    return () => ipcRenderer.removeListener('jstudio-event', listener);
  },
  emitEvent: (event: string, payload?: unknown): void => {
    ipcRenderer.send('renderer-broadcast', event, payload);
  },

  // ── window ──
  windowLabel,
  windowOp: (label: string, op: string): Promise<unknown> =>
    ipcRenderer.invoke('window-op', label, op),
  windowCreate: (label: string, options: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke('window-create', label, options),
  windowGetByLabel: (label: string): Promise<boolean> =>
    ipcRenderer.invoke('window-get-by-label', label),

  // ── dialogs / clipboard / shell ──
  dialogOpen: (options: unknown): Promise<unknown> => ipcRenderer.invoke('dialog-open', options),
  dialogSave: (options: unknown): Promise<unknown> => ipcRenderer.invoke('dialog-save', options),
  clipboardReadText: (): Promise<string> => ipcRenderer.invoke('clipboard-read-text'),
  clipboardReadImage: (): Promise<unknown> => ipcRenderer.invoke('clipboard-read-image'),
  shellOpen: (url: string): Promise<void> => ipcRenderer.invoke('shell-open', url),
  openDevtools: (): Promise<void> => ipcRenderer.invoke('open-devtools'),
});

export type JstudioNative = {
  sidecarInvoke: (method: string, params?: unknown) => Promise<unknown>;
  onEvent: (
    cb: (event: string, label: string | undefined, payload: unknown) => void,
  ) => () => void;
  emitEvent: (event: string, payload?: unknown) => void;
  windowLabel: string;
  windowOp: (label: string, op: string) => Promise<unknown>;
  windowCreate: (label: string, options: Record<string, unknown>) => Promise<unknown>;
  windowGetByLabel: (label: string) => Promise<boolean>;
  dialogOpen: (options: unknown) => Promise<unknown>;
  dialogSave: (options: unknown) => Promise<unknown>;
  clipboardReadText: () => Promise<string>;
  clipboardReadImage: () => Promise<unknown>;
  shellOpen: (url: string) => Promise<void>;
  openDevtools: () => Promise<void>;
};
