/**
 * BrowserPanel - inline browser panel embedded in the main window.
 *
 * This panel reuses the same Rust `TabManager` infrastructure as the
 * standalone link-preview window (`link_tabs.rs`), but registered under
 * the window label `"main"`. Native child webviews are attached to the
 * main window and positioned on top of the React UI using a rect
 * reported by `ResizeObserver`.
 *
 * Layout (vertical sidebar + content webview side by side):
 *   ┌──────┬─────────────────────────────────────┐
 *   │ [F]  │                                     │
 *   │ [F]● │  Native content webview             │
 *   │ [F]  │  (fills remaining width)            │
 *   │  +   │                                     │
 *   └──────┴─────────────────────────────────────┘
 *    sidebar   flex-1 content area (containerRef)
 *
 * The sidebar (BrowserSidebar.tsx) is a vertical, collapsible tab list
 * rendered in the main window's React DOM. Collapsed it shows only
 * favicons (44px); hovering expands it to 208px with titles + close
 * buttons. Because it's a flex sibling of the content area (not an
 * overlay), it never overlaps the native child webview - no z-order
 * issue, no separate overlay webview, no `set_focus` dance.
 *
 * The native webview's WIDTH is kept constant (always rootWidth minus
 * the collapsed sidebar width) so web content never reflows when the
 * sidebar expands/collapses.  Only the webview's X position shifts to
 * follow the sidebar's right edge; the excess width on the right is
 * clipped by the window.  This eliminates the vertical jitter that
 * occurs when a web page reflows during a width change.
 *
 * History: this panel previously used a horizontal `BrowserTabs` strip
 * that reserved a `shrink-0` row at the top/bottom (content webview
 * filled the rest). Before that, a separate transparent overlay webview
 * was tried and abandoned — Tauri child webviews stack by add-order, so
 * every new content webview buried the overlay, forcing a close+re-add
 * cycle that briefly hid the tab bar. The sidebar layout sidesteps both
 * problems entirely.
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
import { ipc } from "../../lib/core/ipc";
import type { LinkPreviewTabsState, BrowserPanelRect } from "../../types/browser";
import { COLLAPSED_WIDTH } from "./BrowserSidebar";
import BrowserSidebar from "./BrowserSidebar";
import BrowserStartPage from "./BrowserStartPage";

export default function BrowserPanel({ hidden }: { hidden?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
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
      ipc.hideBrowserPanel().catch(console.error);
      return;
    }
    ipc.showBrowserPanel().catch(console.error);
    // Fetch current tabs state (covers the case where tabs were preserved
    // from a previous show/hide cycle) and feed the shared browserSlice so
    // the title-bar address bar reflects the live tabs.
    ipc
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

  // -- ResizeObserver: report webview rect to Rust --
  // Rust positions native child webviews at this rect. The observer
  // fires when the browser panel opens/closes, the window resizes, or
  // the tab sidebar expands/collapses on hover.
  //
  // OVERLAY MODE: The sidebar uses a negative right-margin when expanded
  // (same technique as DocumentSidebar), so the content container never
  // shifts.  We therefore read the sidebar's *actual rendered width* to
  // determine the webview's x position.  The webview's WIDTH stays
  // constant (rootWidth - COLLAPSED_WIDTH) so web content never reflows;
  // only x shifts to follow the sidebar's right edge.
  useEffect(() => {
    if (hidden) return;
    const root = rootRef.current;
    if (!root) return;

    const updateRect = () => {
      const rootRect = root.getBoundingClientRect();
      // Skip zero-size rects (panel hidden during layout transitions).
      if (rootRect.width === 0 || rootRect.height === 0) return;

      // The sidebar overlays the content area (negative margin), so the
      // container's x doesn't change.  Read the sidebar's real width to
      // find where the webview should start.
      const sidebarEl = sidebarRef.current;
      const sidebarWidth = sidebarEl
        ? sidebarEl.getBoundingClientRect().width
        : 0;

      const browserRect: BrowserPanelRect = {
        x: rootRect.x + sidebarWidth,
        // Space-taking chrome: the page starts BELOW the title bar row (the
        // address bar occupies real layout space instead of floating over
        // the page — site headers never collide with it).
        y: rootRect.y,
        // Constant width: webview always thinks it has the collapsed-
        // sidebar space.  Content never reflows; only x shifts.
        width: rootRect.width - COLLAPSED_WIDTH,
        height: rootRect.height,
      };
      ipc.updateBrowserPanelRect(browserRect).catch(console.error);
    };

    // Report immediately so the webviews are positioned without waiting
    // for the first ResizeObserver callback.
    updateRect();
    const observer = new ResizeObserver(updateRect);
    observer.observe(root);
    // Observe the sidebar too, so the webview repositions when the
    // sidebar expands/collapses (its width changes but the root's does
    // not, because the sidebar uses overlay mode).
    if (sidebarRef.current) observer.observe(sidebarRef.current);
    return () => observer.disconnect();
  }, [hidden, browserTabs.length]);

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

  return (
    <div
      ref={rootRef}
      className="w-full h-full flex flex-row relative overflow-hidden bg-[var(--vscode-editor-background)]"
    >
      {/* -- Vertical tab sidebar (collapses to favicons on hover-out) -- */}
      {hasTabs && (
        <BrowserSidebar
          ref={sidebarRef}
          tabs={browserTabs}
          activeTabId={browserActiveTabId}
        />
      )}

      {/* -- Webview area (fills the remaining width) -- */}
      {/* The container div fills the area to the right of the sidebar.
          Rust positions the native content webview at this rect, but
          with a CONSTANT width (rootWidth - COLLAPSED_WIDTH) so the
          web content never reflows.  When the sidebar is expanded the
          webview simply shifts right and its right edge is clipped by
          the window.  The address bar / toolbar lives in the title
          bar's BrowserDynamicIsland. */}
      <div className="flex-1 min-h-0 relative bg-[var(--vscode-sideBar-background)]">
        <div ref={containerRef} className="absolute inset-0">
          {showStartPage && <BrowserStartPage />}
        </div>
      </div>
    </div>
  );
}
