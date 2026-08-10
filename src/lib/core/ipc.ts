/**
 * ipc — Tauri IPC 唯一闸口。
 *
 * 封装所有 `invoke()` 调用（文档/终端/浏览器/设置/资产等），
 * 是 frontend → Rust backend 的唯一通道。
 * Frontend 代码禁止直接调用 `invoke()`，必须通过此模块。
 */

import { invoke } from "@tauri-apps/api/core";
import type { Document } from "../../types";
import type {
  ChatMessage,
  ImageData,
  AgentSessionMeta,
} from "../../types/agent";
import type {
  DocumentMeta,
  FolderMeta,
  AssetInfo,
  TrashedAsset,
  DocBackup,
  ModelProvider,
  AgentConfigFile,
} from "../../types/storage";
import type { AppSettings } from "../../types/settings";
import type { TerminalSessionInfo, JcliStatus } from "../../types/terminal";
import type {
  LinkMetadata,
  AiGraphFetchRequest,
  AiGraphFetchResponse,
  LinkPreviewTabInfo,
  LinkPreviewTabsState,
  BrowserPanelRect,
  MarkdownEntry,
} from "../../types/browser";

export const ipc = {
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
  /** Restore a backup as the current document body (reversible - the
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

  /** Write user input to the PTY (keyboard -> shell). */
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

  // ---- runtime log file (frontend -> ~/.jdata/studio/logs/) ----

  /**
   * Append a single pre-formatted log line to today's log file
   * (`~/.jdata/studio/logs/app-YYYY-MM-DD.log`). The JS logger adds the
   * timestamp / level / source prefix before calling this, so the Rust side
   * just writes verbatim + a trailing newline. Safe to call from any window.
   */
  appendLogLine: (line: string) => invoke<void>("append_log_line", { line }),

  /** Return the absolute path of today's log file (for display in Debug settings). */
  getLogFilePath: () => invoke<string>("get_log_file_path"),

  /** Reveal the logs directory in the system file manager (Finder/Explorer). */
  openLogsDir: () => invoke<void>("open_logs_dir"),

  /** Delete every log file. Returns the number of files removed. */
  clearLogs: () => invoke<number>("clear_logs"),

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

  // ---- AI graph HTTP proxy (bypasses webview CORS) ----

  /**
   * Proxy an HTTP POST request through Rust to bypass webview CORS restrictions.
   * Used by the AI graph generator to call OpenAI-compatible chat completions.
   */
  aiGraphFetch: (request: AiGraphFetchRequest) =>
    invoke<AiGraphFetchResponse>("ai_graph_fetch", { request }),

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

  // ---- inline browser panel (embedded in the main window) ----

  /**
   * Show the inline browser panel in the main window. Ensures a tab manager
   * exists for the `"main"` window label and adds a fresh about:blank tab
   * if none exist. Called by `BrowserPanel` on mount.
   */
  showBrowserPanel: () => invoke<void>("show_browser_panel"),

  /**
   * Hide the inline browser panel. Moves all content webviews off-screen
   * and clears the visible flag so Cmd+T / Cmd+W stop routing to the
   * browser. Tabs are preserved so the user can return with their session
   * intact. Called by `BrowserPanel` on unmount/hide.
   */
  hideBrowserPanel: () => invoke<void>("hide_browser_panel"),

  /**
   * Update the browser panel's webview area geometry (from React's
   * `ResizeObserver`). Rust stores the rect and repositions the active
   * content webview to match. This keeps native child webviews aligned
   * with the React-rendered container as the sidebar opens/closes or the
   * window resizes.
   */
  updateBrowserPanelRect: (rect: BrowserPanelRect) =>
    invoke<void>("update_browser_panel_rect", { rect }),

  /**
   * Get the current tabs state for the inline browser panel. Convenience
   * wrapper around the main-window tab manager.
   */
  getBrowserPanelTabsState: () =>
    invoke<LinkPreviewTabsState>("get_browser_panel_tabs_state"),

  // ---- window control ----

  /** Quit the entire application (called after exit-confirmation gate). */
  quitApp: () => invoke<void>("quit_app"),

  /**
   * Report that the calling window gained focus. Updates Rust-side
   * `FocusedWindow` state so native menu commands (Cmd+W, etc.) route
   * to the correct window. Bypasses Tauri's unreliable
   * `WindowEvent::Focused` for child webview windows.
   */
  reportWindowFocus: (label: string) =>
    invoke<void>("report_window_focus", { label }),
};
