/**
 * BrowserPanel - inline browser panel embedded in the main window.
 *
 * This panel reuses the same Rust `TabManager` infrastructure as the
 * standalone link-preview window (`link_tabs.rs`), but registered under
 * the window label `"main"`. Native child webviews are attached to the
 * main window and positioned on top of the React UI using a rect
 * reported by `ResizeObserver`.
 *
 * Layout (TabBar floats over the webview content):
 *   +----------------------------------------------------+
 *   | [address bar]                        refresh | open |  solid, top
 *   +----------------------------------------------------+
 *   | [Tab1] [Tab2] [+]   (floating glass TabBar)        |  absolute, z-20
 *   |                                                     |  (white bg from container
 *   | --- native webview starts below TabBar ----------- |   behind the TabBar)
 *   |                                                     |
 *   |  Native content webview                             |  positioned by Rust at
 *   |  (positioned at rect.y + TAB_BAR_HEIGHT)            |  the ResizeObserver rect
 *   |                                                     |
 *   +----------------------------------------------------+
 *
 * The TabBar floats over the container's white background, which blends
 * seamlessly with the native webview's content below. The native webview
 * starts TAB_BAR_HEIGHT pixels below the container's top edge so it never
 * covers the TabBar.
 *
 * Lifecycle (mount-once + CSS-hide, same pattern as AgentChatPanel):
 *   - `hidden` false -> `showBrowserPanel()` + start ResizeObserver
 *   - `hidden` true  -> `hideBrowserPanel()` (webviews moved off-screen,
 *     tabs preserved so the user can return with their session intact)
 *
 * Keyboard:
 *   Cmd+T / Cmd+W -- handled Rust-side in `on_menu_event` (routes to
 *     `add_tab_to_main_browser` / `close_active_tab_in_main_browser`
 *     when `is_browser_panel_visible()` is true).
 *   Cmd+R / Cmd+L -- DOM keydown (not in the custom macOS menu).
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "../../store/useStore";
import { useI18n } from "../../lib/core/i18n";
import {
  storage,
  type LinkPreviewTabsState,
  type BrowserPanelRect,
} from "../../lib/core/storage";
import { TAB_BAR_OVERLAY_HEIGHT } from "../ui/TabBar";
import BrowserTabs, { BROWSER_WINDOW_LABEL } from "./BrowserTabs";
import { handleNativeSelectAll } from "../../lib/shortcuts/nativeSelectAll";

export default function BrowserPanel({ hidden }: { hidden?: boolean }) {
  const [state, setState] = useState<LinkPreviewTabsState>({
    tabs: [],
    activeTabId: null,
  });
  const [addressBarUrl, setAddressBarUrl] = useState("");
  const addressInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const setActiveSidebarView = useStore((s) => s.setActiveSidebarView);
  const tabBarPosition = useStore((s) => s.tabBarPosition);

  // -- Lifecycle: show / hide the browser panel --
  // Tell Rust to mark the panel visible (so Cmd+T/Cmd+W route here) and
  // add a fresh about:blank tab if none exist. On hide, move all content
  // webviews off-screen -- tabs are preserved for the next show.
  useEffect(() => {
    if (hidden) {
      storage.hideBrowserPanel().catch(console.error);
      return;
    }
    storage.showBrowserPanel().catch(console.error);
    // Fetch current tabs state (covers the case where tabs were preserved
    // from a previous show/hide cycle).
    storage
      .getBrowserPanelTabsState()
      .then(setState)
      .catch(console.error);
  }, [hidden]);

  // -- Listen for tab state updates from Rust --
  // Rust emits `link-preview:tabs-updated` scoped to the "main" window
  // via `emit_to`, so this listener only fires for the inline panel's
  // tabs (not the standalone link-preview window's tabs).
  useEffect(() => {
    if (hidden) return;
    const unlisten = listen<LinkPreviewTabsState>(
      "link-preview:tabs-updated",
      (event) => {
        setState(event.payload);
      },
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, [hidden]);

  // -- Listen for "last tab closed" -> switch to documents view --
  // Rust emits `browser-panel:empty` when the last browser tab closes.
  // We switch back to the documents view so the user isn't stuck in an
  // empty browser panel.
  useEffect(() => {
    if (hidden) return;
    const unlisten = listen("browser-panel:empty", () => {
      setActiveSidebarView("documents");
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [hidden, setActiveSidebarView]);

  // -- ResizeObserver: report webview container rect to Rust --
  // Rust positions native child webviews at this rect. The observer
  // fires when the sidebar opens/closes, the window resizes, or the
  // panel becomes visible -- keeping the webviews aligned with the
  // React-rendered container.
  //
  // The TabBar floats over the container (absolute, z-20) at either the
  // top or bottom depending on the global `tabBarPosition` setting. The
  // native webview must NOT cover the TabBar, so we shrink the reported
  // rect by the TabBar's overlay height on the side the TabBar occupies:
  //   - 'top':    webview starts OVERLAY_HEIGHT below the container top
  //   - 'bottom': webview ends OVERLAY_HEIGHT above the container bottom
  // The container's white background shows through behind the floating
  // TabBar, creating the illusion that the TabBar floats over the
  // webview content.
  useEffect(() => {
    if (hidden) return;
    const container = containerRef.current;
    if (!container) return;

    const updateRect = () => {
      const rect = container.getBoundingClientRect();
      // Skip zero-size rects (panel hidden during layout transitions).
      if (rect.width === 0 || rect.height === 0) return;
      // Reserve space for the floating TabBar on its occupied side.
      // When no tabs exist, no offset is needed.
      const strip = state.tabs.length > 0 ? TAB_BAR_OVERLAY_HEIGHT : 0;
      const isTop = tabBarPosition === "top";
      const browserRect: BrowserPanelRect = {
        x: rect.x,
        y: isTop ? rect.y + strip : rect.y,
        width: rect.width,
        height: rect.height - strip,
      };
      if (browserRect.width <= 0 || browserRect.height <= 0) return;
      storage.updateBrowserPanelRect(browserRect).catch(console.error);
    };

    // Report immediately so the webview is positioned without waiting
    // for the first ResizeObserver callback.
    updateRect();
    const observer = new ResizeObserver(updateRect);
    observer.observe(container);
    return () => observer.disconnect();
  }, [hidden, state.tabs.length, tabBarPosition]);

  // -- Sync address bar to the active tab's URL --
  useEffect(() => {
    const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
    const url = activeTab?.url ?? "";
    setAddressBarUrl(url === "about:blank" ? "" : url);
  }, [state.activeTabId, state.tabs]);

  // -- Auto-focus address bar on new tab (about:blank) --
  useEffect(() => {
    if (hidden) return;
    const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
    if (activeTab?.url === "about:blank") {
      requestAnimationFrame(() => addressInputRef.current?.focus());
    }
  }, [state.activeTabId, state.tabs, hidden]);

  // -- Actions --
  // Tab switch / close / context menu live in BrowserTabs. The actions
  // below are the ones this panel still needs directly: navigating the
  // address bar, refreshing the active tab, opening externally, and the
  // empty-state "New Tab" button.

  const addNewTab = useCallback(() => {
    storage.addLinkPreviewTab(BROWSER_WINDOW_LABEL, "about:blank").catch(console.error);
  }, []);

  const navigateToUrl = useCallback(
    (url: string) => {
      if (!url.trim()) return;

      // URL normalization (same logic as LinkPreviewTabsApp)
      let normalizedUrl = url.trim();
      if (
        !normalizedUrl.startsWith("http://") &&
        !normalizedUrl.startsWith("https://") &&
        !normalizedUrl.startsWith("about:")
      ) {
        if (normalizedUrl.includes(".") && !normalizedUrl.includes(" ")) {
          normalizedUrl = "https://" + normalizedUrl;
        } else {
          normalizedUrl =
            "https://www.google.com/search?q=" +
            encodeURIComponent(normalizedUrl);
        }
      }

      const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
      if (activeTab) {
        storage
          .navigateLinkPreviewTab(BROWSER_WINDOW_LABEL, activeTab.id, normalizedUrl)
          .catch(console.error);
      } else {
        storage
          .addLinkPreviewTab(BROWSER_WINDOW_LABEL, normalizedUrl)
          .catch(console.error);
      }
    },
    [state.tabs, state.activeTabId],
  );

  const refreshTab = useCallback(() => {
    const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
    if (activeTab) {
      storage
        .refreshLinkPreviewTab(BROWSER_WINDOW_LABEL, activeTab.id)
        .catch(console.error);
    }
  }, [state.tabs, state.activeTabId]);

  const openInBrowser = useCallback(() => {
    const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
    if (activeTab) {
      storage.openUrlInBrowser(activeTab.url).catch(console.error);
    }
  }, [state.tabs, state.activeTabId]);

  // -- Keyboard shortcuts (Cmd+R, Cmd+L) --
  // Cmd+T / Cmd+W are handled Rust-side in on_menu_event -- when the
  // browser panel is visible, Rust calls add_tab_to_main_browser /
  // close_active_tab_in_main_browser directly instead of emitting
  // native-command. Cmd+R / Cmd+L are NOT in the custom macOS menu, so
  // DOM keydown fires normally.
  useEffect(() => {
    if (hidden) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        refreshTab();
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        const input = addressInputRef.current;
        if (input) {
          input.focus();
          input.select();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refreshTab, hidden]);

  const handleAddressKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (handleNativeSelectAll(e)) return;
      if (e.key === "Enter") {
        navigateToUrl(addressBarUrl);
      } else if (e.key === "Escape") {
        const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
        const url = activeTab?.url ?? "";
        setAddressBarUrl(url === "about:blank" ? "" : url);
        addressInputRef.current?.blur();
      }
    },
    [addressBarUrl, navigateToUrl, state.tabs, state.activeTabId],
  );

  const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
  const isLoading = activeTab?.loading ?? false;

  // -- Render --

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden bg-[var(--vscode-editor-background)]">
      {/* -- Address bar + toolbar (top, solid) -- */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0 bg-[var(--vscode-sideBar-background)] border-b border-[var(--vscode-widget-border,#E5E5E5)]">
        <input
          ref={addressInputRef}
          type="text"
          className="flex-1 px-2 py-1 text-[13px] rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] outline-none focus:border-[var(--vscode-focusBorder)] transition-colors"
          value={addressBarUrl}
          onChange={(e) => setAddressBarUrl(e.target.value)}
          onKeyDown={handleAddressKeyDown}
          placeholder={t("linkPreview.urlPlaceholder")}
          onFocus={(e) => e.target.select()}
          spellCheck={false}
        />

        {isLoading && (
          <Loader2
            size={14}
            className="text-[var(--vscode-icon-foreground)] opacity-70 animate-spin"
          />
        )}

        <button
          type="button"
          className="flex items-center justify-center p-1 rounded bg-transparent text-[var(--vscode-icon-foreground)] opacity-70 cursor-pointer hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)] transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={refreshTab}
          disabled={!activeTab}
          title={t("linkPreview.refresh")}
        >
          <RefreshCw size={14} />
        </button>

        <button
          type="button"
          className="flex items-center justify-center p-1 rounded bg-transparent text-[var(--vscode-icon-foreground)] opacity-70 cursor-pointer hover:opacity-100 hover:bg-[var(--vscode-list-hoverBackground)] transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={openInBrowser}
          disabled={!activeTab}
          title={t("linkPreview.openBrowser")}
        >
          <ExternalLink size={14} />
        </button>
      </div>

      {/* -- Webview area (fills the rest) -- */}
      {/* The container div (bg-white) fills this area. BrowserTabs renders
          the floating TabBar (absolute, z-20) at the top or bottom based on
          the global tabBarPosition setting. The ResizeObserver reserves
          TAB_BAR_OVERLAY_HEIGHT on the TabBar's side so the native webview
          never covers it -- the container's white background shows through
          behind the TabBar, making it look like it floats over the webview
          content. */}
      <div className="flex-1 min-h-0 relative">
        {/* Container -- white background fills the area behind the TabBar.
            ResizeObserver measures this element and reserves the overlay
            height so the native webview stays clear of the TabBar. */}
        <div ref={containerRef} className="absolute inset-0 bg-white">
          {state.tabs.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--vscode-editor-background)]">
              <button
                onClick={addNewTab}
                className="px-4 py-2 rounded-md bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:opacity-90 transition-opacity text-sm"
              >
                {t("linkPreview.newTab")}
              </button>
            </div>
          )}
        </div>

        {/* Floating TabBar (rendered by BrowserTabs). Position (top/bottom)
            follows the global tabBarPosition setting. */}
        {state.tabs.length > 0 && (
          <BrowserTabs tabs={state.tabs} activeTabId={state.activeTabId} />
        )}
      </div>
    </div>
  );
}
