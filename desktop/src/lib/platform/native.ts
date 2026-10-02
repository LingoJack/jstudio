/**
 * native.ts — typed accessor for the Electron preload bridge
 * (`window.jstudioNative`, see electron/preload.ts). Every platform module
 * in this directory builds on top of this single object.
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
  clipboardWriteImage: (png: Uint8Array) => Promise<void>;
  clipboardWriteImageFile: (filePath: string) => Promise<void>;
  shellOpen: (url: string) => Promise<void>;
  openDevtools: () => Promise<void>;
  /** Bundled app file (webfont inside app.asar) as a base64 string. */
  appFileBase64: (url: string) => Promise<string>;
}

declare global {
  interface Window {
    jstudioNative: JstudioNative;
  }
}

export function native(): JstudioNative {
  if (!window.jstudioNative) {
    throw new Error(
      '[platform] window.jstudioNative missing — the Electron preload did not inject it. ' +
        'These platform modules only work inside the Electron shell.',
    );
  }
  return window.jstudioNative;
}
