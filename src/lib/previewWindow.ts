/**
 * previewWindow.ts — Tauri 新窗口预览工具。
 *
 * 主窗口调用 `openPreviewWindow()` 创建一个独立的 OS 窗口，
 * 然后通过 Tauri event 将文件数据发送过去。
 *
 * 新窗口加载同一个前端 bundle，通过 URL 参数 `?window=preview`
 * 来区分渲染逻辑（见 main.tsx → PreviewWindowApp）。
 */

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit, listen } from '@tauri-apps/api/event';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface PreviewPayload {
  src: string;
  fileName: string;
  fileSize: number;
  category: string;
}

/* ------------------------------------------------------------------ */
/* Sender side (main window)                                          */
/* ------------------------------------------------------------------ */

/** Globally increasing counter to generate unique window labels. */
let previewCounter = 0;

/**
 * Open a file in a new independent OS window for enlarged preview.
 *
 * @param payload  File data to preview
 */
export async function openPreviewWindow(payload: PreviewPayload): Promise<void> {
  previewCounter += 1;
  const label = `preview-${Date.now()}-${previewCounter}`;

  // Truncate very long file names for the window title.
  const shortName =
    payload.fileName.length > 40
      ? payload.fileName.slice(0, 37) + '...'
      : payload.fileName;

  const webviewWindow = new WebviewWindow(label, {
    url: 'index.html?window=preview',
    title: `预览 - ${shortName}`,
    width: 960,
    height: 720,
    minWidth: 400,
    minHeight: 300,
    resizable: true,
    maximizable: true,
    minimizable: true,
    closable: true,
    decorations: true,
    transparent: false,
    shadow: true,
    center: true,
  });

  webviewWindow.once('tauri://created', async () => {
    // Small delay to ensure the new window's JS listener is ready.
    await new Promise((r) => setTimeout(r, 200));
    await emit(`preview-data-${label}`, payload);
  });

  webviewWindow.once('tauri://error', (e) => {
    console.error('Failed to create preview window:', e);
  });
}

/* ------------------------------------------------------------------ */
/* Receiver side (preview window)                                     */
/* ------------------------------------------------------------------ */

/**
 * In the preview window, listen for the file data payload.
 * Returns an unsubscribe function.
 */
export async function onPreviewData(
  callback: (payload: PreviewPayload) => void,
): Promise<() => void> {
  const currentLabel = getCurrentWindow().label;

  const unlisten = await listen<PreviewPayload>(
    `preview-data-${currentLabel}`,
    (event) => {
      callback(event.payload);
    },
  );

  // Also try emitting a "ready" signal so the main window can resend
  // if it sent the data before the listener was registered.
  await emit(`preview-ready-${currentLabel}`, {});

  return unlisten;
}

/**
 * Close the current preview window.
 */
export function closePreviewWindow(): void {
  getCurrentWindow().close();
}
