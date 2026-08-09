/**
 * BrowserSidebar - vertical, collapsible tab sidebar for the inline
 * browser panel.
 *
 * Replaces the horizontal `BrowserTabs` strip. Lives in the main window's
 * React DOM as a flex sibling of the content webview area.  When expanded
 * overlaps the native child webview - no z-order issue, no overlay
 * webview, no `set_focus` dance. The content webview's rect (reported by
 * `BrowserPanel` which observes the sidebar element).  This keeps the
 * BrowserStartPage (React DOM) perfectly still while the sidebar floats
 * above it with a drop-shadow.
 *
 * Layout:
 *   ┌──────┬─────────────────────────────────┐
 *   │ [F]  │                                 │
 *   │ [F]● │   Native content webview        │
 *   │ [F]  │   (positioned by Rust to fit)   │
 *   │  +   │                                 │
 *   └──────┴─────────────────────────────────┘
 *    sidebar   flex-1 content area (containerRef)
 *
 * Behaviour:
 *   - Collapsed (default): 44px wide, favicons only + active indicator
 *     bar on the left edge.
 *   - Expanded (hover): 208px wide, favicon + title + close (×) button.
 *     Width is CSS-transitioned (180ms ease-out).
 *   - Click tab -> switch; hover tab -> reveal ×; right-click -> context
 *     menu (Refresh / Open in browser / Close).
 *   - `+` at the bottom -> new about:blank tab.
 *
 * Actions go through the IPC layer with the `"main"` window
 * label, same as `BrowserTabs`.
 */

import { forwardRef, useCallback, useEffect, useState } from "react";
import { Loader2, Globe, Plus, X } from "lucide-react";
import { useI18n } from "../../lib/core/i18n";
import { ipc } from "../../lib/core/ipc";
import type { LinkPreviewTabInfo } from "../../types/browser";
import { getFaviconUrl } from "../../store/browserSlice";
import { useStore } from "../../store/useStore";
import { useSidebarHover } from "../hooks/useSidebarHover";
import { BrowserTabContextMenu } from "./BrowserTabContextMenu";

/** Browser window label - must match BrowserTabs.tsx / browserSlice.ts. */
const BROWSER_WINDOW_LABEL = "main";

/** Collapsed sidebar width (favicons only). */
export const COLLAPSED_WIDTH = 44;
/** Expanded sidebar width (favicon + title + close). */
export const EXPANDED_WIDTH = 208;

export interface BrowserSidebarProps {
  tabs: LinkPreviewTabInfo[];
  activeTabId: string | null;
}

