import { invoke } from "@tauri-apps/api/core";
import type { Document } from "../../types";
import type {
  ChatMessage,
  ImageData,
  AgentSessionMeta,
} from "../../types/agent";
import type { GlobalShortcutConfig } from "../shortcuts/globalShortcuts";

/**
 * Theme preference — `system` follows the OS color scheme.
 */
export type ThemeMode = "dark" | "light" | "system";

/**
 * UI display language.
 */
export type Language = "zh" | "en";

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
  /** Folder this document belongs to; `null`/`undefined` = root level */
  folderId?: string | null;
  /** ISO timestamp when moved to trash; `null`/`undefined` = active document */
  trashedAt?: string | null;
}

/**
 * Folder metadata for the document sidebar tree.
 * Folders can nest arbitrarily deep via `parentId`.
 */
export interface FolderMeta {
  /** `"folder-{timestamp}"` */
  id: string;
  name: string;
  /** Parent folder id; `null` = top-level */
  parentId: string | null;
  /** Sort order among siblings (ascending) */
  sortOrder: number;
  /** Whether the folder is collapsed in the sidebar UI */
  collapsed: boolean;
  /** ISO timestamp when moved to trash; `null`/`undefined` = active folder */
  trashedAt?: string | null;
}

/**
 * Terminal cursor shape — mirrors xterm's `cursorStyle` option.
 * The cursor trail follows the same shape so the two stay visually
 * consistent.
 */
export type TerminalCursorStyle = "block" | "underline" | "bar";

/**
 * Editor (contentEditable / ProseMirror) cursor shape.
 * Controls the CSS `caret-shape`-like appearance and the trail geometry.
 * - 'bar'       — thin vertical line (default, classic text-editor caret)
 * - 'block'     — filled rectangle covering the full character cell
 * - 'underline' — horizontal bar at the bottom of the character cell
 */
export type EditorCursorStyle = "bar" | "block" | "underline";

/**
 * Identifiers for items that can appear in the left Activity Bar.
 * The array order in `ActivityBarItemConfig[]` determines display order.
 */
export type ActivityItemId =
  | "documents"
  | "terminal"
  | "agent"
  | "browser"
  | "settings";

/**
 * Configuration for a single Activity Bar entry — visibility + position
 * (position is implied by the array index in `activityBarItems`).
 */
export interface ActivityBarItemConfig {
  id: ActivityItemId;
  visible: boolean;
}

/** Default order & visibility for the Activity Bar. */
export const DEFAULT_ACTIVITY_BAR_ITEMS: ActivityBarItemConfig[] = [
  { id: "documents", visible: true },
  { id: "terminal", visible: true },
  { id: "agent", visible: true },
  { id: "browser", visible: true },
  { id: "settings", visible: true },
];

export interface AppSettings {
  theme?: ThemeMode;
  /** UI display language — 'zh' (default) or 'en' */
  language?: Language;

