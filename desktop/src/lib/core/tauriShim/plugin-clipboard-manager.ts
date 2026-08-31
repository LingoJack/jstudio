/**
 * Shim for `@tauri-apps/plugin-clipboard-manager` (Electron shell).
 * Maps to Electron's clipboard in main; `readImage` mirrors the plugin's
 * Image interface (size() + rgba()) used by clipboardImage.ts.
 */

import { native } from './native';

export async function readText(): Promise<string> {
  return native().clipboardReadText();
}

class ClipboardImage {
  constructor(
    private readonly w: number,
    private readonly h: number,
    private readonly pixels: Uint8Array,
  ) {}

  async size(): Promise<{ width: number; height: number }> {
    return { width: this.w, height: this.h };
  }

  async rgba(): Promise<Uint8Array> {
    return this.pixels;
  }
}

export async function readImage(): Promise<ClipboardImage> {
  const img = await native().clipboardReadImage();
  if (!img) throw new Error('no image on clipboard');
  return new ClipboardImage(img.width, img.height, img.rgba);
}
