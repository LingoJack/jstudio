/**
 * previewWindow.ts — Tauri 新窗口预览工具。
 *
 * 主窗口调用 `openPreviewWindow()` 创建一个独立的 OS 窗口，
 * 数据通过 Rust 内存命令（set/get_preview_data）传递，
 * 避免 Tauri event IPC 对大数据的限制。
 *
 * 新窗口加载同一个前端 bundle，通过 URL 参数 `?window=preview`
 * 来区分渲染逻辑（见 main.tsx → PreviewWindowApp）。
 */

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

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

let previewCounter = 0;

/**
 * Open a file in a new independent OS window for enlarged preview.
 */
export async function openPreviewWindow(payload: PreviewPayload): Promise<void> {
  previewCounter += 1;
  const label = `preview-${Date.now()}-${previewCounter}`;

  console.log('[PreviewWindow] Opening new window:', label, payload.fileName);

  const shortName =
    payload.fileName.length > 40
      ? payload.fileName.slice(0, 37) + '...'
      : payload.fileName;

  // 1. Store payload in Rust memory so the new window can retrieve it.
  try {
    await invoke('set_preview_data', { label, data: payload });
    console.log('[PreviewWindow] Data stored in Rust cache for', label);
  } catch (e) {
    console.error('[PreviewWindow] Failed to store preview data:', e);
    return;
  }

  // 2. Create the new webview window.
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

  webviewWindow.once('tauri://created', () => {
    console.log('[PreviewWindow] Window created successfully:', label);
  });

  webviewWindow.once('tauri://error', (e) => {
    console.error('[PreviewWindow] Failed to create window:', e);
  });
}

/* ------------------------------------------------------------------ */
/* Receiver side (preview window)                                     */
/* ------------------------------------------------------------------ */

/**
 * In the preview window, retrieve the file data payload from Rust memory.
 * The label of this window is used as the key.
 */
export async function fetchPreviewData(): Promise<PreviewPayload | null> {
  const label = getCurrentWindow().label;
  console.log('[PreviewWindow] Fetching preview data for label:', label);

  // Retry a few times — the data might not be fully committed yet.
  for (let i = 0; i < 20; i++) {
    try {
      const data = await invoke<PreviewPayload | null>('get_preview_data', { label });
      if (data) {
        console.log('[PreviewWindow] Data retrieved on attempt', i + 1);
        return data;
      }
    } catch (e) {
      console.error('[PreviewWindow] Error fetching data:', e);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.error('[PreviewWindow] Failed to retrieve preview data after retries');
  return null;
}

/**
 * Close the current preview window.
 */
export function closePreviewWindow(): void {
  getCurrentWindow().close();
}
