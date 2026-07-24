/**
 * BrowserPanel — inline browser panel embedded in the main window.
 *
 * This panel reuses the same Rust `TabManager` infrastructure as the
 * standalone link-preview window (`link_tabs.rs`), but registered under
 * the window label `"main"`. Native child webviews are attached to the
 * main window and positioned on top of the React UI using a rect
 * reported by `ResizeObserver`.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────┐
 *   │  [Tab1] [Tab2] [+]   (floating glass TabBar)      │  ← TabBar area (52px)
 *   ├──────────────────────────────────────────────────┤
 *   │  [https://example.com      ] 🔄 ↗   address bar   │  ← address bar (~36px)
 *   ├──────────────────────────────────────────────────┤
 *   │                                                    │
 *   │  Native content webview (positioned by Rust at     │  ← webview container (flex-1)
 *   │  the rect reported by ResizeObserver)              │     ResizeObserver reports this rect
 *   │                                                    │
 *   └──────────────────────────────────────────────────┘
 *
 * Lifecycle (mount-once + CSS-hide, same pattern as AgentChatPanel):
 *   - `hidden` false → `showBrowserPanel()` + start ResizeObserver
 *   - `hidden` true  → `hideBrowserPanel()` (webviews moved off-screen,
 *     tabs preserved so the user can return with their session intact)
 *
 * Keyboard:
 *   Cmd+T / Cmd+W — handled Rust-side in `on_menu_event` (routes to
 *     `add_tab_to_main_browser` / `close_active_tab_in_main_browser`
 *     when `is_browser_panel_visible()` is true).
 *   Cmd+R / Cmd+L — DOM keydown (not in the custom macOS menu).
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { X, Loader2, ExternalLink, RefreshCw, Globe } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "../../store/useStore";
import { useI18n } from "../../lib/core/i18n";
import {
  storage,
  type LinkPreviewTabsState,
  type BrowserPanelRect,
} from "../../lib/core/storage";
import TabBar, { type TabItem } from "../ui/TabBar";
import { MenuList, MenuItem, MenuDivider } from "../ui/MenuList";
import { handleNativeSelectAll } from "../../lib/shortcuts/nativeSelectAll";

/// Window label used by the Rust backend to key the main window's tab manager.
const WINDOW_LABEL = "main";

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

  // ── Lifecycle: show / hide the browser panel ──────────────────────
  // Tell Rust to mark the panel visible (so Cmd+T/Cmd+W route here) and
  // add a fresh about:blank tab if none exist. On hide, move all content
  // webviews off-screen — tabs are preserved for the next show.
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

  // ── Listen for tab state updates from Rust ────────────────────────
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

  // ── Listen for "last tab closed" → switch to documents view ───────
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

  // ── ResizeObserver: report webview container rect to Rust ─────────
  // Rust positions native child webviews at this rect. The observer
  // fires when the sidebar opens/closes, the window resizes, or the
  // panel becomes visible — keeping the webviews aligned with the
  // React-rendered container.
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

    // Report immediately so the webview is positioned without waiting
    // for the first ResizeObserver callback.
    updateRect();
    const observer = new ResizeObserver(updateRect);
    observer.observe(container);
    return () => observer.disconnect();
  }, [hidden]);

  // ── Sync address bar to the active tab's URL ──────────────────────
  useEffect(() => {
    const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
    const url = activeTab?.url ?? "";
    setAddressBarUrl(url === "about:blank" ? "" : url);
  }, [state.activeTabId, state.tabs]);

  // ── Auto-focus address bar on new tab (about:blank) ───────────────
  useEffect(() => {
    if (hidden) return;
    const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
    if (activeTab?.url === "about:blank") {
      requestAnimationFrame(() => addressInputRef.current?.focus());
    }
  }, [state.activeTabId, state.tabs, hidden]);

  // ── Actions ────────────────────────────────────────────────────────

  const switchTab = useCallback((tabId: string) => {
    storage.switchLinkPreviewTab(WINDOW_LABEL, tabId).catch(console.error);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    storage.closeLinkPreviewTab(WINDOW_LABEL, tabId).catch(console.error);
  }, []);

  const addNewTab = useCallback(() => {
    storage.addLinkPreviewTab(WINDOW_LABEL, "about:blank").catch(console.error);
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
          .navigateLinkPreviewTab(WINDOW_LABEL, activeTab.id, normalizedUrl)
          .catch(console.error);
      } else {
        storage
          .addLinkPreviewTab(WINDOW_LABEL, normalizedUrl)
          .catch(console.error);
      }
    },
    [state.tabs, state.activeTabId],
  );

  const refreshTab = useCallback(() => {
    const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
    if (activeTab) {
      storage
        .refreshLinkPreviewTab(WINDOW_LABEL, activeTab.id)
        .catch(console.error);
    }
  }, [state.tabs, state.activeTabId]);

  const openInBrowser = useCallback(() => {
    const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
    if (activeTab) {
      storage.openUrlInBrowser(activeTab.url).catch(console.error);
    }
  }, [state.tabs, state.activeTabId]);

  // ── Keyboard shortcuts (Cmd+R, Cmd+L) ─────────────────────────────
  // Cmd+T / Cmd+W are handled Rust-side in on_menu_event — when the
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

  // ── Map TabInfo → TabItem (for shared TabBar component) ────────────

  const tabItems: TabItem[] = state.tabs.map((tab) => ({
    id: tab.id,
    title:
      tab.url === "about:blank" ? "New Tab" : tab.title || tab.url || "New Tab",
    isActive: tab.id === state.activeTabId,
    icon: tab.loading ? (
      <Loader2 size={14} className="animate-spin" />
    ) : (
      <Globe size={14} />
    ),
    canClose: state.tabs.length > 1,
    canDrag: state.tabs.length > 1,
  }));

  // ── Context menu renderer ──────────────────────────────────────────

  const renderContextMenu = useCallback(
    (tabId: string, x: number, y: number, close: () => void) => {
      const tab = state.tabs.find((tb) => tb.id === tabId);
      return (
        <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
          <MenuItem
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={() => {
              storage
                .refreshLinkPreviewTab(WINDOW_LABEL, tabId)
                .catch(console.error);
              close();
            }}
          >
            {t("linkPreview.refresh")}
          </MenuItem>

          <MenuItem
            icon={<ExternalLink className="w-4 h-4" />}
            onClick={() => {
              if (tab) {
                storage.openUrlInBrowser(tab.url).catch(console.error);
              }
              close();
            }}
          >
            {t("linkPreview.openBrowser")}
          </MenuItem>

          {state.tabs.length > 1 && <MenuDivider />}

          {state.tabs.length > 1 && (
            <MenuItem
              variant="danger"
              icon={<X className="w-4 h-4" />}
              onClick={() => {
                closeTab(tabId);
                close();
              }}
            >
              {t("linkPreview.closeTab")}
            </MenuItem>
          )}
        </MenuList>
      );
    },
    [state.tabs, closeTab, t],
  );

  const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
  const isLoading = activeTab?.loading ?? false;

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden bg-[var(--vscode-editor-background)]">
      {/* ── TabBar area (fixed height — TabBar floats within) ── */}
      {/* The content webview is positioned below this area (via the
          ResizeObserver rect), so the floating TabBar is never covered
          by the native webview. */}
      <div className="relative h-[52px] shrink-0">
        {tabItems.length > 0 && (
          <TabBar
            tabs={tabItems}
            activeTabId={state.activeTabId}
            onTabClick={switchTab}
            onTabClose={closeTab}
            onNew={addNewTab}
            renderContextMenu={renderContextMenu}
            rippleColor="rgba(255,255,255,0.2)"
            glassOpacity={0.08}
            position="top"
          />
        )}
      </div>

      {/* ── Address bar + toolbar ── */}
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

      {/* ── Webview container ── */}
      {/* Rust positions native child webviews at this div's rect.
          ResizeObserver reports getBoundingClientRect() to Rust so
          webviews stay aligned as the sidebar/window resizes. */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative bg-white"
      >
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
    </div>
  );
}
