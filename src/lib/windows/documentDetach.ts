/**
 * documentDetach.ts — tear-off window support for document tabs.
 *
 * When the user drags a document tab out of the tab bar (or uses the
 * context-menu / shortcut), the document opens in a new OS window that
 * shows only the DocumentPanel for that document — no sidebar, no terminal.
 *
 * Because document data lives on disk, the child window simply loads the
 * document by ID from the file system. The only thing we need to pass
 * across windows is the `docId`.
 *
 * Flow:
 *   1. Stash `{ docId }` in Rust memory (same detach payload mechanism as
 *      terminal tear-off).
 *   2. Open a new WebviewWindow with `?window=document&label=...`.
 *   3. Child window retrieves the docId, loads the document, renders editor.
 *   4. Remove the document tab from the parent window's workspace.
 */

import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../../store/useStore';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface DocumentDetachPayload {
  docId: string;
}

/* ------------------------------------------------------------------ */
/* Sender side (parent window — tears off a document tab)              */
/* ------------------------------------------------------------------ */

let detachCounter = 0;

const NEW_WINDOW_WIDTH = 800;
const NEW_WINDOW_HEIGHT = 600;

/**
 * Tear off a document tab into a new OS window.
 *
 * @param docId   The document to open in the new window.
 * @param tabId   The workspace tab to remove from the parent.
 *                If omitted, finds the tab by docId.
 * @param pos     Optional screen coordinates (drag-release point).
 */
export async function createDocumentWindow(
  docId: string,
  tabId?: string,
  pos?: { x: number; y: number },
): Promise<void> {
  const store = useStore.getState();

  // Don't detach if this is the only tab.
  if (store.tabs.length <= 1) return;

  detachCounter += 1;
  const label = `document-${Date.now()}-${detachCounter}`;

  const payload: DocumentDetachPayload = { docId };

  // Stash payload in Rust memory for the child window.
  try {
    await invoke('set_terminal_detach_payload', { label, payload });
  } catch (e) {
    console.error('[DocumentDetach] Failed to store payload:', e);
    return;
  }

  // Resolve the document title for the window title bar.
  const meta = store.docList.find((d) => d.id === docId);
  const title = meta?.title || 'Document';

  const options: Record<string, unknown> = {
    url: `index.html?window=document&label=${encodeURIComponent(label)}`,
    title,
    width: NEW_WINDOW_WIDTH,
    height: NEW_WINDOW_HEIGHT,
    minWidth: 400,
    minHeight: 300,
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
    // Remove the tab from the parent window.
    const id =
      tabId ??
      store.tabs.find((t) => t.kind === 'document' && t.docId === docId)?.id;
    if (id) store.closeTab(id);
  });
  w.once('tauri://error', (e) => {
    console.error('[DocumentDetach] Window creation error:', e);
    invoke('clear_terminal_detach_payload', { label }).catch(() => {});
  });

  // Safety net (same as terminal detach).
  setTimeout(() => {
    if (!created) {
      const id =
        tabId ??
        useStore
          .getState()
          .tabs.find((t) => t.kind === 'document' && t.docId === docId)?.id;
      if (id) useStore.getState().closeTab(id);
    }
  }, 1500);
}

/* ------------------------------------------------------------------ */
/* Receiver side (child window — runs inside the torn-off OS window)   */
/* ------------------------------------------------------------------ */

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

let cachedFetch: Promise<DocumentDetachPayload | null> | null = null;

export function fetchDocumentDetachPayload(): Promise<DocumentDetachPayload | null> {
  if (cachedFetch) return cachedFetch;

  const doFetch = async (): Promise<DocumentDetachPayload | null> => {
    const label = resolveLabel();
    for (let i = 0; i < 20; i++) {
      try {
        const data = await invoke<DocumentDetachPayload | null>(
          'get_terminal_detach_payload',
          { label },
        );
        if (data) return data;
      } catch (e) {
        console.error('[DocumentDetach] Error fetching payload:', e);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    console.error('[DocumentDetach] Failed to retrieve payload after retries');
    return null;
  };

  cachedFetch = doFetch();
  return cachedFetch;
}