  /**
   * Activity Bar item visibility and ordering.
   * Each entry controls one icon; array order determines display order.
   */
  activityBarItems?: ActivityBarItemConfig[];
  /** Latin font preset id — see LATIN_FONTS in lib/fonts.ts */
  fontId?: string;
  /** CJK (Chinese) font preset id — see CJK_FONTS in lib/fonts.ts */
  cjkFontId?: string;
  /** Editor base font size in pixels (12–22) */
  fontSize?: number;
  /** Editor line height / line spacing (1.4–2.2, default 1.7) */
  editorLineHeight?: number;
  /** Editor cursor shape — also drives the editor cursor trail shape */
  editorCursorStyle?: EditorCursorStyle;
  /**
   * Whether the editor uses the animated WebGL cursor trail (default true).
   * When `false`, the native browser caret is used instead — no trail /
   * breathing blink, but also immune to trail-specific caret-placement bugs
   * (e.g. inside code blocks with long, horizontally-scrolled lines).
   */
  editorCursorAnimationEnabled?: boolean;
  /** Sidebar width in pixels (180–480) */
  sidebarWidth?: number;
  /**
   * App UI color theme for dark mode — see lib/themes/registry.ts.
   * Terminal theme automatically uses the same ID (app theme = terminal theme).
   */
  appThemeIdDark?: string;
  /**
   * App UI color theme for light mode — see lib/themes/registry.ts.
   * Terminal theme automatically uses the same ID (app theme = terminal theme).
   */
  appThemeIdLight?: string;
  /** Terminal font size in pixels (independent from editor font size) */
  terminalFontSize?: number;
  /** Terminal monospace font id — see MONOSPACE_FONTS in lib/fonts.ts */
  terminalFontId?: string;
  /** Terminal cursor shape — also drives the cursor trail shape */
  terminalCursorStyle?: TerminalCursorStyle;
  /** Tab bar position — 'top' or 'bottom' (default: 'bottom') */
  tabBarPosition?: "top" | "bottom";
  /** User-customized keyboard shortcut overrides — see lib/shortcuts.ts */
  keyboardShortcuts?: Record<string, string>;
  /** OS-level global shortcut configs — see lib/shortcuts/globalShortcuts.ts */
  globalShortcuts?: GlobalShortcutConfig[];
  /**
   * Tab bar glassmorphism background opacity (0.02–0.15).
   * Controls the transparency of the floating pill-shaped tab bar container.
   * Higher = more visible/solid; lower = more transparent/glass-like.
   */
  tabBarGlassOpacity?: number;
  /**
   * Whether JStudio has attempted to auto-install the CLI (`j` command).
   * Used to prevent repeated installation prompts on every startup.
   * Set to `true` after the first attempt (successful or failed).
   */
  jcliAutoInstallAttempted?: boolean;
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
 * A document-private asset that has been moved to the recycle bin.
 * Mirrors the row shape returned by `list_trashed_assets`.
 */
export interface TrashedAsset {
  /** Auto-increment primary key — used to restore / delete the entry. */
  id: number;
  /** The document this asset belonged to. */
  docId: string;
  /** File name inside the document's `.trash/` folder. */
  trashName: string;
  /** Name to restore the file back into `assets/` as. */
  originalName: string;
  /** Guessed MIME type. */
  type: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** ISO timestamp when the asset was trashed. */
  trashedAt: string;
}

/**
 * Metadata for a document body backup snapshot (no body — keeps the list
 * payload small). Mirrors the Rust `BackupMeta` struct.
 */
export interface DocBackup {
  /** File name without extension, e.g. "1720472340000". Used as the id. */
  id: string;
  /** Epoch milliseconds when the backup was taken. */
  timestampMs: number;
  /** Block count of the snapshot. */
  blockCount: number;
  /** File size in bytes. */
  size: number;
}

// ────────────────────────────────────────────────
// Agent config (jcli agent model providers)
// ────────────────────────────────────────────────

/**
 * Tool-call protocol mode — mirrors the Rust `ToolCallMode` enum
 * (`snake_case` serialisation).
 * - `native`   → OpenAI-style function calling (default)
 * - `disabled` → tool calls turned off entirely
 */
export type ToolCallMode = "native" | "disabled";

/**
 * A single model provider entry — mirrors the Rust `ModelProvider` struct.
 * Any OpenAI-compatible endpoint can be added here.
 */
export interface ModelProvider {
  /** Display name (user-defined, e.g. "deepseek", "openrouter") */
  name: string;
  /** OpenAI-compatible API base URL (e.g. "https://api.openai.com/v1") */
  api_base: string;
  /** API key (stored in plaintext, same as jcli agent) */
  api_key: string;
  /** Model identifier sent to the API (e.g. "gpt-4o") */
  model: string;
  /** Whether the model supports vision / multimodal input */
  supports_vision: boolean;
  /** Tool-call protocol mode */
  tool_call_mode: ToolCallMode;
}

/**
 * The on-disk agent config file (`~/.jdata/agent/data/agent_config.json`).
 *
 * JStudio only manages `providers` + `active_index`; all other fields
 * (system_prompt, compact, theme, …) are carried through untouched via
 * the index signature so they are never lost on write-back.
 */
export interface AgentConfigFile {
  providers: ModelProvider[];
  active_index: number;
  [key: string]: unknown;
}

/**
 * Lightweight terminal session info returned by the Rust PTY backend.
 */
export interface TerminalSessionInfo {
  id: string;
  title: string;
}

/**
 * jcli installation status — mirrors the Rust `JcliStatus` struct.
 */
export interface JcliStatus {
  /** Whether `j` is available on the system PATH. */
  installed: boolean;
  /** Version string reported by `j --version`. */
  version: string | null;
  /** Absolute path to the resolved binary, if found. */
  path: string | null;
  /** Whether the bundled version embedded in JStudio is available. */
  bundled: boolean;
  /** Version of the bundled binary, if extractable. */
  bundledVersion: string | null;
}

/**
 * Link preview metadata — mirrors the Rust `LinkMetadata` struct.
 * Returned by `fetch_link_metadata`.
 */
export interface LinkMetadata {
  title: string;
  description: string;
  faviconUrl: string;
  ogImage: string;
  siteName: string;
  /** Final URL after HTTP redirects. */
  url: string;
}

/**
 * Link preview tab info — mirrors the Rust `TabInfo` struct in link_tabs.rs.
 * One per open tab in the link-preview window.
 */
export interface LinkPreviewTabInfo {
  id: string;
  url: string;
  title: string;
  loading: boolean;
}

/**
 * Full link-preview tabs state — mirrors the Rust `TabsState` struct.
 * Pushed to the frontend via the `link-preview:tabs-updated` event and
 * returned by `getLinkPreviewTabsState`.
 */
export interface LinkPreviewTabsState {
  tabs: LinkPreviewTabInfo[];
  activeTabId: string | null;
}

/**
 * A single entry returned by `list_markdown_files` — mirrors the Rust
 * `MarkdownEntry` struct. Directories (`is_dir: true`) are included so the
 * frontend can recreate the folder hierarchy.
 */
export interface MarkdownEntry {
  /** Absolute filesystem path. */
  path: string;
  /** Path relative to the scanned root, using `/` separators. */
  relativePath: string;
  /** `true` for directories, `false` for Markdown files. */
  isDir: boolean;
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
    folderId: doc.folderId ?? null,
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
  init: () => invoke<string>("ensure_studio_dir"),

