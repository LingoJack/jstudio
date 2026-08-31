/**
 * native.ts — typed accessor for the Electron preload bridge
 * (`window.jstudioNative`, see electron/preload.ts). Every `@tauri-apps/*`
 * shim module in this directory builds on top of this single object.
 *
 * When the renderer runs inside the legacy Tauri shell this object is
 * absent — but the vite alias (vite.config.ts, JSTUDIO_SHELL=electron) only
 * rewires imports in the Electron build, so shim modules never load there.
 */

export interface JstudioNative {
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
  clipboardReadImage: () => Promise<{ width: number; height: number; rgba: Uint8Array } | null>;
  shellOpen: (url: string) => Promise<void>;
  openDevtools: () => Promise<void>;
}

declare global {
  interface Window {
    jstudioNative: JstudioNative;
  }
}

export function native(): JstudioNative {
  if (!window.jstudioNative) {
    throw new Error(
      '[tauriShim] window.jstudioNative missing — the Electron preload did not inject it. ' +
        'These shim modules only work inside the Electron shell.',
    );
  }
  return window.jstudioNative;
}
