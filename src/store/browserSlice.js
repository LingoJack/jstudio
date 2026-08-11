import { ipc } from "../lib/core/ipc";
import { onSaveError } from "./storeHelpers";
const BROWSER_WINDOW_LABEL = "main";
const SEARCH_ENGINES = [
  { id: "google", name: "Google", searchUrl: "https://www.google.com/search?q={q}", glyph: "G" },
  { id: "bing", name: "Bing", searchUrl: "https://www.bing.com/search?q={q}", glyph: "B" },
  { id: "duckduckgo", name: "DuckDuckGo", searchUrl: "https://duckduckgo.com/?q={q}", glyph: "D" },
  { id: "baidu", name: "\u767E\u5EA6", searchUrl: "https://www.baidu.com/s?wd={q}", glyph: "\u767E" },
  { id: "github", name: "GitHub", searchUrl: "https://github.com/search?q={q}", glyph: "" },
  { id: "stackoverflow", name: "Stack Overflow", searchUrl: "https://stackoverflow.com/search?q={q}", glyph: "S" }
];
const DEFAULT_SEARCH_ENGINE_ID = "google";
const DEFAULT_BROWSER_SHORTCUTS = [];
function resolveBrowserUrl(input, searchEngineId) {
  const trimmed = input.trim();
  if (!trimmed) return "about:blank";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes(".") && !trimmed.includes(" ")) {
    return "https://" + trimmed;
  }
  const engine = SEARCH_ENGINES.find((e) => e.id === searchEngineId) ?? SEARCH_ENGINES[0];
  return engine.searchUrl.replace("{q}", encodeURIComponent(trimmed));
}
function getSearchEngineFaviconUrl(engineId) {
  const engine = SEARCH_ENGINES.find((e) => e.id === engineId) ?? SEARCH_ENGINES[0];
  const domain = new URL(engine.searchUrl).hostname;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}
function getFaviconUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return void 0;
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
  } catch {
    return void 0;
  }
}
const createBrowserSlice = (set, get) => {
  return {
    // ── State ──
    browserTabs: [],
    browserActiveTabId: null,
    browserAddressUrl: "",
    browserSearchEngine: DEFAULT_SEARCH_ENGINE_ID,
    browserShortcuts: DEFAULT_BROWSER_SHORTCUTS,
    // ── Actions ──
    /** Replace the entire tabs state (called from the Tauri event listener). */
    setBrowserTabsState: (state) => {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
      set({
        browserTabs: state.tabs,
        browserActiveTabId: state.activeTabId,
        // Sync the address bar to the active tab's URL
        browserAddressUrl: activeTab?.url ?? ""
      });
    },
    /** Set the address bar input value (user typing). */
    setBrowserAddressUrl: (url) => {
      set({ browserAddressUrl: url });
    },
    /** Change the selected search engine and persist. */
    setBrowserSearchEngine: (id) => {
      set({ browserSearchEngine: id });
      ipc.saveSettings({ browserSearchEngine: id }).catch(onSaveError("\u6D4F\u89C8\u5668"));
    },
    /**
     * Navigate to a URL. If an active tab exists, navigate it; otherwise
     * create a new tab. The input is resolved via `resolveBrowserUrl`.
     */
    navigateBrowserUrl: (input) => {
      const url = resolveBrowserUrl(input, get().browserSearchEngine);
      const activeTabId = get().browserActiveTabId;
      if (activeTabId) {
        ipc.navigateLinkPreviewTab(BROWSER_WINDOW_LABEL, activeTabId, url).catch(console.error);
      } else {
        ipc.addLinkPreviewTab(BROWSER_WINDOW_LABEL, url).catch(console.error);
      }
    },
    /** Refresh (reload) the active tab. */
    refreshBrowserTab: () => {
      const tabId = get().browserActiveTabId;
      if (tabId) {
        ipc.refreshLinkPreviewTab(BROWSER_WINDOW_LABEL, tabId).catch(console.error);
      }
    },
    /** Open the active tab's URL in the system browser. */
    openInExternalBrowser: () => {
      const tabs = get().browserTabs;
      const activeId = get().browserActiveTabId;
      const activeTab = tabs.find((t) => t.id === activeId);
      if (activeTab?.url) {
        ipc.openUrlInBrowser(activeTab.url).catch(console.error);
      }
    },
    /** Add a new browser tab (defaults to about:blank). */
    addBrowserTab: (url) => {
      ipc.addLinkPreviewTab(BROWSER_WINDOW_LABEL, url ?? "about:blank").catch(console.error);
    },
    /** Update the shortcuts list and persist. */
    setBrowserShortcuts: (shortcuts) => {
      set({ browserShortcuts: shortcuts });
      ipc.saveSettings({ browserShortcuts: shortcuts }).catch(onSaveError("\u6D4F\u89C8\u5668"));
    }
  };
};
export {
  DEFAULT_BROWSER_SHORTCUTS,
  DEFAULT_SEARCH_ENGINE_ID,
  SEARCH_ENGINES,
  createBrowserSlice,
  getFaviconUrl,
  getSearchEngineFaviconUrl,
  resolveBrowserUrl
};
