import { storage, type LinkPreviewTabsState } from '../lib/core/storage';
import { onSaveError, type SliceCreator } from './storeHelpers';

// ────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────

/**
 * Browser window label used by the Rust backend to key the main window's
 * inline-browser tab manager. Must match `BROWSER_WINDOW_LABEL` in BrowserTabs.tsx.
 */
const BROWSER_WINDOW_LABEL = 'main';

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

/** Search engine definition – `searchUrl` uses `{q}` as the query placeholder. */
export interface SearchEngine {
  id: string;
  name: string;
  searchUrl: string;
  /** Single-character or emoji label for the compact avatar. */
  glyph: string;
}

/** Quick-link shortcut shown on the browser start page. */
export interface BrowserShortcut {
  id: string;
  name: string;
  url: string;
  /** Emoji or short text used as the tile icon (fallback when no favicon). */
  icon: string;
  /** Tailwind-compatible background colour for the icon tile. */
  color: string;
  /** Favicon URL fetched from Google's favicon service (optional). */
  faviconUrl?: string;
}

// ────────────────────────────────────────────────
// Defaults
// ────────────────────────────────────────────────

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', searchUrl: 'https://www.google.com/search?q={q}', glyph: 'G' },
  { id: 'bing', name: 'Bing', searchUrl: 'https://www.bing.com/search?q={q}', glyph: 'B' },
  { id: 'duckduckgo', name: 'DuckDuckGo', searchUrl: 'https://duckduckgo.com/?q={q}', glyph: 'D' },
  { id: 'baidu', name: '百度', searchUrl: 'https://www.baidu.com/s?wd={q}', glyph: '百' },
  { id: 'github', name: 'GitHub', searchUrl: 'https://github.com/search?q={q}', glyph: '' },
  { id: 'stackoverflow', name: 'Stack Overflow', searchUrl: 'https://stackoverflow.com/search?q={q}', glyph: 'S' },
];

export const DEFAULT_SEARCH_ENGINE_ID = 'google';

/**
 * The start page ships with NO preset shortcuts — the grid starts empty and
 * only shows links the user explicitly added. User shortcuts are persisted
 * via `setBrowserShortcuts` (SQLite settings, see `storage.saveSettings`)
 * and restored on startup in `documentsSlice.init`.
 */
export const DEFAULT_BROWSER_SHORTCUTS: BrowserShortcut[] = [];

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────

/**
 * Resolve a raw user input string into a full URL.
 *
 * - If the input looks like a URL (contains a dot, no spaces, no protocol),
 *   prepend `https://`.
 * - If it already has a protocol, use as-is.
 * - Otherwise, treat it as a search query using the selected search engine.
 */
export function resolveBrowserUrl(input: string, searchEngineId: string): string {
  const trimmed = input.trim();
  if (!trimmed) return 'about:blank';

  // Already has a protocol
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // Looks like a domain (has a dot, no spaces)
  if (trimmed.includes('.') && !trimmed.includes(' ')) {
    return 'https://' + trimmed;
  }

  // Search query
  const engine = SEARCH_ENGINES.find((e) => e.id === searchEngineId) ?? SEARCH_ENGINES[0];
  return engine.searchUrl.replace('{q}', encodeURIComponent(trimmed));
}

/** Get the search engine favicon URL (Google's favicon service). */
export function getSearchEngineFaviconUrl(engineId: string): string {
  const engine = SEARCH_ENGINES.find((e) => e.id === engineId) ?? SEARCH_ENGINES[0];
  const domain = new URL(engine.searchUrl).hostname;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/** Get the favicon URL for any website URL (Google's favicon service). */
export function getFaviconUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return undefined;
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
  } catch {
    return undefined;
  }
}

// ────────────────────────────────────────────────
// Slice
// ────────────────────────────────────────────────

export const createBrowserSlice: SliceCreator = (set, get) => {
  return {
    // ── State ──
    browserTabs: [],
    browserActiveTabId: null,
    browserAddressUrl: '',
    browserSearchEngine: DEFAULT_SEARCH_ENGINE_ID,
    browserShortcuts: DEFAULT_BROWSER_SHORTCUTS,

    // ── Actions ──

    /** Replace the entire tabs state (called from the Tauri event listener). */
    setBrowserTabsState: (state: LinkPreviewTabsState) => {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
      set({
        browserTabs: state.tabs,
        browserActiveTabId: state.activeTabId,
        // Sync the address bar to the active tab's URL
        browserAddressUrl: activeTab?.url ?? '',
      });
    },

    /** Set the address bar input value (user typing). */
    setBrowserAddressUrl: (url: string) => {
      set({ browserAddressUrl: url });
    },

    /** Change the selected search engine and persist. */
    setBrowserSearchEngine: (id: string) => {
      set({ browserSearchEngine: id });
      storage.saveSettings({ browserSearchEngine: id }).catch(onSaveError('浏览器'));
    },

    /**
     * Navigate to a URL. If an active tab exists, navigate it; otherwise
     * create a new tab. The input is resolved via `resolveBrowserUrl`.
     */
    navigateBrowserUrl: (input: string) => {
      const url = resolveBrowserUrl(input, get().browserSearchEngine);
      const activeTabId = get().browserActiveTabId;
      if (activeTabId) {
        storage
          .navigateLinkPreviewTab(BROWSER_WINDOW_LABEL, activeTabId, url)
          .catch(console.error);
      } else {
        storage.addLinkPreviewTab(BROWSER_WINDOW_LABEL, url).catch(console.error);
      }
    },

    /** Refresh (reload) the active tab. */
    refreshBrowserTab: () => {
      const tabId = get().browserActiveTabId;
      if (tabId) {
        storage.refreshLinkPreviewTab(BROWSER_WINDOW_LABEL, tabId).catch(console.error);
      }
    },

    /** Open the active tab's URL in the system browser. */
    openInExternalBrowser: () => {
      const tabs = get().browserTabs;
      const activeId = get().browserActiveTabId;
      const activeTab = tabs.find((t) => t.id === activeId);
      if (activeTab?.url) {
        storage.openUrlInBrowser(activeTab.url).catch(console.error);
      }
    },

    /** Add a new browser tab (defaults to about:blank). */
    addBrowserTab: (url?: string) => {
      storage
        .addLinkPreviewTab(BROWSER_WINDOW_LABEL, url ?? 'about:blank')
        .catch(console.error);
    },

    /** Update the shortcuts list and persist. */
    setBrowserShortcuts: (shortcuts: BrowserShortcut[]) => {
      set({ browserShortcuts: shortcuts });
      storage.saveSettings({ browserShortcuts: shortcuts }).catch(onSaveError('浏览器'));
    },
  };
}
