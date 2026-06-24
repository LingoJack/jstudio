/**
 * terminalDetach.ts — kitty-style "tear-off window" for terminal tabs.
 *
 * 把一个终端 tab（一个 PaneGroup，含其下所有 pane）从当前 OS 窗口分离到一个
 * 独立的新 OS 窗口。三路入口（拖拽 / 右键菜单 / 快捷键）最终都调用
 * `createTerminalWindow()`。
 *
 * 工作原理：
 *   1. 序列化 group 内每个 session 的 xterm buffer（scrollback + 光标状态）。
 *   2. 通过 Rust 内存命令 `set_terminal_detach_payload` 暂存 payload。
 *   3. 用 `new WebviewWindow('terminal-*', { url: '...?window=terminal&label=...' })`
 *      打开新窗口，加载同一前端 bundle（见 main.tsx → TerminalWindowApp）。
 *   4. 从当前窗口 store 移除该 group（`detachGroup`），但 **不杀 PTY**。
 *
 * 为什么 PTY 不用迁移：Rust 端 PTY 注册表是进程全局的，`pty-data-{id}` 事件
 * 通过 `app.emit` 广播到所有窗口。子窗口监听同一事件即可继续收到输出，
 * 无需把 PTY「搬」过去。唯一无法直接转移的是 xterm 的 scrollback（在 JS 内存里），
 * 因此用 SerializeAddon 序列化后通过 Rust 邮箱传递、在子窗口重放。
 */

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../store/useStore';
import { serializeSession } from '../components/terminal/terminalRegistry';
import type { PaneLayoutType } from '../components/terminal/types';

/* ------------------------------------------------------------------ */
/* Types — shared shape between parent (sender) and child (receiver)   */
/* ------------------------------------------------------------------ */

/** One pane's transferable state. */
export interface DetachedPane {
  sessionId: string;
  title: string;
  customTitle: string | null;
  autoTitle: string | null;
  templateId: string | null;
  cwd: string;
  /** Serialized xterm buffer for replay in the child window. */
  scrollback: string;
}

/** The full payload for a torn-off terminal group. */
export interface TerminalDetachPayload {
  groupId: string;
  layout: PaneLayoutType;
  activeSessionId: string;
  panes: DetachedPane[];
}

/* ------------------------------------------------------------------ */
/* Sender side (parent window — tears off a tab)                       */
/* ------------------------------------------------------------------ */

let detachCounter = 0;

const NEW_WINDOW_WIDTH = 900;
const NEW_WINDOW_HEIGHT = 600;

/**
 * Tear off the group identified by `groupId` into a new OS window.
 *
 * @param groupId  The PaneGroup to detach.
 * @param pos      Optional screen coordinates (drag-release point) for the
 *                 new window's top-left. Falls back to `center` when omitted
 *                 (right-click / keyboard entry points).
 */
export async function createTerminalWindow(
  groupId: string,
  pos?: { x: number; y: number },
): Promise<void> {
  const store = useStore.getState();
  const group = store.groups.find((g) => g.id === groupId);
  if (!group) return;

  // Don't allow detaching the very last tab — the parent window would be
  // left with an empty terminal panel (which would then auto-spawn a new
  // session, defeating the purpose). Mirrors the "hide close on last tab"
  // rule in TerminalTabs.
  if (store.groups.length <= 1) return;

  // 1. Serialize each pane's scrollback BEFORE removing the group (removal
  //    disposes the xterm instances in this window).
  const panes: DetachedPane[] = group.sessionIds.map((sid) => {
    const session = store.sessions.find((s) => s.id === sid);
    return {
      sessionId: sid,
      title: session?.title ?? 'Terminal',
      customTitle: session?.customTitle ?? null,
      autoTitle: session?.autoTitle ?? null,
      templateId: session?.templateId ?? null,
      cwd: session?.cwd ?? '~',
      scrollback: serializeSession(sid),
    };
  });

  const payload: TerminalDetachPayload = {
    groupId: group.id,
    layout: group.layout,
    activeSessionId: group.activeSessionId,
    panes,
  };

  detachCounter += 1;
  const label = `terminal-${Date.now()}-${detachCounter}`;

  // 2. Stash payload in Rust memory for the child window to retrieve.
  try {
    await invoke('set_terminal_detach_payload', { label, payload });
  } catch (e) {
    console.error('[TerminalDetach] Failed to store payload:', e);
    return;
  }

  // 3. Create the new window. Position at the drag-release point when given.
  const options: Record<string, unknown> = {
    url: `index.html?window=terminal&label=${encodeURIComponent(label)}`,
    title: panes.find((p) => p.sessionId === group.activeSessionId)?.customTitle
      ?? '终端',
    width: NEW_WINDOW_WIDTH,
    height: NEW_WINDOW_HEIGHT,
    minWidth: 400,
    minHeight: 240,
    resizable: true,
    decorations: true,
    focus: true,
  };
  if (pos) {
    options.x = Math.round(pos.x);
    options.y = Math.round(pos.y);
  } else {
    options.center = true;
  }

  const w = new WebviewWindow(label, options);

  let created = false;
  w.once('tauri://created', () => {
    created = true;
    // 4. Remove the group from THIS window's store (PTYs survive).
    store.detachGroup(groupId);
  });
  w.once('tauri://error', (e) => {
    console.error('[TerminalDetach] Window creation error:', e);
    // Roll back the stashed payload so it doesn't leak.
    invoke('clear_terminal_detach_payload', { label }).catch(() => {});
  });

  // Safety net: if neither event fires within a short window (older Tauri
  // builds occasionally swallow `tauri://created`), assume success so the
  // parent tab still goes away and we don't leak the payload.
  setTimeout(() => {
    if (!created) {
      store.detachGroup(groupId);
    }
  }, 1500);
}

/* ------------------------------------------------------------------ */
/* Receiver side (child window — runs inside the torn-off OS window)   */
/* ------------------------------------------------------------------ */

/** Resolve this window's label — prefer URL param, fallback to Tauri API. */
function resolveLabel(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('label');
  if (fromUrl) return fromUrl;
  try {
    return getCurrentWindow().label;
  } catch {
    return '';
  }
}

/**
 * Retrieve the detach payload in the child window.
 *
 * Module-level promise cache deduplicates React StrictMode's double-invoke
 * (the Rust read is destructive, so a second concurrent fetch returns null).
 */
let cachedFetch: Promise<TerminalDetachPayload | null> | null = null;

export function fetchDetachPayload(): Promise<TerminalDetachPayload | null> {
  if (cachedFetch) return cachedFetch;

  const doFetch = async (): Promise<TerminalDetachPayload | null> => {
    const label = resolveLabel();
    for (let i = 0; i < 20; i++) {
      try {
        const data = await invoke<TerminalDetachPayload | null>(
          'get_terminal_detach_payload',
          { label },
        );
        if (data) return data;
      } catch (e) {
        console.error('[TerminalDetach] Error fetching payload:', e);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    console.error('[TerminalDetach] Failed to retrieve payload after retries');
    return null;
  };

  cachedFetch = doFetch();
  return cachedFetch;
}
