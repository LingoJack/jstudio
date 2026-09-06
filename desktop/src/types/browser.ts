/** Browser / link-preview types - mirrors Rust structs for IPC. */

/**
 * Link preview metadata - mirrors the Rust `LinkMetadata` struct.
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
 * AI graph HTTP proxy request - mirrors the Rust `AiGraphFetchRequest` struct.
 * Used by `ai_graph_fetch` to bypass webview CORS restrictions.
 */
export interface AiGraphFetchRequest {
  /** Full target URL (scheme + host + path). */
  url: string;
  /** Request headers map (e.g. Authorization, Content-Type). */
  headers: Record<string, string>;
  /** Request body as a JSON string. Empty string = no body. */
  body: string;
  /** Timeout in seconds. 0 = use default 60s. */
  timeoutSecs?: number;
}

/**
 * AI graph HTTP proxy response - mirrors the Rust `AiGraphFetchResponse` struct.
 * Returned by `ai_graph_fetch`.
 */
export interface AiGraphFetchResponse {
  /** HTTP status code (e.g. 200, 400, 401). */
  status: number;
  /** Whether the response is 2xx. */
  ok: boolean;
  /** Response body as text (JSON string from the LLM API). */
  body: string;
}

/**
 * Link preview tab info - mirrors the Rust `TabInfo` struct in link_tabs.rs.
 * One per open tab in the link-preview window.
 */
export interface LinkPreviewTabInfo {
  id: string;
  url: string;
  title: string;
  loading: boolean;
}

/**
 * Full link-preview tabs state - mirrors the Rust `TabsState` struct.
 * Pushed to the frontend via the `link-preview:tabs-updated` event and
 * returned by `getLinkPreviewTabsState`.
 */
export interface LinkPreviewTabsState {
  tabs: LinkPreviewTabInfo[];
  activeTabId: string | null;
}

/**
 * Geometry of the inline browser panel's webview area, in CSS pixels,
 * relative to the main window's top-left corner. Reported by the React
 * `BrowserPanel` component's `ResizeObserver` so Rust can position native
 * child webviews on top of the React UI. Mirrors the Rust `BrowserPanelRect`
 * struct in link_tabs.rs.
 */
export interface BrowserPanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Result of the one-time Chrome login-state import: how many cookies were
 * injected into the built-in browser session and how many were skipped
 * (undecryptable / rejected by the cookie store).
 */
export interface ChromeLoginImportResult {
  imported: number;
  failed: number;
}

/**
 * A single entry returned by `list_markdown_files` - mirrors the Rust
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
