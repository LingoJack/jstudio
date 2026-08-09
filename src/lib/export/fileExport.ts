/**
 * download.ts - 文件导出 & 剪贴板工具（Tauri 原生）
 *
 * - 保存文件：Tauri save() 对话框 + write_file_bytes 命令
 * - 复制图片：copy_image_bytes_to_clipboard Rust 命令（避免临时文件）
 * - 复制文本：navigator.clipboard.writeText（Tauri webview 兼容）
 */

import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

/* ── 保存到文件 ────────────────────────────────────────────── */

/** 弹出原生保存对话框，将 Blob 写入用户选择的路径 */
export async function saveBlob(blob: Blob, defaultName: string, filterName: string, extensions: string[]): Promise<void> {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: filterName, extensions }],
  });
  if (!path) return; // 用户取消

  const bytes = new Uint8Array(await blob.arrayBuffer());
  await invoke('write_file_bytes', { path, data: Array.from(bytes) });
}

/** 弹出原生保存对话框，将 SVG 字符串写入用户选择的路径 */
export async function saveSvg(svgString: string, defaultName: string): Promise<void> {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: 'SVG', extensions: ['svg'] }],
  });
  if (!path) return;

  const bytes = new TextEncoder().encode(svgString);
  await invoke('write_file_bytes', { path, data: Array.from(bytes) });
}

/* ── 复制到剪贴板 ──────────────────────────────────────────── */

/** 将 PNG Blob 复制到系统剪贴板（通过 Rust 命令，避免临时文件） */
export async function copyImageToClipboard(blob: Blob): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await invoke('copy_image_bytes_to_clipboard', { data: Array.from(bytes) });
}

/** 将文本复制到系统剪贴板 */
export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/* ── SVG -> PNG 转换 ───────────────────────────────────────── */

/**
 * 将 SVG 字符串转为 PNG Blob。
 *
 * 原理：把 SVG 编码为 data URL -> 用 <img> 加载 -> 绘制到 <canvas> -> toBlob。
 * 需要传入背景色（如 '#ffffff'），否则透明背景在某些环境下不可见。
 */
export function svgToPngBlob(
  svgString: string,
  width: number,
  height: number,
  background = '#ffffff',
  scale = 2,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob returned null'));
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Failed to load SVG as image'));
    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
    img.src = dataUrl;
  });
}
