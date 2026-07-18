import type { Document, Block, BlockType, RichText } from '../types';
import type { DocumentMeta, FolderMeta, ThemeMode, Language, TerminalCursorStyle, EditorCursorStyle, ActivityBarItemConfig, TrashedAsset } from '../lib/core/storage';
import type { ShortcutOverrides } from '../lib/shortcuts/keyboardShortcuts';
import type { GlobalShortcutConfig } from '../lib/shortcuts/globalShortcuts';
import type {
  TerminalSession,
  TerminalTemplate,
  PaneGroup,
  PaneLayoutType,
  PaneResizeState,
} from './terminalSlice';
import type { ToastItem, ToastType } from './toastSlice';
import type { SettingsSectionId } from './uiSlice';
import type { UnifiedTab } from './workspaceSlice';
import type { AgentSession } from '../types/agent';
import { storage } from '../lib/core/storage';
import { toast } from '../lib/toast';

/**
 * Unified error handler for fire-and-forget storage saves.
 * Logs to console AND shows a user-facing toast.
 */
export function onSaveError(label: string) {
  return (e: unknown) => {
    console.error(`Failed to save ${label}:`, e);
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
    storage.saveDocument(doc).catch(onSaveError('文档'));
  }, 500);
  docSaveTimers.set(doc.id, timer);
}

/**
 * Synchronously flush every pending document save right now (fire-and-forget
 * IPC). Call this before a risky transition where the debounce might never
 * fire — e.g. app close / window hide. Each save is keyed by id so no pending
 * edit is lost.
 */
export function flushDocumentSaves() {
  for (const [id, timer] of docSaveTimers) {
    clearTimeout(timer);
    const doc = pendingDocs.get(id);
    if (doc) storage.saveDocument(doc).catch(onSaveError('文档'));
  }
  docSaveTimers.clear();
  pendingDocs.clear();
}

export function scheduleIndexSave(metas: DocumentMeta[]) {
  if (indexTimer) clearTimeout(indexTimer);
  indexTimer = setTimeout(() => {
    storage.saveIndex(metas).catch(onSaveError('索引'));
  }, 500);
}

export function scheduleFoldersSave(folders: FolderMeta[]) {
  if (foldersTimer) clearTimeout(foldersTimer);
  foldersTimer = setTimeout(() => {
    storage.saveFolders(folders).catch(onSaveError('文件夹'));
  }, 300);
}

/**
 * The full store state — composed from individual slice interfaces.
 * Each slice creator adds its own piece to this interface.
 */
export interface StoreState {
  // — data (documents slice) —
  docList: DocumentMeta[];
  trashedDocList: DocumentMeta[];
  /** Document-private assets currently in the recycle bin (all documents). */
  trashedAssets: TrashedAsset[];
  activeDoc: Document | null;
  activeDocId: string;
  /** Incremented to force editors to reload the active doc's content (e.g.
   *  after restoring a backup). Editors watch this nonce and re-setContent. */
  activeDocReloadNonce: number;
  documents: Document[];
  /** Absolute path of the studio root dir (~/.jdata/studio), cached at init. */
  studioRoot: string;

  // — data (folders slice) —
  folders: FolderMeta[];
  trashedFolders: FolderMeta[];

  // — ui state (ui slice) —
  themeMode: ThemeMode;
  isDarkMode: boolean;
  appThemeIdDark: string;
  appThemeIdLight: string;
  language: Language;
  
  activityBarItems: ActivityBarItemConfig[];
  isSidebarOpen: boolean;
  isOutlineOpen: boolean;
  isSettingsOpen: boolean;
  isCommandPaletteOpen: boolean;
  isLoading: boolean;
  searchQuery: string;
  fontId: string;
  cjkFontId: string;
  fontSize: number;
  editorLineHeight: number;
  editorCursorStyle: EditorCursorStyle;
  sidebarWidth: number;
  activeSidebarView: 'documents' | 'terminal' | 'agent';
  settingsActiveSection: SettingsSectionId;
  terminalFontSize: number;
  terminalFontId: string;
  terminalCursorStyle: TerminalCursorStyle;
  tabBarGlassOpacity: number;
  tabBarPosition: 'top' | 'bottom';
  keyboardShortcuts: ShortcutOverrides;
  globalShortcuts: GlobalShortcutConfig[];

  // — terminal state (terminal slice) —
  templates: TerminalTemplate[];
  sessions: TerminalSession[];
  groups: PaneGroup[];
  activeGroupId: string | null;
  activeSessionId: string | null;
  recentDirs: string[];

