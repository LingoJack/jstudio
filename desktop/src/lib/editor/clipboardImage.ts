/**
 * Native clipboard image reading for Tauri WebView.
 *
 * In Tauri's WebView (especially macOS WKWebView), when a user copies an image
 * at the system level (screenshot, Finder copy, etc.), the browser's
 * `clipboardData.items` does NOT contain the image. We must fall back to reading
 * the native clipboard via Tauri's clipboard-manager plugin.
 *
 * The native clipboard returns raw RGBA pixels + dimensions. We render those
 * onto a <canvas> and export as a PNG data URL so the result can flow through
 * the same upload pipeline as regular File-based pastes.
 */

import { readImage } from '@tauri-apps/plugin-clipboard-manager';

/**
 * Check whether the native clipboard currently holds an image.
 *
 * Returns `null` if no image is present or if not running under Tauri.
 */
export async function getClipboardImageAsFile(): Promise<File | null> {
  try {
    const img = await readImage();
    const { width, height } = await img.size();
    if (!width || !height) return null;

    const rgba = await img.rgba();

    // Render RGBA pixels onto a canvas → PNG data URL → File
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
    ctx.putImageData(imageData, 0, 0);

    const blob: Blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png');
    });
    if (!blob) return null;

    return new File([blob], `clipboard-${Date.now()}.png`, {
      type: 'image/png',
    });
  } catch {
    // No image in clipboard, or not running under Tauri
    return null;
  }
}
