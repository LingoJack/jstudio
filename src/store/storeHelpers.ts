import type { Document, Block, BlockType, RichText } from '../types';
import type { DocumentMeta, FolderMeta, ThemeMode, Language, TerminalCursorStyle, EditorCursorStyle, ActivityBarItemConfig } from '../lib/storage';
import type { ShortcutOverrides } from '../lib/shortcuts';
import type {
  TerminalSession,
  TerminalTemplate,
  PaneGroup,
  PaneLayoutType,
  PaneResizeState,
} from './terminalSlice';
import type { ToastItem, ToastType } from './toastSlice';
import type { SettingsSectionId } from './uiSlice';
import { storage } from '../lib/storage';

/**
 * Shared debounce helpers for persisting documents and the document index.
 * Used across multiple store slices.
 */

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let indexTimer: ReturnType<typeof setTimeout> | null = null;
let foldersTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleDocumentSave(doc: Document) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    storage.saveDocument(doc).catch(console.error);
  }, 500);
}

export function scheduleIndexSave(metas: DocumentMeta[]) {
  if (indexTimer) clearTimeout(indexTimer);
  indexTimer = setTimeout(() => {
    storage.saveIndex(metas).catch(console.error);
  }, 500);
}

export function scheduleFoldersSave(folders: FolderMeta[]) {
  if (foldersTimer) clearTimeout(foldersTimer);
  foldersTimer = setTimeout(() => {
    storage.saveFolders(folders).catch(console.error);
  }, 300);
}

/**
 * The full store state — composed from individual slice interfaces.
 * Each slice creator adds its own piece to this interface.
 */
export interface StoreState {
  // — data (documents slice) —
  docList: DocumentMeta[];
  activeDoc: Document | null;
  activeDocId: string;
  documents: Document[];
  /** Absolute path of the studio root dir (~/.jdata/studio), cached at init. */
  studioRoot: string;

  // — data (folders slice) —
  folders: FolderMeta[];

  // — ui state (ui slice) —
  themeMode: ThemeMode;
  isDarkMode: boolean;
  language: Language;
  activityBarBorder: boolean;
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
  activeSidebarView: 'documents' | 'terminal';
  settingsActiveSection: SettingsSectionId;
  terminalThemeIdDark: string;
  terminalThemeIdLight: string;
  terminalFontSize: number;
  terminalFontId: string;
  terminalCursorStyle: TerminalCursorStyle;
  keyboardShortcuts: ShortcutOverrides;

  // — terminal state (terminal slice) —
  templates: TerminalTemplate[];
  sessions: TerminalSession[];
  groups: PaneGroup[];
  activeGroupId: string | null;
  activeSessionId: string | null;
  recentDirs: string[];

  // — toast state (toast slice) —
  toasts: ToastItem[];

  // — init (documents slice) —
  init: () => Promise<void>;

  // — document ops (documents slice) —
  createDocument: () => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  renameDocument: (id: string, title: string) => void;
  openDocument: (id: string) => Promise<void>;
  updateDocumentMeta: (fields: Partial<Document>) => void;
  importDocumentFromMarkdown: (filename: string, md: string, folderId?: string) => Promise<void>;
  importMarkdownDirectory: (dirPath: string) => Promise<number>;

  // — folder ops (folders slice) —
  initFolders: (raw: FolderMeta[]) => void;
  createFolder: (name: string, parentId: string | null) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  toggleFolderCollapsed: (id: string) => void;
  moveDocumentToFolder: (docId: string, folderId: string | null) => void;

  // — block ops (editor slice) —
  updateBlock: (blockId: string, fields: Partial<Block>) => void;
  deleteBlock: (blockId: string, mergeContent?: RichText[]) => void;
  insertBlockBelow: (blockId: string, type: BlockType) => void;
  appendBlockAtEnd: (type: BlockType) => void;
  duplicateBlock: (blockId: string) => void;

  // — batch ops (editor slice) —
  // Replaces all blocks of the active document in one shot. Used by the
  // TipTap editor to sync content changes without per-block dispatch.
  setActiveDocBlocks: (blocks: Block[]) => void;

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
  setActiveSidebarView: (view: 'documents' | 'terminal') => void;
  setSettingsActiveSection: (section: SettingsSectionId) => void;
  setTerminalThemeIdDark: (id: string) => void;
  setTerminalThemeIdLight: (id: string) => void;
  setTerminalFontSize: (size: number) => void;
  setTerminalFontId: (id: string) => void;
  setTerminalCursorStyle: (style: TerminalCursorStyle) => void;
  setKeyboardShortcut: (id: string, binding: string) => void;
  resetKeyboardShortcut: (id: string) => void;
  resetAllKeyboardShortcuts: () => void;

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
