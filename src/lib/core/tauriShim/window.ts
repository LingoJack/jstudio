/**
 * Shim for `@tauri-apps/api/window` (Electron shell, via vite alias).
 *
 * Only the surface the frontend actually uses: `.label` plus
 * close/show/hide/setFocus/isFocused. Operations target THIS window's label
 * (injected by the preload from the `?label=` URL param).
 */

import { native } from './native';

export class Window {
  readonly label: string;

  constructor(label: string) {
    this.label = label;
  }

  async close(): Promise<void> {
    await native().windowOp(this.label, 'close');
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
}

export function getCurrentWindow(): Window {
  return new Window(native().windowLabel);
}
