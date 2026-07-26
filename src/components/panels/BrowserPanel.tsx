/**
 * BrowserPanel - inline browser panel embedded in the main window.
 *
 * This panel reuses the same Rust `TabManager` infrastructure as the
 * standalone link-preview window (`link_tabs.rs`), but registered under
 * the window label `"main"`. Native child webviews are attached to the
 * main window and positioned on top of the React UI using a rect
 * reported by `ResizeObserver`.
 *
 * Layout (inline tab bar reserves space, content webview fills the rest):
 *   +----------------------------------------------------+
 *   |  [Tab1] [Tab2] [+]                        (tab bar)  |
 *   +----------------------------------------------------+
 *   |  Native content webview (fills remaining area)      |
 *   |                                                     |
 *   +----------------------------------------------------+
 *
 * The tab bar is rendered inline in the main window's React DOM (not in
 * a separate overlay webview). The content webview's rect excludes the
 * tab bar strip, so the two never overlap. This avoids the flicker that
 * the previous overlay approach caused: Tauri child webviews stack by
 * add-order, so every new content webview buried the overlay, forcing a
 * close+re-add cycle that briefly hid the tab bar.
 *
 * The address bar / toolbar (search engine, URL input, refresh,
 * open-external) lives in the title bar's `BrowserDynamicIsland`, which
 * is driven by the same `browserSlice` store this panel feeds. We do NOT
 * render a second address bar here.
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
 *   Cmd+R -- DOM keydown (not in the custom macOS menu); refreshes the
 *     active tab. (Cmd+L focuses the title-bar address bar, handled by
 *     `BrowserDynamicIsland`.)
 */

import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "../../store/useStore";
import {
  storage,
  type LinkPreviewTabsState,
  type BrowserPanelRect,
} from "../../lib/core/storage";
import { TAB_BAR_OVERLAY_HEIGHT } from "../ui/TabBar";
import BrowserTabs from "./BrowserTabs";
import BrowserStartPage from "./BrowserStartPage";

export default function BrowserPanel({ hidden }: { hidden?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabBarPosition = useStore((s) => s.tabBarPosition);
  const browserTabs = useStore((s) => s.browserTabs);
  const browserActiveTabId = useStore((s) => s.browserActiveTabId);
  const refreshBrowserTab = useStore((s) => s.refreshBrowserTab);

  // Show the Chrome-style start page when there are no tabs at all, or when
  // the active tab is still on `about:blank` (a freshly opened tab). Rust
  // parks the blank native webview off-screen in that case, so the React
  // start page underneath is visible.
  const activeTab = browserTabs.find((t) => t.id === browserActiveTabId);
  const showStartPage =
    browserTabs.length === 0 ||
    !browserActiveTabId ||
    !activeTab ||
    activeTab.url.trim() === "" ||
    activeTab.url.trim().toLowerCase() === "about:blank";

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
    // from a previous show/hide cycle) and feed the shared browserSlice so
    // the title-bar address bar reflects the live tabs.
    storage
      .getBrowserPanelTabsState()
      .then((state) => useStore.getState().setBrowserTabsState(state))
      .catch(console.error);
  }, [hidden]);

  // -- Listen for tab state updates from Rust --
  // Rust emits `link-preview:tabs-updated` scoped to the "main" window
  // via `emit_to`. We forward every update into the shared `browserSlice`
  // store so the title-bar `BrowserDynamicIsland` (address bar, refresh,
  // open-external) stays in sync with the active tab. This panel no longer
  // keeps its own copy of the tab state.
  useEffect(() => {
    if (hidden) return;
    const unlisten = listen<LinkPreviewTabsState>(
      "link-preview:tabs-updated",
      (event) => {
        useStore.getState().setBrowserTabsState(event.payload);
      },
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, [hidden]);

  // -- Listen for "last tab closed" --
  // Rust emits `browser-panel:empty` when the last browser tab closes.
  // We no longer bounce the user back to the documents view -- the panel
  // instead falls through to the Chrome-style start page (rendered below
  // whenever `browserTabs.length === 0`). The listener is kept only so the
  // event has a consumer and the tab-state sync (which already received an
  // empty `tabs` array via `link-preview:tabs-updated`) drives the UI.

  // -- ResizeObserver: report webview container rect to Rust --
  // Rust positions native child webviews at this rect. The observer
  // fires when the sidebar opens/closes, the window resizes, or the
  // panel becomes visible -- keeping the webviews aligned with the
  // React-rendered container.
  //
  // The content webview fills the content area, which excludes the
  // inline tab bar strip (TAB_BAR_OVERLAY_HEIGHT tall, at the top or
  // bottom depending on `tabBarPosition`). The tab bar itself is
  // rendered in the main window's React DOM -- no separate overlay
  // webview is needed.
  useEffect(() => {
    if (hidden) return;
    const container = containerRef.current;
    if (!container) return;

    const updateRect = () => {
      const rect = container.getBoundingClientRect();
      // Skip zero-size rects (panel hidden during layout transitions).
      if (rect.width === 0 || rect.height === 0) return;

      const browserRect: BrowserPanelRect = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
      storage.updateBrowserPanelRect(browserRect).catch(console.error);
    };

    // Report immediately so the webviews are positioned without waiting
    // for the first ResizeObserver callback.
    updateRect();
    const observer = new ResizeObserver(updateRect);
    observer.observe(container);
    return () => observer.disconnect();
  }, [hidden, browserTabs.length, tabBarPosition]);

  // -- Keyboard: Cmd+R refreshes the active tab --
  // Cmd+L (focus address bar) is handled by BrowserDynamicIsland in the
  // title bar. Cmd+T / Cmd+W are routed Rust-side in on_menu_event.
  useEffect(() => {
    if (hidden) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        refreshBrowserTab();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hidden, refreshBrowserTab]);

  // -- Render --

  const hasTabs = browserTabs.length > 0;
  const isTop = tabBarPosition === "top";

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden bg-[var(--vscode-editor-background)]">
      {/* -- Inline tab bar (top position) -- */}
      {hasTabs && isTop && (
        <div
          className="shrink-0 relative"
          style={{ height: TAB_BAR_OVERLAY_HEIGHT }}
        >
          <BrowserTabs
            tabs={browserTabs}
            activeTabId={browserActiveTabId}
          />
        </div>
      )}

      {/* -- Webview area (fills the remaining space) -- */}
      {/* The container div fills the area NOT taken by the tab bar.
          Rust positions the native content webview at this rect.
          The address bar / toolbar lives in the title bar's
          BrowserDynamicIsland. */}
      <div className="flex-1 min-h-0 relative">
        <div ref={containerRef} className="absolute inset-0 bg-white">
          {showStartPage && <BrowserStartPage />}
        </div>
      </div>

      {/* -- Inline tab bar (bottom position) -- */}
      {hasTabs && !isTop && (
        <div
          className="shrink-0 relative"
          style={{ height: TAB_BAR_OVERLAY_HEIGHT }}
        >
          <BrowserTabs
            tabs={browserTabs}
            activeTabId={browserActiveTabId}
          />
        </div>
      )}
    </div>
  );
}
