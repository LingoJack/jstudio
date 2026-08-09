/**
 * Store helpers - utility functions + composed StoreState type.
 *
 * StoreState is now an intersection of per-slice interfaces, each defined
 * in its own slice file. This keeps storeHelpers.ts focused on shared
 * utilities (debounced save, error handler) rather than being a central
 * type registry that every slice must modify.
 */

import type { Document } from "../types";
import type { DocumentMeta, FolderMeta } from "../types/storage";
import { ipc } from "../lib/core/ipc";
import { toast } from "../lib/core/toast";
import { logger } from "../lib/core/logger";

// ── slice interfaces (type-only imports, no runtime cycle) ──────────
import type { DocumentsSlice } from "./documentsSlice";
import type { TrashSlice } from "./trashSlice";
import type { ImportExportSlice } from "./importExportSlice";
import type { InitSlice } from "./initSlice";
import type { UISlice } from "./uiSlice";
import type { TerminalSlice } from "./terminalSlice";
import type { ToastSlice } from "./toastSlice";
import type { FoldersSlice } from "./foldersSlice";
import type { WorkspaceSlice } from "./workspaceSlice";
import type { AgentSlice } from "./agentSlice";
import type { BrowserSlice } from "./browserSlice";
import type { EditorSlice } from "./editorSlice";

/**
 * The full store state - composed from individual slice interfaces.
 * Each slice file exports its own interface; this intersection ties them
 * together without any single file owning the full type list.
 */
export type StoreState = DocumentsSlice &
  TrashSlice &
  ImportExportSlice &
  InitSlice &
  UISlice &
  TerminalSlice &
  ToastSlice &
  FoldersSlice &
  WorkspaceSlice &
  AgentSlice &
  BrowserSlice &
  EditorSlice;

/**
 * Zustand's `create` calls each slice creator with `(set, get, store)`.
 * Each slice returns its own piece of state; the pieces are then spread
 * together to form the complete store.
 */
export type SetState = (
  partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>),
) => void;
export type GetState = () => StoreState;

export type SliceCreator = (
  set: SetState,
  get: GetState,
) => Partial<StoreState>;

// ── shared utility functions ────────────────────────────────────────

/**
 * Unified error handler for fire-and-forget ipc saves.
 * Logs to console, the runtime log file, AND shows a user-facing toast.
 */
export function onSaveError(label: string) {
  return (e: unknown) => {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(`Failed to save ${label}:`, e);
    logger.error("store.save", `Failed to save ${label}: ${msg}`);
    toast.error(`${label}保存失败`);
  };
}

/**
 * Shared debounce helpers for persisting documents and the document index.
 * Used across multiple store slices.
 */

/**
 * Per-document save timers, keyed by document id.
 *
 * A single shared timer is wrong: scheduling a save for document B would
 * `clearTimeout` document A's still-pending save, dropping A's edits when the
 * user switches documents within the debounce window. Keying by id makes each
 * document's pending save independent.
 */
const docSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** The latest document snapshot pending a flush, keyed by id. */
const pendingDocs = new Map<string, Document>();
let indexTimer: ReturnType<typeof setTimeout> | null = null;
let foldersTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleDocumentSave(doc: Document) {
  const existing = docSaveTimers.get(doc.id);
  if (existing) clearTimeout(existing);
  pendingDocs.set(doc.id, doc);
  const timer = setTimeout(() => {
    docSaveTimers.delete(doc.id);
    pendingDocs.delete(doc.id);
    ipc.saveDocument(doc).catch(onSaveError("文档"));
  }, 500);
  docSaveTimers.set(doc.id, timer);
}

/**
 * Synchronously flush every pending document save right now (fire-and-forget
 * IPC). Call this before a risky transition where the debounce might never
 * fire - e.g. app close / window hide. Each save is keyed by id so no pending
 * edit is lost.
 */
export function flushDocumentSaves() {
  for (const [id, timer] of docSaveTimers) {
    clearTimeout(timer);
    const doc = pendingDocs.get(id);
    if (doc) ipc.saveDocument(doc).catch(onSaveError("文档"));
  }
  docSaveTimers.clear();
  pendingDocs.clear();
}

export function scheduleIndexSave(metas: DocumentMeta[]) {
  if (indexTimer) clearTimeout(indexTimer);
  indexTimer = setTimeout(() => {
    ipc.saveIndex(metas).catch(onSaveError("索引"));
  }, 500);
}

export function scheduleFoldersSave(folders: FolderMeta[]) {
  if (foldersTimer) clearTimeout(foldersTimer);
  foldersTimer = setTimeout(() => {
    ipc.saveFolders(folders).catch(onSaveError("文件夹"));
  }, 300);
}
