import { invoke } from "@tauri-apps/api/core";
const ipc = {
  // ---- lifecycle ----
  /** Create the `~/.jdata/studio/{documents,assets}` directory tree. */
  init: () => invoke("ensure_studio_dir"),
  // ---- index (sidebar metadata) ----
  loadIndex: () => invoke("read_index"),
  saveIndex: (entries) => invoke("write_index", { entries }),
  // ---- documents ----
  loadDocument: (docId) => invoke("read_document", { docId }),
  saveDocument: (doc) => invoke("write_document", { docId: doc.id, doc }),
  deleteDocument: (docId) => invoke("delete_document", { docId }),
  // ---- document body backups (write-before-overwrite safety net) ----
  /** List all body backups for a document, newest first (metadata only). */
  listDocBackups: (docId) => invoke("list_doc_backups", { docId }),
  /** Read a specific backup's full document body. */
  readDocBackup: (docId, backupId) => invoke("read_doc_backup", { docId, backupId }),
  /** Restore a backup as the current document body (reversible - the
   *  pre-restore state is snapshotted first). */
  restoreDocBackup: (docId, backupId) => invoke("restore_doc_backup", { docId, backupId }),
  // ---- document-scoped assets (per-doc folder) ----
  saveDocAsset: (docId, fileName, data) => invoke("save_doc_asset", { docId, fileName, data }),
  deleteDocAsset: (docId, fileName) => invoke("delete_doc_asset", { docId, fileName }),
  listDocAssets: (docId) => invoke("list_doc_assets", { docId }),
  // ---- asset recycle bin (per-doc `.trash/` + DB record) ----
  /** Move an unreferenced asset into its document's recycle bin. */
  trashDocAsset: (docId, fileName) => invoke("trash_doc_asset", { docId, fileName }),
  /** List every trashed asset across all documents (newest first). */
  listTrashedAssets: () => invoke("list_trashed_assets"),
  /** Restore a trashed asset back into its document's `assets/` folder. */
  restoreTrashedAsset: (id) => invoke("restore_trashed_asset", { id }),
  /** Permanently delete a trashed asset (file + record). */
  deleteTrashedAsset: (id) => invoke("delete_trashed_asset", { id }),
  // ---- maintenance ----
  /** One-time cleanup: remove the legacy global assets directory. */
  cleanGlobalAssets: () => invoke("clean_global_assets"),
  /** Read raw bytes from an arbitrary file path (e.g. from file dialog). */
  readFileBytes: (path) => invoke("read_file_bytes", { path }),
  /**
   * Copy an image file straight to the OS clipboard. The read + decode +
   * clipboard write all happen on the Rust side, so the image bytes never
   * cross the IPC bridge as a JSON-serialized number array (which is slow
   * for anything beyond a tiny image).
   */
  copyImageToClipboard: (path) => invoke("copy_image_to_clipboard", { path }),
  /**
   * Recursively list all Markdown files (and directories) inside `dir`.
   * Returns entries sorted so that any directory appears before the files
   * it contains.
   */
  listMarkdownFiles: (dir) => invoke("list_markdown_files", { dir }),
  /** Open the studio data directory in the system file manager. */
  openDataDir: () => invoke("open_studio_dir"),
  /** Open a specific document's folder in the system file manager. */
  openDocDir: (docId) => invoke("open_doc_dir", { docId }),
  /** Return the full filesystem path of a document's `document.json`. */
  getDocPath: (docId) => invoke("get_doc_path", { docId }),
  // ---- backup bundles (.jnote) ----
  /**
   * Export a document into a lossless `.jnote` ZIP archive at `destPath`.
   * Packages `document.json` + the whole `assets/` folder + a manifest.
   */
  exportDocumentBundle: (docId, destPath) => invoke("export_document_bundle", { docId, destPath }),
  /**
   * Import a `.jnote` archive from `srcPath` into a new document folder
   * `documents/{newDocId}/`. Returns the parsed Document (with its `id`
   * rewritten to `newDocId`) so the store can register it.
   */
  importDocumentBundle: (srcPath, newDocId) => invoke("import_document_bundle", { srcPath, newDocId }),
  // ---- settings ----
  loadSettings: () => invoke("read_settings"),
  saveSettings: (settings) => invoke("write_settings", { settings }),
  // ---- agent config (jcli agent model providers) ----
  /**
   * Read the jcli agent config (`~/.jdata/agent/data/agent_config.json`).
   * Returns `{}` when the file does not exist yet.
   */
  loadAgentConfig: () => invoke("read_agent_config"),
  /**
   * Write the full jcli agent config (overwrite).
   * The parent directory is created automatically if missing.
   */
  saveAgentConfig: (config) => invoke("write_agent_config", { config }),
  // ---- folders ----
  /** Read the full folder index. Returns `[]` when no folders exist yet. */
  loadFolders: () => invoke("read_folders"),
  /** Overwrite the entire folder index. */
  saveFolders: (folders) => invoke("write_folders", { entries: folders }),
  // ---- agent sessions (j-agent integration) ----
  /** List all agent sessions from j-agent storage. */
  agentListSessions: () => invoke("agent_list_sessions"),
  /** Create a new agent session. Returns the session id. */
  agentCreateSession: (title, workspace) => invoke("agent_create_session", {
    title: title ?? null,
    workspace: workspace ?? null
  }),
  /** Load an existing session's messages. */
  agentLoadSession: (sessionId) => invoke("agent_load_session", { sessionId }),
  /** Delete a session (both from registry and storage). */
  agentDeleteSession: (sessionId) => invoke("agent_delete_session", { sessionId }),
  /** Start or resume an agent session (creates backend handle). */
  agentStartSession: (sessionId) => invoke("agent_start_session", { sessionId }),
  /** Send a user message to the agent session. */
  agentSendMessage: (params) => invoke("agent_send_message", { params }),
  /** Submit a tool result back to the agent. */
  agentToolResult: (params) => invoke("agent_tool_result", { params }),
  /** Cancel the current agent response. */
  agentCancel: (sessionId) => invoke("agent_cancel", { sessionId }),
  /** Set auto-approve mode for a session. */
  agentSetAutoApprove: (sessionId, enabled) => invoke("agent_set_auto_approve", { sessionId, enabled }),
  /** Submit answer for an Ask request. */
  agentSubmitAskAnswer: (sessionId, answer) => invoke("agent_submit_ask_answer", { sessionId, answer }),
  // ---- terminal (PTY) ----
  /** Spawn a new PTY shell session. Returns session id + default title. */
  ptyCreate: (opts) => invoke("pty_create", { params: opts }),
  /** Write user input to the PTY (keyboard -> shell). */
  ptyWrite: (sessionId, data) => invoke("pty_write", { sessionId, data }),
  /** Resize the PTY to match the terminal panel dimensions. */
  ptyResize: (sessionId, cols, rows) => invoke("pty_resize", { sessionId, cols, rows }),
  /** Kill a session and remove it from the registry. */
  ptyKill: (sessionId) => invoke("pty_kill", { sessionId }),
  /** Kill all PTY sessions. Used during app shutdown. */
  ptyKillAll: () => invoke("pty_kill_all"),
  /** Return all active sessions (id + title). */
  ptyList: () => invoke("pty_list"),
  /** Rename a session. */
  ptySetTitle: (sessionId, title) => invoke("pty_set_title", { sessionId, title }),
  /** Write multiple chunks to the PTY in a single flush. */
  ptyWriteBatch: (sessionId, chunks) => invoke("pty_write_batch", { sessionId, chunks }),
  /** Check if a PTY session exists and is alive. */
  ptyIsAlive: (sessionId) => invoke("pty_is_alive", { sessionId }),
  // ---- runtime log file (frontend -> ~/.jdata/studio/logs/) ----
  /**
   * Append a single pre-formatted log line to today's log file
   * (`~/.jdata/studio/logs/app-YYYY-MM-DD.log`). The JS logger adds the
   * timestamp / level / source prefix before calling this, so the Rust side
   * just writes verbatim + a trailing newline. Safe to call from any window.
   */
  appendLogLine: (line) => invoke("append_log_line", { line }),
  /** Return the absolute path of today's log file (for display in Debug settings). */
  getLogFilePath: () => invoke("get_log_file_path"),
  /** Reveal the logs directory in the system file manager (Finder/Explorer). */
  openLogsDir: () => invoke("open_logs_dir"),
  /** Delete every log file. Returns the number of files removed. */
  clearLogs: () => invoke("clear_logs"),
  // ---- jcli (bundled CLI) ----
  /** Check whether jcli is installed on the system and bundled in the app. */
  checkJcli: () => invoke("check_jcli"),
  /** Install the bundled jcli to `~/.jdata/bin/j` and symlink to PATH. */
  installJcli: () => invoke("install_jcli"),
  /** Remove the jcli symlink and binary. */
  uninstallJcli: () => invoke("uninstall_jcli"),
  // ---- link preview ----
  /** Fetch link metadata (title, description, favicon, OG image) with Chrome cookies. */
  fetchLinkMetadata: (url) => invoke("fetch_link_metadata", { url }),
  /** Open a native WebviewWindow loading the real URL with Chrome cookies injected. */
  openLinkPreview: (url) => invoke("open_link_preview", { url }),
  // ---- AI graph HTTP proxy (bypasses webview CORS) ----
  /**
   * Proxy an HTTP POST request through Rust to bypass webview CORS restrictions.
   * Used by the AI graph generator to call OpenAI-compatible chat completions.
   */
  aiGraphFetch: (request) => invoke("ai_graph_fetch", { request }),
  // ---- link preview tabs (multi-webview browser) ----
  /** Open a link preview window with tabs support. Returns window label. */
  openLinkPreviewWithTabs: (url) => invoke("open_link_preview_with_tabs", { url }),
  /**
   * Open the link preview window, or focus it if one already exists.
   * Called from the Activity Bar "browser" icon. Adds a fresh about:blank
   * tab to an existing window, or creates a new window if none exists.
   */
  openOrFocusLinkPreview: () => invoke("open_or_focus_link_preview"),
  /** Get the current tabs state (list + active id) for a link-preview window. */
  getLinkPreviewTabsState: (windowLabel) => invoke("get_link_preview_tabs_state", {
    windowLabel
  }),
  /** Add a new tab to a link-preview window. Returns the new tab info. */
  addLinkPreviewTab: (windowLabel, url) => invoke("add_link_preview_tab", { windowLabel, url }),
  /** Switch the active tab in a link-preview window. */
  switchLinkPreviewTab: (windowLabel, tabId) => invoke("switch_link_preview_tab", { windowLabel, tabId }),
  /** Close a tab in a link-preview window. */
  closeLinkPreviewTab: (windowLabel, tabId) => invoke("close_link_preview_tab", { windowLabel, tabId }),
  /** Navigate a tab to a new URL. */
  navigateLinkPreviewTab: (windowLabel, tabId, url) => invoke("navigate_link_preview_tab", { windowLabel, tabId, url }),
  /** Refresh (reload) a tab's current URL. */
  refreshLinkPreviewTab: (windowLabel, tabId) => invoke("refresh_link_preview_tab", { windowLabel, tabId }),
  /** Open URL in system browser. */
  openUrlInBrowser: (url) => invoke("open_url_in_browser", { url }),
  // ---- inline browser panel (embedded in the main window) ----
  /**
   * Show the inline browser panel in the main window. Ensures a tab manager
   * exists for the `"main"` window label and adds a fresh about:blank tab
   * if none exist. Called by `BrowserPanel` on mount.
   */
  showBrowserPanel: () => invoke("show_browser_panel"),
  /**
   * Hide the inline browser panel. Moves all content webviews off-screen
   * and clears the visible flag so Cmd+T / Cmd+W stop routing to the
   * browser. Tabs are preserved so the user can return with their session
   * intact. Called by `BrowserPanel` on unmount/hide.
   */
  hideBrowserPanel: () => invoke("hide_browser_panel"),
  /**
   * Update the browser panel's webview area geometry (from React's
   * `ResizeObserver`). Rust stores the rect and repositions the active
   * content webview to match. This keeps native child webviews aligned
   * with the React-rendered container as the sidebar opens/closes or the
   * window resizes.
   */
  updateBrowserPanelRect: (rect) => invoke("update_browser_panel_rect", { rect }),
  /**
   * Get the current tabs state for the inline browser panel. Convenience
   * wrapper around the main-window tab manager.
   */
  getBrowserPanelTabsState: () => invoke("get_browser_panel_tabs_state"),
  // ---- window control ----
  /** Quit the entire application (called after exit-confirmation gate). */
  quitApp: () => invoke("quit_app"),
  /**
   * Report that the calling window gained focus. Updates Rust-side
   * `FocusedWindow` state so native menu commands (Cmd+W, etc.) route
   * to the correct window. Bypasses Tauri's unreliable
   * `WindowEvent::Focused` for child webview windows.
   */
  reportWindowFocus: (label) => invoke("report_window_focus", { label })
};
export {
  ipc
};
