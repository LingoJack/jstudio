/**
 * Platform clipboard (read side) — maps to Electron's clipboard in main;
 * `readImage` exposes size() + rgba() accessors used by clipboardImage.ts.
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

// 写图片统一走 Electron 主进程命令 copy_image_bytes_to_clipboard
// （src/lib/export/fileExport.ts 的 copyImageToClipboard 与 mermaid 图表
// 复制都走该通道）；本模块只保留读取侧。
