/**
 * BrowserPanel - inline browser panel embedded in the main window, laid out
 * Chrome-style:
 *
 *   ┌─────────────────────────────────────┐
 *   │ app title bar (traffic lights, doc  │  ← AppTitleBar; hosts the
 *   │ capsule / browser tab strip)        │    BrowserTabStrip in browser view
 *   ├─────────────────────────────────────┤
 *   │ ← → ⟳  ⌕ address.........  ↗       │  ← BrowserToolbar (real space)
 *   ├─────────────────────────────────────┤
 *   │                                     │
 *   │  Native content webview             │  ← starts BELOW the toolbar,
 *   │  (fills remaining height)           │    so site headers never collide
 *   │                                     │
 *   └─────────────────────────────────────┘
 *
 * Tabs are horizontal (in the title bar) instead of the old vertical
 * favicon sidebar — BrowserSidebar was removed with this layout.
 *
 * The native webview rect is reported to the Electron main process via
 * ResizeObserver: the toolbar row occupies the top TOOLBAR_HEIGHT CSS px of
 * the panel, and the webview fills the rest, so web content is never
 * overlapped by the panel's own chrome.
 *
 * Lifecycle (mount-once + CSS-hide, same pattern as AgentChatPanel):
 *   - `hidden` false -> `showBrowserPanel()` + start ResizeObserver
 *   - `hidden` true  -> `hideBrowserPanel()` (webviews detached, tabs
 *     preserved so the user can return with their session intact)
 *
 * Keyboard:
 *   Cmd+T / Cmd+W -- handled main-side (routes to the inline TabsManager
 *     when it is visible). Cmd+R -- DOM keydown here; refreshes the active
 *     tab.
 */

import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "../../store/useStore";
import { ipc } from "../../lib/core/ipc";
import type { LinkPreviewTabsState, BrowserPanelRect } from "../../types/browser";
import BrowserToolbar from "./BrowserToolbar";
import BrowserStartPage from "./BrowserStartPage";

/** Height of BrowserToolbar (keep in sync with its `h-9` root). */
const TOOLBAR_HEIGHT = 36;

export default function BrowserPanel({ hidden }: { hidden?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const browserTabs = useStore((s) => s.browserTabs);
  const browserActiveTabId = useStore((s) => s.browserActiveTabId);
  const refreshBrowserTab = useStore((s) => s.refreshBrowserTab);

  // Show the start page when there are no tabs at all, or when the active
  // tab is still on `about:blank` (a freshly opened tab). The native
  // webview is parked (detached) in that case, so the React start page
  // underneath is visible.
  const activeTab = browserTabs.find((t) => t.id === browserActiveTabId);
  const showStartPage =
    browserTabs.length === 0 ||
    !browserActiveTabId ||
    !activeTab ||
    activeTab.url.trim() === "" ||
    activeTab.url.trim().toLowerCase() === "about:blank";

  // -- Lifecycle: show / hide the browser panel --
  // Tell the main process to mark the panel visible (so Cmd+T/Cmd+W route
  // here) and add a fresh about:blank tab if none exist. On hide, all
  // content webviews detach -- tabs are preserved for the next show.
  useEffect(() => {
    if (hidden) {
      ipc.hideBrowserPanel().catch(console.error);
      return;
    }
    ipc.showBrowserPanel().catch(console.error);
    // Fetch current tabs state (covers tabs preserved from a previous
    // show/hide cycle) and feed the shared browserSlice so the toolbar
    // reflects the live tabs.
    ipc
      .getBrowserPanelTabsState()
      .then((state) => useStore.getState().setBrowserTabsState(state))
      .catch(console.error);
  }, [hidden]);

  // -- Listen for tab state updates from the main process --
  // `link-preview:tabs-updated` (label "main") carries tabs + navigation
  // availability; forward into the shared browserSlice.
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

  // -- ResizeObserver: report webview rect to the main process --
  // The webview fills the panel area BELOW the toolbar row, so the panel's
  // own chrome takes real space and never overlaps web content.
  useEffect(() => {
    if (hidden) return;
    const root = rootRef.current;
    if (!root) return;

    const updateRect = () => {
      const rootRect = root.getBoundingClientRect();
      // Skip zero-size rects (panel hidden during layout transitions).
      if (rootRect.width === 0 || rootRect.height === 0) return;

      const browserRect: BrowserPanelRect = {
        x: rootRect.x,
        y: rootRect.y + TOOLBAR_HEIGHT,
        width: rootRect.width,
        height: rootRect.height - TOOLBAR_HEIGHT,
      };
      ipc.updateBrowserPanelRect(browserRect).catch(console.error);
    };

    // Report immediately so the webviews are positioned without waiting
    // for the first ResizeObserver callback.
    updateRect();
    const observer = new ResizeObserver(updateRect);
    observer.observe(root);
    return () => observer.disconnect();
  }, [hidden, browserTabs.length]);

  // -- TEMP DEBUG (remove after diagnosis): capture-phase click/mousedown
  //    logger — prints the hit target AND the full element stack under the
  //    cursor, so a transparent overlay / drag-region swallow is visible. --
  useEffect(() => {
    if (hidden) return;
    const dump = (label: string) => (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const stack = document
        .elementsFromPoint(e.clientX, e.clientY)
        .map(
          (el) =>
            el.tagName +
            (el.className ? "." + String(el.className).split(" ")[0] : ""),
        )
        .join(" <- ");
      console.log(
        `[BrowserPanelDebug] ${label}:`,
        t.tagName,
        String(t.className).slice(0, 40),
        `@${e.clientX},${e.clientY}`,
        "| stack:",
        stack,
      );
    };
    const md = dump("mousedown");
    const ck = dump("click");
    window.addEventListener("mousedown", md, true);
    window.addEventListener("click", ck, true);
    return () => {
      window.removeEventListener("mousedown", md, true);
      window.removeEventListener("click", ck, true);
    };
  }, [hidden]);

  // -- Keyboard: Cmd+R refreshes the active tab --
  // Cmd+T / Cmd+W are routed main-side. Cmd+L (focus address bar) is
  // handled by BrowserToolbar's input autoFocus-free flow.
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
    <div
      ref={rootRef}
      className="w-full h-full flex flex-col relative overflow-hidden bg-[var(--vscode-editor-background)]"
    >
      {/* -- Toolbar: back / forward / reload + address input + external -- */}
      <BrowserToolbar />

      {/* -- Webview area (fills the remaining height) -- */}
      <div className="flex-1 min-h-0 relative bg-[var(--vscode-sideBar-background)]">
        <div ref={containerRef} className="absolute inset-0">
          {showStartPage && <BrowserStartPage />}
        </div>
      </div>
    </div>
  );
}
