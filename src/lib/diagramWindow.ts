/**
 * diagramWindow.ts — Tauri 独立窗口管理（tldraw 画板放大编辑）。
 *
 * 主窗口调用 `openDiagramWindow()` 创建一个独立的 OS 窗口，
 * 数据通过 Rust 内存命令（set/get_preview_data）传递初始快照，
 * 编辑期间通过 Tauri event 实时回传更新的快照到主窗口。
 *
 * 新窗口加载同一个前端 bundle，通过 URL 参数 `?window=diagram`
 * 来区分渲染逻辑（见 main.tsx → DiagramWindowApp）。
 */

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface DiagramPayload {
  /** Serialized tldraw snapshot JSON (empty string for a new board). */
  snapshot: string;
  /** Dark mode flag. */
  darkMode: boolean;
}

/* ------------------------------------------------------------------ */
/* Sender side (main window — opens the diagram editor window)        */
/* ------------------------------------------------------------------ */

let diagramCounter = 0;

/** Event channel name for snapshot updates flowing back from the diagram window. */
function updateEventName(label: string): string {
  return `diagram-update-${label}`;
}

/**
 * Open a tldraw diagram editor in a new independent OS window.
 *
 * @param snapshot  Initial tldraw snapshot JSON (empty = blank board).
 * @param onUpdate  Callback fired whenever the diagram window sends an updated snapshot.
 * @param darkMode  Whether to render in dark mode.
 * @returns         An unsubscribe function — call to stop listening for updates.
 */
export async function openDiagramWindow(
  snapshot: string,
  onUpdate: (snapshotJson: string) => void,
  darkMode: boolean,
): Promise<() => void> {
  diagramCounter += 1;
  const label = `diagram-${Date.now()}-${diagramCounter}`;
  const eventName = updateEventName(label);

  console.log('[DiagramWindow] Opening new window:', label);

  const payload: DiagramPayload = { snapshot, darkMode };

  // 1. Store payload in Rust memory so the new window can retrieve it.
  try {
    await invoke('set_preview_data', { label, data: payload });
  } catch (e) {
    console.error('[DiagramWindow] Failed to store data:', e);
    return () => {};
  }

  // 2. Listen for snapshot updates from the diagram window.
  let unlisten: UnlistenFn | undefined;
  listen<DiagramPayload>(eventName, (event) => {
    if (event.payload?.snapshot !== undefined) {
      onUpdate(event.payload.snapshot);
    }
  }).then((fn) => {
    unlisten = fn;
  });

  // 3. Create the new webview window.
  const webviewWindow = new WebviewWindow(label, {
    url: 'index.html?window=diagram',
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
    console.log('[DiagramWindow] Window created:', label);
  });

  webviewWindow.once('tauri://error', (e) => {
    console.error('[DiagramWindow] Error:', e);
  });

  // Return unsubscribe function.
  return () => {
    unlisten?.();
  };
}

/* ------------------------------------------------------------------ */
/* Receiver side (diagram window — runs inside the new OS window)     */
/* ------------------------------------------------------------------ */

/**
 * In the diagram window, retrieve the initial payload from Rust memory.
 * Retries a few times in case the data isn't committed yet.
 */
export async function fetchDiagramData(): Promise<DiagramPayload | null> {
  const label = getCurrentWindow().label;
  console.log('[DiagramWindow] Fetching data for label:', label);

  for (let i = 0; i < 20; i++) {
    try {
      const data = await invoke<DiagramPayload | null>('get_preview_data', {
        label,
      });
      if (data) {
        console.log('[DiagramWindow] Data retrieved on attempt', i + 1);
        return data;
      }
    } catch (e) {
      console.error('[DiagramWindow] Error fetching data:', e);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.error('[DiagramWindow] Failed to retrieve data after retries');
  return null;
}

/**
 * Send an updated snapshot back to the main window.
 * Called from within the diagram window.
 */
export async function sendDiagramUpdate(snapshot: string): Promise<void> {
  const label = getCurrentWindow().label;
  const eventName = updateEventName(label);
  try {
    await emit(eventName, { snapshot } satisfies DiagramPayload);
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
