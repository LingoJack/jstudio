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

import { logger } from '../core/logger';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface PreviewPayload {
  src: string;
  fileName: string;
  fileSize: number;
  category: string;
  /**
   * Inline HTML source. When present (e.g. previewing an HTML code block),
   * the preview window renders it via an iframe `srcDoc` instead of loading
   * `src` as a URL.
   */
  html?: string;
  /**
   * Document context needed to resolve a doc-relative asset path (`assets/…`)
   * to a same-origin blob URL in the preview window. `src` should be the
   * portable `assets/{name}` form when this is provided.
   */
  docContext?: {
    studioRoot: string;
    docId: string;
  };
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

  logger.debug('PreviewWindow', 'Opening new window: ' + label + ' ' + payload.fileName);

  const shortName =
    payload.fileName.length > 40
      ? payload.fileName.slice(0, 37) + '...'
      : payload.fileName;

  // 1. Store payload in Rust memory so the new window can retrieve it.
  try {
    await invoke('set_preview_data', { label, data: payload });
    logger.debug('PreviewWindow', 'Data stored in Rust cache for ' + label);
  } catch (e) {
    console.error('[PreviewWindow] Failed to store preview data:', e);
    return;
  }

  // 2. Create the new webview window.
  const webviewWindow = new WebviewWindow(label, {
    url: 'index.html?window=preview',
    title: `预览 - ${shortName}`,
    width: 1280,
    height: 860,
    minWidth: 480,
    minHeight: 360,
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
    logger.debug('PreviewWindow', 'Window created successfully: ' + label);
  });

  webviewWindow.once('tauri://error', (e) => {
    console.error('[PreviewWindow] Failed to create window:', e);
  });
}

/**
 * Preview a snippet of inline HTML source in a new OS window (used by the
 * HTML code block's "preview in new window" action).
 *
 * Reuses the same window + Rust-memory transport as file preview, but passes
 * the source via the `html` field so the preview window renders it with an
 * iframe `srcDoc` rather than loading a URL.
 */
export async function openHtmlPreviewWindow(
  html: string,
  title = 'HTML',
): Promise<void> {
  const fileSize = new Blob([html]).size;
  await openPreviewWindow({
    src: '',
    html,
    fileName: title,
    fileSize,
    category: 'html',
  });
}

/* ------------------------------------------------------------------ */
/* Receiver side (preview window)                                     */
/* ------------------------------------------------------------------ */

/**
 * In the preview window, retrieve the file data payload from Rust memory.
 * The label of this window is used as the key.
 *
 * NOTE: A module-level promise cache dedupes React StrictMode's double
 * effect invocation in dev.  `get_preview_data` is a *destructive* read
 * (it removes the entry from the Rust cache), so a second concurrent fetch
 * would always return null and the window would render forever-loading.
 * Sharing one promise guarantees both callers get the same payload.
 */
let cachedPreviewFetch: Promise<PreviewPayload | null> | null = null;

export function fetchPreviewData(): Promise<PreviewPayload | null> {
  if (cachedPreviewFetch) return cachedPreviewFetch;

  const doFetch = async (): Promise<PreviewPayload | null> => {
    const label = getCurrentWindow().label;
    logger.debug('PreviewWindow', 'Fetching preview data for label: ' + label);

    // Retry a few times — the data might not be fully committed yet.
    for (let i = 0; i < 20; i++) {
      try {
        const data = await invoke<PreviewPayload | null>('get_preview_data', { label });
        if (data) {
          logger.debug('PreviewWindow', 'Data retrieved on attempt ' + (i + 1));
          return data;
        }
      } catch (e) {
        console.error('[PreviewWindow] Error fetching data:', e);
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    console.error('[PreviewWindow] Failed to retrieve preview data after retries');
    return null;
  };

  cachedPreviewFetch = doFetch();
  return cachedPreviewFetch;
}

/**
 * Close the current preview window.
 */
export function closePreviewWindow(): void {
  getCurrentWindow().close();
}
