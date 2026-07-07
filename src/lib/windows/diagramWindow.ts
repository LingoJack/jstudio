/**
 * diagramWindow.ts — Tauri 独立窗口管理（excalidraw 画板放大编辑）。
 *
 * 主窗口调用 `openDiagramWindow()` 创建一个独立的 OS 窗口，
 * 数据通过 Rust 内存命令（set/get_preview_data）传递初始快照，
 * 编辑期间通过 Rust 内存命令（set/get_diagram_update）轮询回传更新的快照到主窗口。
 *
 * 新窗口加载同一个前端 bundle，通过 URL 参数 `?window=diagram&label=xxx`
 * 来区分渲染逻辑并传递窗口标签（见 main.tsx → DiagramWindowApp）。
 */

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

import { logger } from '../core/logger';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface DiagramPayload {
  /** Source block id. Used to guard updates when a document has many diagrams. */
  blockId?: string;
  /** Serialized excalidraw scene JSON (empty string for a new board). */
  snapshot: string;
  /** Dark mode flag. */
  darkMode?: boolean;
}

/* ------------------------------------------------------------------ */
/* Sender side (main window — opens the diagram editor window)        */
/* ------------------------------------------------------------------ */

let diagramCounter = 0;

/**
 * Open an excalidraw diagram editor in a new independent OS window.
 *
 * @param snapshot  Initial excalidraw scene JSON (empty = blank board).
 * @param onUpdate  Callback fired whenever the diagram window sends an updated snapshot.
 * @param darkMode  Whether to render in dark mode.
 * @returns         An unsubscribe function — call to stop listening for updates.
 */
export async function openDiagramWindow(
  snapshot: string,
  onUpdate: (snapshotJson: string) => void,
  darkMode: boolean,
  blockId?: string,
  onClosed?: () => void,
): Promise<() => void> {
  diagramCounter += 1;
  const label = `diagram-${Date.now()}-${diagramCounter}`;
  logger.debug('[DiagramWindow] Opening new window:', label);

  const payload: DiagramPayload = { snapshot, darkMode, blockId };

  // 1. Store payload in Rust memory so the new window can retrieve it.
  try {
    await invoke('set_preview_data', { label, data: payload });
    logger.debug('[DiagramWindow] Data stored in Rust cache for', label);
  } catch (e) {
    console.error('[DiagramWindow] Failed to store data:', e);
    return () => {};
  }

  // 2. Poll for snapshot updates from the diagram window (Rust relay).
  //    This avoids cross-window event permission issues entirely.
  let stopped = false;
  let lastApplied = snapshot;
  const poll = async () => {
    logger.debug('[DiagramWindow] Poll loop started for', label);
    while (!stopped) {
      try {
        const data = await invoke<DiagramPayload | null>(
          'get_diagram_update',
          { label },
        );
        if (
          typeof data?.snapshot === 'string' &&
          data.snapshot !== lastApplied &&
          (!blockId || !data.blockId || data.blockId === blockId)
        ) {
          logger.debug('[DiagramWindow] Received update from window, length:', data.snapshot.length);
          lastApplied = data.snapshot;
          onUpdate(data.snapshot);
        }
      } catch (e) {
        console.error('[DiagramWindow] Poll error:', e);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    logger.debug('[DiagramWindow] Poll loop stopped for', label);
  };
  poll();

  // 3. Create the new webview window — pass label via URL so the child
  //    window can retrieve its own data without relying on getCurrentWindow().
  const webviewWindow = new WebviewWindow(label, {
    url: `index.html?window=diagram&label=${encodeURIComponent(label)}`,
    title: '画板编辑',
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
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
    logger.debug('[DiagramWindow] Window created:', label);
  });

  webviewWindow.once('tauri://error', (e) => {
    console.error('[DiagramWindow] Error:', e);
    onClosed?.();
  });

  webviewWindow.once('tauri://destroyed', () => {
    logger.debug('[DiagramWindow] Window destroyed:', label);
    stopped = true;
    onClosed?.();
  });

  // Return unsubscribe function.
  return () => {
    stopped = true;
    // Clean up Rust cache for this label.
    invoke('clear_diagram_update', { label }).catch(() => {});
  };
}

/* ------------------------------------------------------------------ */
/* Receiver side (diagram window — runs inside the new OS window)     */
/* ------------------------------------------------------------------ */

/** Resolve this window's label — prefer URL param, fallback to Tauri API. */
function resolveLabel(): string {
  // Primary: URL query param (most reliable across Tauri v2 versions).
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('label');
  if (fromUrl) return fromUrl;

  // Fallback: Tauri window label.
  try {
    return getCurrentWindow().label;
  } catch {
    return '';
  }
}

/**
 * In the diagram window, retrieve the initial payload from Rust memory.
 * Retries a few times in case the data isn't committed yet.
 *
 * NOTE: A module-level promise cache is used so that React StrictMode
 * (which double-invokes effects in dev) doesn't trigger two independent
 * fetches.  The Rust `get_preview_data` is a *destructive* read (it
 * removes the entry from the cache), so a second concurrent fetch would
 * always return null.  Deduplicating here ensures both callers share the
 * same result.
 */
let cachedFetch: Promise<DiagramPayload | null> | null = null;

export function fetchDiagramData(): Promise<DiagramPayload | null> {
  if (cachedFetch) return cachedFetch;

  const doFetch = async (): Promise<DiagramPayload | null> => {
    const label = resolveLabel();
    logger.debug('[DiagramWindow] Fetching data for label:', label);

    for (let i = 0; i < 20; i++) {
      try {
        const data = await invoke<DiagramPayload | null>('get_preview_data', {
          label,
        });
        if (data) {
          logger.debug('[DiagramWindow] Data retrieved on attempt', i + 1);
          return data;
        }
      } catch (e) {
        console.error('[DiagramWindow] Error fetching data:', e);
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    console.error('[DiagramWindow] Failed to retrieve data after retries');
    return null;
  };

  cachedFetch = doFetch();
  return cachedFetch;
}

/**
 * Send an updated snapshot back to the main window.
 * Called from within the diagram window.
 *
 * Uses a Rust in-memory command (`set_diagram_update`) rather than Tauri
 * events, because cross-window `emitTo` may be blocked by capabilities
 * permissions.  The main window polls `get_diagram_update` periodically.
 */
export async function sendDiagramUpdate(snapshot: string): Promise<void> {
  const label = resolveLabel();
  logger.debug('[DiagramWindow] Sending update for label:', label, 'snapshot length:', snapshot.length);
  try {
    const payload = await fetchDiagramData();
    await invoke('set_diagram_update', {
      label,
      data: { snapshot, blockId: payload?.blockId } satisfies DiagramPayload,
    });
    logger.debug('[DiagramWindow] Update stored in Rust cache OK');
  } catch (e) {
    console.error('[DiagramWindow] Failed to send update:', e);
  }
}

/**
 * Close the current diagram window.
 */
export function closeDiagramWindow(): void {
  getCurrentWindow().close();
}