const BrowserSidebar = forwardRef<HTMLDivElement, BrowserSidebarProps>(
  function BrowserSidebar({ tabs, activeTabId }, ref) {
    const { t } = useI18n();
    const leftPanelHovered = useStore((s) => s.leftPanelHovered);
    const [contextMenu, setContextMenu] = useState<{
      x: number;
      y: number;
      tabId: string;
    } | null>(null);

    // ── Actions (IPC, scoped to the main window's tab manager) ──

    const switchTab = useCallback((tabId: string) => {
      ipc.switchLinkPreviewTab(BROWSER_WINDOW_LABEL, tabId).catch(console.error);
    }, []);

    const closeTab = useCallback((tabId: string) => {
      ipc.closeLinkPreviewTab(BROWSER_WINDOW_LABEL, tabId).catch(console.error);
    }, []);

    const addNewTab = useCallback(() => {
      ipc.addLinkPreviewTab(BROWSER_WINDOW_LABEL, "about:blank").catch(console.error);
    }, []);

    // ── Hover expand / collapse (shared hook) ──

    const {
      hoverExpanded: expanded,
      handleHoverEnter,
      handleHoverLeave,
    } = useSidebarHover({
      leftPanelHovered,
    });

    // ── Context menu ──

    const openContextMenu = useCallback(
      (e: React.MouseEvent, tabId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, tabId });
      },
      [],
    );

    // Click-away / Esc to dismiss the context menu.
    useEffect(() => {
      if (!contextMenu) return;
      const onClickAway = () => setContextMenu(null);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setContextMenu(null);
      };
      // Defer adding the listener so the same click that opened the menu
      // doesn't immediately close it.
      const id = requestAnimationFrame(() => {
        window.addEventListener("click", onClickAway);
        window.addEventListener("keydown", onKey);
      });
      return () => {
        cancelAnimationFrame(id);
        window.removeEventListener("click", onClickAway);
        window.removeEventListener("keydown", onKey);
      };
    }, [contextMenu]);

    if (tabs.length === 0) return null;

    const width = expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH;
    const overlayShift = EXPANDED_WIDTH - COLLAPSED_WIDTH;

    return (
      <>
        <div
          ref={ref}
          data-sidebar-root
          className="shrink-0 h-full flex flex-col border-r border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)] overflow-hidden select-none z-30 relative"
          style={{
            width,
            marginRight: expanded ? -overlayShift : 0,
            transition:
              "width 180ms ease-out, margin-right 180ms ease-out, box-shadow 180ms ease-out",
            boxShadow: expanded
              ? "4px 0 12px rgba(0,0,0,0.3)"
              : "4px 0 12px rgba(0,0,0,0)",
          }}
          onMouseEnter={handleHoverEnter}
          onMouseLeave={handleHoverLeave}
        >
          {/* ── Tab list ── */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              const isBlank = !tab.url || tab.url === "about:blank";
              const favicon = isBlank ? undefined : getFaviconUrl(tab.url);
              const title = isBlank
                ? t("linkPreview.newTab")
                : tab.title || tab.url || t("linkPreview.newTab");

              return (
                <div
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  onContextMenu={(e) => openContextMenu(e, tab.id)}
                  title={expanded ? undefined : title}
                  className={`group relative flex items-center gap-2.5 mx-1.5 my-0.5 px-2 h-9 rounded-md cursor-pointer transition-colors duration-100 ${
                    isActive
                      ? "bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]"
                      : "text-[var(--vscode-sideBar-foreground)] hover:text-[var(--vscode-foreground)]"
                  }`}
                >
                  {/* Favicon / loading spinner / globe fallback */}
                  <span className="shrink-0 w-4 h-4 flex items-center justify-center">
                    {tab.loading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : favicon ? (
                      <>
                        <img
                          src={favicon}
                          alt=""
                          className="w-4 h-4 rounded-sm"
                          draggable={false}
                          onError={(e) => {
                            const el = e.currentTarget;
                            el.style.display = "none";
                            el.nextElementSibling?.classList.remove("hidden");
                          }}
                        />
                        <Globe size={14} className="hidden opacity-60" />
                      </>
                    ) : (
                      <Globe size={14} className="opacity-60" />
                    )}
                  </span>

                  {/* Title (only when expanded) */}
                  {expanded && (
                    <span className="flex-1 min-w-0 truncate text-[12px] font-medium">
                      {title}
                    </span>
                  )}

                  {/* Close button (expanded only) */}
                  {expanded && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      className="shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all duration-100 hover:bg-[rgba(255,255,255,0.15)] opacity-60 hover:opacity-100"
                      title={t("linkPreview.closeTab")}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}

            {/* ── New tab button (follows last tab) ── */}
            <div className="px-1.5 pb-1 pt-1">
              <button
                onClick={addNewTab}
                className="flex items-center gap-2.5 w-full h-9 px-2 rounded-md text-[var(--vscode-sideBar-foreground)] hover:text-[var(--vscode-foreground)] transition-colors duration-100 cursor-pointer"
                title={t("linkPreview.newTab")}
              >
                <Plus size={16} className="shrink-0" />
                {expanded && (
                  <span className="text-[12px] font-medium">
                    {t("linkPreview.newTab")}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── Context menu ── */}
        {contextMenu && (
          <BrowserTabContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            tab={tabs.find((tb) => tb.id === contextMenu.tabId)}
            onRefresh={(tabId) => {
              ipc
                .refreshLinkPreviewTab(BROWSER_WINDOW_LABEL, tabId)
                .catch(console.error);
              setContextMenu(null);
            }}
            onOpenInBrowser={(url) => {
              ipc.openUrlInBrowser(url).catch(console.error);
              setContextMenu(null);
            }}
            onClose={(tabId) => {
              closeTab(tabId);
              setContextMenu(null);
            }}
          />
        )}
      </>
    );
  },
);

export default BrowserSidebar;
