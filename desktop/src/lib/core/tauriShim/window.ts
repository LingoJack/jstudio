/**
 * Shim for `@tauri-apps/api/window` (Electron shell, via vite alias).
 *
 * The surface the frontend actually uses: `.label` plus
 * close/destroy/show/hide/setFocus/isFocused/isVisible/onFocusChanged.
 * Operations target THIS window's label (injected by the preload from the
 * `?label=` URL param).
 */

import { native } from './native';
import { listen, type UnlistenFn } from './event';

/** Shared focus subscription (also used by webviewWindow.ts). */
export async function subscribeFocusChanged(
  label: string,
  cb: (focused: boolean) => void,
): Promise<UnlistenFn> {
  return listen<{ label: string; focused: boolean }>('window-focus-changed', (e) => {
    if (e.payload?.label === label) cb(e.payload.focused);
  });
}

export class Window {
  readonly label: string;

  constructor(label: string) {
    this.label = label;
  }

  async close(): Promise<void> {
    await native().windowOp(this.label, 'close');
  }

  async destroy(): Promise<void> {
    await native().windowOp(this.label, 'destroy');
  }

  async show(): Promise<void> {
    await native().windowOp(this.label, 'show');
  }

  async hide(): Promise<void> {
    await native().windowOp(this.label, 'hide');
  }

  async setFocus(): Promise<void> {
    await native().windowOp(this.label, 'focus');
  }

  async isFocused(): Promise<boolean> {
    return (await native().windowOp(this.label, 'isFocused')) as boolean;
  }

  async isVisible(): Promise<boolean> {
    return (await native().windowOp(this.label, 'isVisible')) as boolean;
  }

  async onFocusChanged(cb: (e: { payload: boolean }) => void): Promise<UnlistenFn> {
    return subscribeFocusChanged(this.label, (focused) => cb({ payload: focused }));
  }
}

export function getCurrentWindow(): Window {
  return new Window(native().windowLabel);
}