  // ---- index (sidebar metadata) ----

  loadIndex: () => invoke<DocumentMeta[]>("read_index"),
  saveIndex: (entries: DocumentMeta[]) =>
    invoke<void>("write_index", { entries }),

  // ---- documents ----

  loadDocument: (docId: string) => invoke<Document>("read_document", { docId }),
  saveDocument: (doc: Document) =>
    invoke<void>("write_document", { docId: doc.id, doc }),
  deleteDocument: (docId: string) => invoke<void>("delete_document", { docId }),

  // ---- document body backups (write-before-overwrite safety net) ----

  /** List all body backups for a document, newest first (metadata only). */
  listDocBackups: (docId: string) =>
    invoke<DocBackup[]>("list_doc_backups", { docId }),
  /** Read a specific backup's full document body. */
  readDocBackup: (docId: string, backupId: string) =>
    invoke<Document>("read_doc_backup", { docId, backupId }),
  /** Restore a backup as the current document body (reversible — the
   *  pre-restore state is snapshotted first). */
  restoreDocBackup: (docId: string, backupId: string) =>
    invoke<void>("restore_doc_backup", { docId, backupId }),

  // ---- document-scoped assets (per-doc folder) ----

  saveDocAsset: (docId: string, fileName: string, data: number[]) =>
    invoke<string>("save_doc_asset", { docId, fileName, data }),
  deleteDocAsset: (docId: string, fileName: string) =>
    invoke<void>("delete_doc_asset", { docId, fileName }),
  listDocAssets: (docId: string) =>
    invoke<AssetInfo[]>("list_doc_assets", { docId }),

  // ---- asset recycle bin (per-doc `.trash/` + DB record) ----

  /** Move an unreferenced asset into its document's recycle bin. */
  trashDocAsset: (docId: string, fileName: string) =>
    invoke<void>("trash_doc_asset", { docId, fileName }),
  /** List every trashed asset across all documents (newest first). */
  listTrashedAssets: () => invoke<TrashedAsset[]>("list_trashed_assets"),
  /** Restore a trashed asset back into its document's `assets/` folder. */
  restoreTrashedAsset: (id: number) =>
    invoke<void>("restore_trashed_asset", { id }),
  /** Permanently delete a trashed asset (file + record). */
  deleteTrashedAsset: (id: number) =>
    invoke<void>("delete_trashed_asset", { id }),

  // ---- maintenance ----

  /** One-time cleanup: remove the legacy global assets directory. */
  cleanGlobalAssets: () => invoke<void>("clean_global_assets"),

  /** Read raw bytes from an arbitrary file path (e.g. from file dialog). */
  readFileBytes: (path: string) =>
    invoke<number[]>("read_file_bytes", { path }),

  /**
   * Copy an image file straight to the OS clipboard. The read + decode +
   * clipboard write all happen on the Rust side, so the image bytes never
   * cross the IPC bridge as a JSON-serialized number array (which is slow
   * for anything beyond a tiny image).
   */
  copyImageToClipboard: (path: string) =>
    invoke<void>("copy_image_to_clipboard", { path }),