  // — agent state (agent slice) —
  agentSessions: AgentSession[];
  activeAgentSessionId: string | null;
  agentUnsubscribes: (() => void)[];

  // — toast state (toast slice) —
  toasts: ToastItem[];

  // — workspace state (workspace slice) —
  tabs: UnifiedTab[];
  activeTabId: string | null;

  // — init (documents slice) —
  init: () => Promise<void>;

  // — document ops (documents slice) —
  createDocument: (folderId?: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  deleteDocuments: (ids: string[]) => Promise<void>;
  trashDocument: (id: string) => Promise<void>;
  trashDocuments: (ids: string[]) => Promise<void>;
  restoreDocument: (id: string) => Promise<void>;
  restoreDocuments: (ids: string[]) => Promise<void>;
  emptyTrash: () => Promise<void>;
  /** Reload the asset recycle-bin list from the backend. */
  loadTrashedAssets: () => Promise<void>;
  /** Move a document's unreferenced assets into the recycle bin (undo-safe). */
  gcDocAssets: (doc: Document) => Promise<void>;
  /** Restore a trashed asset back into its document's assets folder. */
  restoreTrashedAsset: (id: number) => Promise<void>;
  /** Permanently delete a single trashed asset. */
  deleteTrashedAsset: (id: number) => Promise<void>;
  /** Permanently delete every trashed asset (used by "empty trash"). */
  emptyTrashAssets: () => Promise<void>;
  renameDocument: (id: string, title: string) => void;
  openDocument: (id: string) => Promise<void>;
  /** Reload a document's content from disk and bump `activeDocReloadNonce`
   *  so editors re-setContent. Used after restoring a backup. */
  reloadDoc: (docId: string) => Promise<void>;
  updateDocumentMeta: (fields: Partial<Document>) => void;
  importDocumentFromMarkdown: (filename: string, md: string, folderId?: string) => Promise<void>;
  importMarkdownDirectory: (dirPath: string, targetFolderId?: string) => Promise<number>;
  /** Export a document to a lossless `.jnote` ZIP backup. Returns false if cancelled. */
  exportDocumentBundle: (docId: string) => Promise<boolean>;
  /** Import a `.jnote` backup as a new document. Returns new doc id, or null if cancelled. */
  importDocumentBundle: (folderId?: string) => Promise<string | null>;

  // — folder ops (folders slice) —
  initFolders: (raw: FolderMeta[]) => void;
  createFolder: (name: string, parentId: string | null) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  deleteFolders: (ids: string[]) => void;
  trashFolder: (id: string) => void;
  restoreFolder: (id: string) => void;
  emptyTrashFolders: () => void;
  toggleFolderCollapsed: (id: string) => void;
  moveDocumentToFolder: (docId: string, folderId: string | null) => void;
  moveDocumentsToFolder: (docIds: string[], folderId: string | null) => void;

  // — block ops (editor slice) —
  updateBlock: (blockId: string, fields: Partial<Block>) => void;
  deleteBlock: (blockId: string, mergeContent?: RichText[]) => void;
  insertBlockBelow: (blockId: string, type: BlockType) => void;
  appendBlockAtEnd: (type: BlockType) => void;
  duplicateBlock: (blockId: string) => void;

  // — batch ops (editor slice) —
  // Replaces all blocks of the active document in one shot. Used by the
  // TipTap editor to sync content changes without per-block dispatch.
  // `docId` (optional) guards against applying edits to the wrong document
  // when the active doc changed during the debounce window.
  setActiveDocBlocks: (blocks: Block[], docId?: string) => void;
  /**
   * Persist `blocks` to a specific document by id, even if it is no longer the
   * active document. Used to flush the outgoing document's pending edits when
   * switching documents.
   */
  flushBlocksToDoc: (docId: string, blocks: Block[]) => void;

  // — asset ops (editor slice) —
  saveImageToDoc: (blob: Blob, afterBlockId?: string) => Promise<string | null>;

  // — ui toggles (ui slice) —
  setThemeMode: (mode: ThemeMode) => void;
  toggleDarkMode: () => void;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  setOutlineOpen: (open: boolean) => void;
  toggleSettings: () => void;
  setSettingsOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSearchQuery: (q: string) => void;
  setFontId: (id: string) => void;
  setCjkFontId: (id: string) => void;
  setFontSize: (size: number) => void;
  setEditorLineHeight: (lh: number) => void;
  setEditorCursorStyle: (style: EditorCursorStyle) => void;
  setSidebarWidth: (width: number) => void;
  setLanguage: (lang: Language) => void;
  setActivityBarBorder: (enabled: boolean) => void;
  setActivityBarItems: (items: ActivityBarItemConfig[]) => void;
  setActiveSidebarView: (view: 'documents' | 'terminal' | 'agent') => void;
  setSettingsActiveSection: (section: SettingsSectionId) => void;
  setAppThemeIdDark: (id: string) => void;
  setAppThemeIdLight: (id: string) => void;
  setTerminalFontSize: (size: number) => void;
  setTerminalFontId: (id: string) => void;
  setTerminalCursorStyle: (style: TerminalCursorStyle) => void;
  setTabBarGlassOpacity: (opacity: number) => void;
  setTabBarPosition: (position: 'top' | 'bottom') => void;
  setKeyboardShortcut: (id: string, binding: string) => void;
  resetKeyboardShortcut: (id: string) => void;
  resetAllKeyboardShortcuts: () => void;
  setGlobalShortcuts: (configs: GlobalShortcutConfig[]) => void;

  // — terminal ops (terminal slice) —
  initTemplates: (raw: unknown) => void;
  initRecentDirs: (raw: unknown) => void;
  addRecentDir: (cwd: string) => void;
  clearRecentDirs: () => void;
  addTemplate: (name: string, cwd: string) => void;
  removeTemplate: (id: string) => void;
  updateTemplate: (id: string, fields: { name?: string; cwd?: string }) => void;
  createSession: (templateId?: string, opts?: { cwd?: string }) => Promise<void>;
  closeSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => void;
  setAutoTitle: (sessionId: string, title: string) => void;
  updateSessionCwd: (sessionId: string, cwd: string) => void;
  setActiveSession: (id: string) => void;
  removeSessionState: (id: string) => void;
  removeGroupState: (groupId: string) => void;
  /**
   * Detach a group from this window's store WITHOUT killing its PTYs.
   * Used by the tear-off flow: the torn-off window attaches to the same
   * PTY sessions, so they must survive removal from the parent store.
   */
  detachGroup: (groupId: string) => void;
  // — pane ops (Kitty-style splits) —
  splitPane: (templateId?: string) => Promise<void>;
  cyclePaneLayout: () => void;
  setPaneLayout: (layout: PaneLayoutType) => void;
  setPaneResizeState: (groupId: string, resizeState: PaneResizeState) => void;
  moveActivePane: () => void;
  focusNextPane: () => void;
  focusPrevPane: () => void;
  setActivePane: (sessionId: string) => void;
  closePane: (sessionId: string) => Promise<void>;

  // — toast ops (toast slice) —
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;

  // — agent ops (agent slice) —
  initAgentSessions: () => Promise<void>;
  createAgentSession: (workspace: string) => Promise<string>;
  openAgentSession: (sessionId: string) => Promise<void>;
  deleteAgentSession: (sessionId: string) => Promise<void>;
  sendAgentMessage: (
    sessionId: string,
    text: string,
    images?: { base64: string; mediaType: string }[],
  ) => Promise<void>;
  submitAgentToolResult: (
    sessionId: string,
    toolCallId: string,
    result: string,
    isError: boolean,
    images?: { base64: string; mediaType: string }[],
    planDecision?: 'approve' | 'reject' | 'approveAndClearContext',
  ) => Promise<void>;
  submitAgentPlanDecision: (
    sessionId: string,
    decision: 'approve' | 'reject' | 'approveAndClearContext',
  ) => Promise<void>;
  submitAgentAskAnswer: (
    sessionId: string,
    answer: Record<string, string>,
  ) => Promise<void>;
  setAgentAutoApprove: (sessionId: string, enabled: boolean) => Promise<void>;
  cancelAgent: (sessionId: string) => Promise<void>;
  cleanupAgentListeners: () => void;

  // — workspace ops (workspace slice) —
  openDocumentTab: (docId: string) => void;
  openTerminalTab: (groupId: string) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (keepTabId: string) => void;
  setActiveTab: (tabId: string) => void;
  cycleTab: (direction: 1 | -1) => void;
  /** Called by terminalSlice: remove a terminal tab without killing PTYs. */
  removeTerminalTabByGroupId: (groupId: string) => void;
  /** Called by documentsSlice: remove a document tab without deleting the doc. */
  removeDocumentTabByDocId: (docId: string) => void;
}

/**
 * Zustand's `create` calls each slice creator with `(set, get, store)`.
 * Each slice returns its own piece of state; the pieces are then spread
 * together to form the complete store.
 */
export type SetState = (
  partial: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>),
) => void;
export type GetState = () => StoreState;

export type SliceCreator = (set: SetState, get: GetState) => Partial<StoreState>;
