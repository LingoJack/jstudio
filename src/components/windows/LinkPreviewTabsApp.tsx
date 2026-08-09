/**
 * LinkPreviewTabsApp — link preview window tab strip UI (browser-like).
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────┐
 *   │          ┌─────────────────────────────┐           │
 *   │          │ [Tab1] [Tab2] [+]  (glass)   │           │  ← floating TabBar (top)
 *   │          └─────────────────────────────┘           │
 *   │ [https://example.com        ] 🔄 ↗    address bar  │  ← bottom
 *   └────────────────────────────────────────────────────┘
 *   │  Content Webview (managed by Rust, below this UI)   │
 *
 * UI webview height 90px (floating tab bar ~52px + address bar ~38px).
 * Content webview starts at Y=90, filling the rest.
 *
 * Keyboard shortcuts:
 *   Cmd+T  new tab — handled on the Rust side (on_menu_event) to avoid
 *          the event also reaching the main window's ShortcutManager.
 *   Cmd+W  close tab (close window if last tab) — also Rust-side.
 *   Cmd+R  refresh current tab — DOM keydown (not in macOS menu).
 *   Cmd+L  focus address bar + select all — DOM keydown.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { X, Loader2, ExternalLink, RefreshCw, Globe } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useWindowThemeSync } from "../../lib/windows/useWindowThemeSync";
import { useI18n } from "../../lib/core/i18n";
import { storage } from "../../lib/core/storage";
import type { LinkPreviewTabsState } from "../../types/browser";
import TabBar, { type TabItem } from "../ui/TabBar";
import { MenuList, MenuItem, MenuDivider } from "../ui/MenuList";
import { handleNativeSelectAll } from "../../lib/shortcuts/nativeSelectAll";

// ── Main Component ─────────────────────────────────────────────────────

export default function LinkPreviewTabsApp() {
  // Window label from URL param
  const [windowLabel] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("windowLabel");
  });
  const [state, setState] = useState<LinkPreviewTabsState>({
    tabs: [],
    activeTabId: null,
  });
  const [addressBarUrl, setAddressBarUrl] = useState("");
  const addressInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  // Sync theme with main window (includes app theme colors)
  useWindowThemeSync();

  // Init: fetch tabs state
  useEffect(() => {
    if (!windowLabel) return;
    storage
      .getLinkPreviewTabsState(windowLabel)
      .then(setState)
      .catch(console.error);
  }, [windowLabel]);

  // Listen for Rust-side events — full state synced via tabs-updated
  useEffect(() => {
    if (!windowLabel) return;
    const unlisten = listen<LinkPreviewTabsState>(
      "link-preview:tabs-updated",
      (event) => {
        setState(event.payload);
      },
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, [windowLabel]);

  // Sync address bar to the active tab's URL (about:blank shows empty)
  useEffect(() => {
    const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
    const url = activeTab?.url ?? "";
    setAddressBarUrl(url === "about:blank" ? "" : url);
  }, [state.activeTabId, state.tabs]);

  // Auto-focus address bar on new tab (about:blank)
  useEffect(() => {
    const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
    if (activeTab?.url === "about:blank") {
      requestAnimationFrame(() => addressInputRef.current?.focus());
    }
  }, [state.activeTabId, state.tabs]);

  // ── Actions ───────────────────────────────────────────────────────────

  const switchTab = useCallback(
    (tabId: string) => {
      if (!windowLabel) return;
      storage.switchLinkPreviewTab(windowLabel, tabId).catch(console.error);
    },
    [windowLabel],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      if (!windowLabel) return;
      storage.closeLinkPreviewTab(windowLabel, tabId).catch(console.error);
    },
    [windowLabel],
  );

  const addNewTab = useCallback(() => {
    if (!windowLabel) return;
    storage.addLinkPreviewTab(windowLabel, "about:blank").catch(console.error);
  }, [windowLabel]);

  const navigateToUrl = useCallback(
    (url: string) => {
      if (!url.trim() || !windowLabel) return;

      // URL normalization
      let normalizedUrl = url.trim();
      if (
        !normalizedUrl.startsWith("http://") &&
        !normalizedUrl.startsWith("https://") &&
        !normalizedUrl.startsWith("about:")
      ) {
        // Looks like a domain (contains dot) → add https://; else treat as search
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
          .navigateLinkPreviewTab(windowLabel, activeTab.id, normalizedUrl)
          .catch(console.error);
      } else {
        storage
          .addLinkPreviewTab(windowLabel, normalizedUrl)
          .catch(console.error);
      }
    },
    [windowLabel, state.tabs, state.activeTabId],
  );

  const refreshTab = useCallback(() => {
    if (!windowLabel) return;
    const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
    if (activeTab) {
      storage
        .refreshLinkPreviewTab(windowLabel, activeTab.id)
        .catch(console.error);
    }
  }, [windowLabel, state.tabs, state.activeTabId]);

  const openInBrowser = useCallback(() => {
    const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
    if (activeTab) {
      storage.openUrlInBrowser(activeTab.url).catch(console.error);
    }
  }, [state.tabs, state.activeTabId]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  // Cmd+T (new tab) and Cmd+W (close tab / window) are handled on the Rust
  // side in lib.rs on_menu_event — when the link-preview window is focused,
  // Rust calls add_tab_to_focused_preview / close_active_tab_in_focused_
  // preview directly instead of emitting native-command. This avoids the
  // event also reaching the main window's ShortcutManager (which listens
  // for the same native-command event).
  //
  // Cmd+R / Cmd+L are NOT in the custom macOS menu, so DOM keydown fires
  // normally. We handle them at the window level.

  useEffect(() => {
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
  }, [refreshTab]);

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

  // ── Map TabInfo → TabItem (for shared TabBar component) ───────────────

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

  // ── Context menu renderer ────────────────────────────────────────────

  const renderContextMenu = useCallback(
    (tabId: string, x: number, y: number, close: () => void) => {
      const tab = state.tabs.find((tb) => tb.id === tabId);
      return (
        <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
          <MenuItem
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={() => {
              if (windowLabel) {
                storage
                  .refreshLinkPreviewTab(windowLabel, tabId)
                  .catch(console.error);
              }
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
    [state.tabs, windowLabel, closeTab, t],
  );

  const activeTab = state.tabs.find((tb) => tb.id === state.activeTabId);
  const isLoading = activeTab?.loading ?? false;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="link-preview-root">
      {/* ── Floating TabBar (glassmorphism capsule, top) ── */}
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
          className="!top-0 !bottom-auto !pt-3 !pb-0"
        />
      )}

      {/* ── Address bar + toolbar (bottom) ── */}
      <div className="link-preview-address-bar">
        <input
          ref={addressInputRef}
          type="text"
          className="link-preview-address-input"
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
            className="link-preview-address-loading animate-spin"
          />
        )}

        <button
          type="button"
          className="link-preview-toolbar-btn"
          onClick={refreshTab}
          disabled={!activeTab}
          title={t("linkPreview.refresh")}
        >
          <RefreshCw size={14} />
        </button>

        <button
          type="button"
          className="link-preview-toolbar-btn"
          onClick={openInBrowser}
          disabled={!activeTab}
          title={t("linkPreview.openBrowser")}
        >
          <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
}