  /**
   * Recursively list all Markdown files (and directories) inside `dir`.
   * Returns entries sorted so that any directory appears before the files
   * it contains.
   */
  listMarkdownFiles: (dir: string) =>
    invoke<MarkdownEntry[]>("list_markdown_files", { dir }),

  /** Open the studio data directory in the system file manager. */
  openDataDir: () => invoke<void>("open_studio_dir"),

  /** Open a specific document's folder in the system file manager. */
  openDocDir: (docId: string) => invoke<void>("open_doc_dir", { docId }),

  /** Return the full filesystem path of a document's `document.json`. */
  getDocPath: (docId: string) => invoke<string>("get_doc_path", { docId }),

  // ---- backup bundles (.jnote) ----

  /**
   * Export a document into a lossless `.jnote` ZIP archive at `destPath`.
   * Packages `document.json` + the whole `assets/` folder + a manifest.
   */
  exportDocumentBundle: (docId: string, destPath: string) =>
    invoke<void>("export_document_bundle", { docId, destPath }),

  /**
   * Import a `.jnote` archive from `srcPath` into a new document folder
   * `documents/{newDocId}/`. Returns the parsed Document (with its `id`
   * rewritten to `newDocId`) so the store can register it.
   */
  importDocumentBundle: (srcPath: string, newDocId: string) =>
    invoke<Document>("import_document_bundle", { srcPath, newDocId }),

  // ---- settings ----

  loadSettings: () => invoke<AppSettings>("read_settings"),
  saveSettings: (settings: AppSettings) =>
    invoke<void>("write_settings", { settings }),

  // ---- agent config (jcli agent model providers) ----

  /**
   * Read the jcli agent config (`~/.jdata/agent/data/agent_config.json`).
   * Returns `{}` when the file does not exist yet.
   */
  loadAgentConfig: () => invoke<AgentConfigFile>("read_agent_config"),

  /**
   * Write the full jcli agent config (overwrite).
   * The parent directory is created automatically if missing.
   */
  saveAgentConfig: (config: AgentConfigFile) =>
    invoke<void>("write_agent_config", { config }),

  // ---- folders ----

  /** Read the full folder index. Returns `[]` when no folders exist yet. */
  loadFolders: () => invoke<FolderMeta[]>("read_folders"),
  /** Overwrite the entire folder index. */
  saveFolders: (folders: FolderMeta[]) =>
    invoke<void>("write_folders", { entries: folders }),

  // ---- agent sessions (j-agent integration) ----

  /** List all agent sessions from j-agent storage. */
  agentListSessions: () => invoke<AgentSessionMeta[]>("agent_list_sessions"),

  /** Create a new agent session. Returns the session id. */
  agentCreateSession: (title?: string, workspace?: string) =>
    invoke<string>("agent_create_session", {
      title: title ?? null,
      workspace: workspace ?? null,
    }),

  /** Load an existing session's messages. */
  agentLoadSession: (sessionId: string) =>
    invoke<ChatMessage[]>("agent_load_session", { sessionId }),

  /** Delete a session (both from registry and storage). */
  agentDeleteSession: (sessionId: string) =>
    invoke<void>("agent_delete_session", { sessionId }),

  /** Start or resume an agent session (creates backend handle). */
  agentStartSession: (sessionId: string) =>
    invoke<void>("agent_start_session", { sessionId }),

  /** Send a user message to the agent session. */
  agentSendMessage: (params: {
    sessionId: string;
    text: string;
    images?: ImageData[];
  }) => invoke<void>("agent_send_message", { params }),

  /** Submit a tool result back to the agent. */
  agentToolResult: (params: {
    sessionId: string;
    toolCallId: string;
    result: string;
    isError: boolean;
    images?: ImageData[];
    planDecision?: string;
  }) => invoke<void>("agent_tool_result", { params }),

  /** Cancel the current agent response. */
  agentCancel: (sessionId: string) =>
    invoke<void>("agent_cancel", { sessionId }),

  /** Set auto-approve mode for a session. */
  agentSetAutoApprove: (sessionId: string, enabled: boolean) =>
    invoke<void>("agent_set_auto_approve", { sessionId, enabled }),

  /** Submit answer for an Ask request. */
  agentSubmitAskAnswer: (sessionId: string, answer: string) =>
    invoke<void>("agent_submit_ask_answer", { sessionId, answer }),

