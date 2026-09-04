/**
 * Shim for `@tauri-apps/api/webviewWindow` (Electron shell, via vite alias).
 *
 * `new WebviewWindow(label, options)` asks main to open a BrowserWindow
 * (see electron/main.ts `window-create`). The `tauri://created` /
 * `tauri://error` lifecycle events the detach flows rely on are mapped onto
 * the create promise's settle. Instances obtained via `getByLabel` /
 * `getCurrentWebviewWindow` wrap a label only — ops are label-targeted.
 */

import { native } from './native';
import { subscribeFocusChanged } from './window';
import { listen, type TauriEvent, type UnlistenFn } from './event';

export interface WebviewWindowOptions {
  url?: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  title?: string;
  resizable?: boolean;
  decorations?: boolean;
  focus?: boolean;
  center?: boolean;
  x?: number;
  y?: number;
  transparent?: boolean;
  alwaysOnTop?: boolean;
  skipTaskbar?: boolean;
  [key: string]: unknown;
}

export class WebviewWindow {
  readonly label: string;
  private ready: Promise<unknown>;

  constructor(label: string, options: WebviewWindowOptions = {}) {
    this.label = label;
    this.ready = native().windowCreate(label, options as Record<string, unknown>);
    // Avoid unhandled-rejection noise when no error listener is attached;
    // the rejection is still delivered to 'tauri://error' listeners below.
    this.ready.catch(() => {});
  }

  /** @internal — wrap an already-existing window without creating one. */
  static fromExisting(label: string): WebviewWindow {
    const w = Object.create(WebviewWindow.prototype) as WebviewWindow;
    Object.assign(w, { label, ready: Promise.resolve(null) });
    return w;
  }

  async once(event: string, cb: (e: TauriEvent<unknown>) => void): Promise<UnlistenFn> {
    if (event === 'tauri://created') {
      void this.ready.then(() => cb({ event, payload: null }));
    } else if (event === 'tauri://error') {
      void this.ready.catch((err) => cb({ event, payload: String(err) }));
    } else if (event === 'tauri://destroyed') {
      // Main broadcasts 'window-closed' from trackWindow's 'closed' handler
      // (delete-then-broadcast, so the dying window itself never receives
      // it). Fire once for THIS window's label, then unsubscribe.
      let fired = false;
      let unlisten: UnlistenFn | null = null;
      void listen<{ label: string }>('window-closed', (e) => {
        if (fired || e.payload?.label !== this.label) return;
        fired = true;
        unlisten?.();
        cb({ event, payload: null });
      }).then((u) => {
        if (fired) u();
        else unlisten = u;
      });
    }
    return () => {};
  }

  async listen(event: string, cb: (e: TauriEvent<unknown>) => void): Promise<UnlistenFn> {
    return this.once(event, cb);
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

  static async getByLabel(label: string): Promise<WebviewWindow | null> {
    return (await native().windowGetByLabel(label)) ? WebviewWindow.fromExisting(label) : null;
  }
}

export function getCurrentWebviewWindow(): WebviewWindow {
  return WebviewWindow.fromExisting(native().windowLabel);
}
