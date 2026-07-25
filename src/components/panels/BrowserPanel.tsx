/**
 * BrowserPanel - inline browser panel embedded in the main window.
 *
 * This panel reuses the same Rust `TabManager` infrastructure as the
 * standalone link-preview window (`link_tabs.rs`), but registered under
 * the window label `"main"`. Native child webviews are attached to the
 * main window and positioned on top of the React UI using a rect
 * reported by `ResizeObserver`.
 *
 * Layout (two native child webviews, content fills the full area):
 *   +----------------------------------------------------+
 *   |  Native content webview (fills the whole area)      |
 *   |   ...   [Tab1] [Tab2] [+]   ...                     |  <- floating tab-bar
 *   |         ^ transparent overlay webview,                  overlay webview,
 *   |           stacked ABOVE the content webview             re-raised above
 *   |                                                          each new tab's
 *   |                                                          content webview
 *   +----------------------------------------------------+
 *
 * The content webview no longer reserves any space for the tab bar --
 * it fills the entire container reported by `ResizeObserver`. The tab
 * bar itself lives in a SEPARATE, transparent child webview (labeled
 * `tabbar-main`, created/positioned by `update_browser_tabbar_rect`) that
 * Rust keeps stacked on top of the content webview, so the tab pill
 * genuinely floats over live page content instead of the content webview
 * vacating a strip for it. Because native child webviews stack by
 * add-order, Rust must re-add the overlay webview every time a new
 * content webview is created (see `add_tab_internal` in `link_tabs.rs`)
 * so it doesn't get buried underneath. The overlay's own React root is
 * `BrowserTabsOverlayApp` (mounted via `index.html?window=browser-tabbar-overlay`),
 * not this component -- this file only reports geometry for it.
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
import BrowserStartPage from "./BrowserStartPage";

export default function BrowserPanel({ hidden }: { hidden?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabBarPosition = useStore((s) => s.tabBarPosition);
  const browserTabs = useStore((s) => s.browserTabs);
  const refreshBrowserTab = useStore((s) => s.refreshBrowserTab);

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
  // The content webview now fills the ENTIRE container -- no reserved
  // strip. The floating tab bar lives in a separate overlay webview
  // (see file header) whose rect we report alongside it, positioned at
  // either the top or bottom edge (TAB_BAR_OVERLAY_HEIGHT tall) depending
  // on the global `tabBarPosition` setting.
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

      if (browserTabs.length > 0) {
        const isTop = tabBarPosition === "top";
        const tabBarRect: BrowserPanelRect = {
          x: rect.x,
          y: isTop ? rect.y : rect.y + rect.height - TAB_BAR_OVERLAY_HEIGHT,
          width: rect.width,
          height: TAB_BAR_OVERLAY_HEIGHT,
        };
        storage.updateBrowserTabBarRect(tabBarRect).catch(console.error);
      }
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

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden bg-[var(--vscode-editor-background)]">
      {/* -- Webview area (fills the whole panel, no address bar) -- */}
      {/* The container div fills the entire area for the native content
          webview. The floating tab bar lives in a separate, transparent
          overlay webview (label "tabbar-main") stacked above this one --
          created/positioned entirely from Rust via update_browser_tabbar_rect,
          driven by the ResizeObserver above. The address bar / toolbar lives
          in the title bar's BrowserDynamicIsland. */}
      <div className="flex-1 min-h-0 relative">
        <div ref={containerRef} className="absolute inset-0 bg-white">
          {browserTabs.length === 0 && <BrowserStartPage />}
        </div>
      </div>
    </div>
  );
}