  // ---- terminal (PTY) ----

  /** Spawn a new PTY shell session. Returns session id + default title. */
  ptyCreate: (opts: { cwd?: string; cols: number; rows: number }) =>
    invoke<TerminalSessionInfo>("pty_create", { params: opts }),

  /** Write user input to the PTY (keyboard → shell). */
  ptyWrite: (sessionId: string, data: string) =>
    invoke<void>("pty_write", { sessionId, data }),

  /** Resize the PTY to match the terminal panel dimensions. */
  ptyResize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("pty_resize", { sessionId, cols, rows }),

  /** Kill a session and remove it from the registry. */
  ptyKill: (sessionId: string) => invoke<void>("pty_kill", { sessionId }),

  /** Kill all PTY sessions. Used during app shutdown. */
  ptyKillAll: () => invoke<void>("pty_kill_all"),

  /** Return all active sessions (id + title). */
  ptyList: () => invoke<TerminalSessionInfo[]>("pty_list"),

  /** Rename a session. */
  ptySetTitle: (sessionId: string, title: string) =>
    invoke<void>("pty_set_title", { sessionId, title }),

  /** Write multiple chunks to the PTY in a single flush. */
  ptyWriteBatch: (sessionId: string, chunks: string[]) =>
    invoke<void>("pty_write_batch", { sessionId, chunks }),

  /** Check if a PTY session exists and is alive. */
  ptyIsAlive: (sessionId: string) =>
    invoke<boolean>("pty_is_alive", { sessionId }),

  // ---- jcli (bundled CLI) ----

  /** Check whether jcli is installed on the system and bundled in the app. */
  checkJcli: () => invoke<JcliStatus>("check_jcli"),

  /** Install the bundled jcli to `~/.jdata/bin/j` and symlink to PATH. */
  installJcli: () => invoke<string>("install_jcli"),

  /** Remove the jcli symlink and binary. */
  uninstallJcli: () => invoke<void>("uninstall_jcli"),

  // ---- link preview ----

  /** Fetch link metadata (title, description, favicon, OG image) with Chrome cookies. */
  fetchLinkMetadata: (url: string) =>
    invoke<LinkMetadata>("fetch_link_metadata", { url }),

  /** Open a native WebviewWindow loading the real URL with Chrome cookies injected. */
  openLinkPreview: (url: string) => invoke<void>("open_link_preview", { url }),

  // ---- link preview tabs (multi-webview browser) ----

  /** Open a link preview window with tabs support. Returns window label. */
  openLinkPreviewWithTabs: (url: string) =>
    invoke<string>("open_link_preview_with_tabs", { url }),

  /**
   * Open the link preview window, or focus it if one already exists.
   * Called from the Activity Bar "browser" icon. Adds a fresh about:blank
   * tab to an existing window, or creates a new window if none exists.
   */
  openOrFocusLinkPreview: () => invoke<string>("open_or_focus_link_preview"),

  /** Get the current tabs state (list + active id) for a link-preview window. */
  getLinkPreviewTabsState: (windowLabel: string) =>
    invoke<LinkPreviewTabsState>("get_link_preview_tabs_state", {
      windowLabel,
    }),

  /** Add a new tab to a link-preview window. Returns the new tab info. */
  addLinkPreviewTab: (windowLabel: string, url: string) =>
    invoke<LinkPreviewTabInfo>("add_link_preview_tab", { windowLabel, url }),

  /** Switch the active tab in a link-preview window. */
  switchLinkPreviewTab: (windowLabel: string, tabId: string) =>
    invoke<void>("switch_link_preview_tab", { windowLabel, tabId }),

  /** Close a tab in a link-preview window. */
  closeLinkPreviewTab: (windowLabel: string, tabId: string) =>
    invoke<void>("close_link_preview_tab", { windowLabel, tabId }),

  /** Navigate a tab to a new URL. */
  navigateLinkPreviewTab: (windowLabel: string, tabId: string, url: string) =>
    invoke<void>("navigate_link_preview_tab", { windowLabel, tabId, url }),

  /** Refresh (reload) a tab's current URL. */
  refreshLinkPreviewTab: (windowLabel: string, tabId: string) =>
    invoke<void>("refresh_link_preview_tab", { windowLabel, tabId }),

  /** Open URL in system browser. */
  openUrlInBrowser: (url: string) =>
    invoke<void>("open_url_in_browser", { url }),
};
