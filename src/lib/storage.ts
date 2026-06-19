import { invoke } from '@tauri-apps/api/core';
import type { Document } from '../types';

/**
 * Theme preference — `system` follows the OS color scheme.
 */
export type ThemeMode = 'dark' | 'light' | 'system';

/**
 * UI display language.
 */
export type Language = 'zh' | 'en';

/**
 * Lightweight document metadata — used for the sidebar list.
 * Excludes `blocks` so the sidebar can render instantly without
 * loading every document's full content.
 */
export interface DocumentMeta {
  id: string;
  title: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
}

/**
 * Terminal cursor shape — mirrors xterm's `cursorStyle` option.
 * The cursor trail follows the same shape so the two stay visually
 * consistent.
 */
export type TerminalCursorStyle = 'block' | 'underline' | 'bar';

export interface AppSettings {
  theme?: ThemeMode;
  /** UI display language — 'zh' (default) or 'en' */
  language?: Language;
  /** Whether to show a colored border on the active Activity Bar icon */
  activityBarBorder?: boolean;
  /** Latin font preset id — see LATIN_FONTS in lib/fonts.ts */
  fontId?: string;
  /** CJK (Chinese) font preset id — see CJK_FONTS in lib/fonts.ts */
  cjkFontId?: string;
  /** Editor base font size in pixels (12–22) */
  fontSize?: number;
  /** Editor line height / line spacing (1.4–2.2, default 1.7) */
  editorLineHeight?: number;
  /** Sidebar width in pixels (180–480) */
  sidebarWidth?: number;
  /**
   * Terminal color theme for dark mode — see lib/terminalThemes.ts.
   * Used when the app is in dark mode (or system mode while OS is dark).
   */
  terminalThemeIdDark?: string;
  /**
   * Terminal color theme for light mode — see lib/terminalThemes.ts.
   * Used when the app is in light mode (or system mode while OS is light).
   */
  terminalThemeIdLight?: string;
  /** @deprecated Migrated to terminalThemeIdDark. Kept for one-time migration. */
  terminalThemeId?: string;
  /** Terminal font size in pixels (independent from editor font size) */
  terminalFontSize?: number;
  /** Terminal monospace font id — see MONOSPACE_FONTS in lib/fonts.ts */
  terminalFontId?: string;
  /** Terminal cursor shape — also drives the cursor trail shape */
  terminalCursorStyle?: TerminalCursorStyle;
  [key: string]: unknown;
}

export interface AssetInfo {
  fileName: string;
  name: string;
  type: string;
  size: string;
  sizeBytes?: number;
  createdAt: number;
}

/**
 * Lightweight terminal session info returned by the Rust PTY backend.
 */
export interface TerminalSessionInfo {
  id: string;
  title: string;
}

/**
 * Convert a full Document to its lightweight metadata form.
 */
export function toMeta(doc: Document): DocumentMeta {
  return {
    id: doc.id,
    title: doc.title,
    emoji: doc.emoji,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    isFavorite: doc.isFavorite,
  };
}

/**
 * Storage abstraction layer.
 *
 * Every method maps 1-to-1 to a `#[tauri::command]` on the Rust side.
 * Components should **never** call `invoke` directly — always go
 * through this module so the API surface is centralized and typed.
 */
export const storage = {
  // ---- lifecycle ----

  /** Create the `~/.jdata/studio/{documents,assets}` directory tree. */
  init: () => invoke<string>('ensure_studio_dir'),

  // ---- index (sidebar metadata) ----

  loadIndex: () => invoke<DocumentMeta[]>('read_index'),
  saveIndex: (entries: DocumentMeta[]) =>
    invoke<void>('write_index', { entries }),

  // ---- documents ----

  loadDocument: (docId: string) =>
    invoke<Document>('read_document', { docId }),
  saveDocument: (doc: Document) =>
    invoke<void>('write_document', { docId: doc.id, doc }),
  deleteDocument: (docId: string) =>
    invoke<void>('delete_document', { docId }),

  // ---- document-scoped assets (per-doc folder) ----

  saveDocAsset: (docId: string, fileName: string, data: number[]) =>
    invoke<string>('save_doc_asset', { docId, fileName, data }),
  readDocAssetBase64: (docId: string, fileName: string) =>
    invoke<string>('read_doc_asset_base64', { docId, fileName }),
  deleteDocAsset: (docId: string, fileName: string) =>
    invoke<void>('delete_doc_asset', { docId, fileName }),
  listDocAssets: (docId: string) =>
    invoke<AssetInfo[]>('list_doc_assets', { docId }),

  // ---- maintenance ----

  /** One-time cleanup: remove the legacy global assets directory. */
  cleanGlobalAssets: () => invoke<void>('clean_global_assets'),

  /** Read raw bytes from an arbitrary file path (e.g. from file dialog). */
  readFileBytes: (path: string) =>
    invoke<number[]>('read_file_bytes', { path }),

  /** Open the studio data directory in the system file manager. */
  openDataDir: () => invoke<void>('open_studio_dir'),

  /** Open a specific document's folder in the system file manager. */
  openDocDir: (docId: string) => invoke<void>('open_doc_dir', { docId }),

  /** Return the full filesystem path of a document's `document.json`. */
  getDocPath: (docId: string) => invoke<string>('get_doc_path', { docId }),

  // ---- settings ----

  loadSettings: () => invoke<AppSettings>('read_settings'),
  saveSettings: (settings: AppSettings) =>
    invoke<void>('write_settings', { settings }),

  // ---- terminal (PTY) ----

  /** Spawn a new PTY shell session. Returns session id + default title. */
  ptyCreate: (opts: { cwd?: string; cols: number; rows: number }) =>
    invoke<TerminalSessionInfo>('pty_create', { params: opts }),

  /** Write user input to the PTY (keyboard → shell). */
  ptyWrite: (sessionId: string, data: string) =>
    invoke<void>('pty_write', { sessionId, data }),

  /** Resize the PTY to match the terminal panel dimensions. */
  ptyResize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>('pty_resize', { sessionId, cols, rows }),

  /** Kill a session and remove it from the registry. */
  ptyKill: (sessionId: string) =>
    invoke<void>('pty_kill', { sessionId }),

  /** Return all active sessions (id + title). */
  ptyList: () => invoke<TerminalSessionInfo[]>('pty_list'),

  /** Rename a session. */
  ptySetTitle: (sessionId: string, title: string) =>
    invoke<void>('pty_set_title', { sessionId, title }),
};
