/**
 * BrowserChromeWindowApp — the native chrome overlay for the inline browser
 * panel (window=browser-chrome, hosted in the MAIN window).
 *
 * The panel's page views are native WebContentsView children that cover ALL
 * React DOM of the main window, so once a page is loaded the React title bar
 * (and its address capsule) is invisible under them. This component instead
 * lives in a transparent WebContentsView stacked ABOVE the page views,
 * covering only the 36px title-bar strip (DocumentPanel-style full-bleed:
 * the page rect starts at the window top — see BrowserPanel's reported rect).
 *
 * Design — mirrors the document sidebar's hover-expand language
 * (useSidebarHover): flat theme tokens, hover expands immediately, collapse
 * after a 180ms grace delay, focus/pin holds it open, 180ms ease-out reveal.
 * New-tab / blank keeps the full bar — the input is the primary affordance
 * there.
 *
 * Hover source: the strip is an app-region drag area, which swallows DOM
 * mouse events, so hover state comes from main.ts's cursor poll
 * (`browser-chrome:strip-hover`) instead of onMouseEnter.
 *
 * Feeds: the store's browserSlice is driven by `link-preview:tabs-updated`
 * events for label "main" (the overlay is not a BrowserWindow, so main.ts
 * forwards those to it directly) + one initial state fetch on mount.
 */

import { useEffect, useRef, useState } from "react";
import { Globe, Pin } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import BrowserDynamicIsland from "../layout/BrowserDynamicIsland";
import { useI18n } from "../../lib/core/i18n";
import { ipc } from "../../lib/core/ipc";
import { useStore } from "../../store/useStore";
import { getFaviconUrl } from "../../store/browserSlice";
import type { LinkPreviewTabInfo, LinkPreviewTabsState } from "../../types/browser";

function isBlankUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u === "" || u === "about:blank";
}

/** Collapsed idle pill: favicon + domain in flat sidebar tokens. */
function CollapsedCapsule({ tab }: { tab: LinkPreviewTabInfo }) {
  const [favFailed, setFavFailed] = useState(false);
  let host = tab.url;
  try {
    host = new URL(tab.url).hostname.replace(/^www\./, "");
  } catch {
    /* keep raw url */
  }
  const fav = getFaviconUrl(tab.url);

  return (
    <div
      data-tauri-drag-region={false}
      title={tab.url}
      className="no-drag h-7 px-2.5 rounded-md flex items-center gap-1.5 border border-[var(--vscode-input-border)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_78%,transparent)] backdrop-blur-sm"
    >
      {fav && !favFailed ? (
        <img
          src={fav}
          alt=""
          className="w-3.5 h-3.5 rounded-sm"
          draggable={false}
          onError={() => setFavFailed(true)}
        />
      ) : (
        <Globe className="w-3.5 h-3.5 text-[var(--vscode-descriptionForeground)]" />
      )}
      <span className="max-w-[200px] truncate text-xs text-[var(--vscode-descriptionForeground)]">
        {host}
      </span>
    </div>
  );
}

export default function BrowserChromeWindowApp() {
  const { t } = useI18n();
  const setBrowserTabsState = useStore((s) => s.setBrowserTabsState);
  const browserTabs = useStore((s) => s.browserTabs);
  const browserActiveTabId = useStore((s) => s.browserActiveTabId);
  const [stripHover, setStripHover] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTab = browserTabs.find((tb) => tb.id === browserActiveTabId);
  // Immersive only when a real page is open; new-tab / blank keeps the full
  // bar (the input is the primary affordance there).
  const immersive = !!activeTab && !isBlankUrl(activeTab.url);
  const expanded = pinned || inputFocused || stripHover || !immersive;

  // Hover from the main-process cursor poll. Enter expands immediately;
  // leave collapses after the sidebar's 180ms grace delay (crossing between
  // the strip and the pill must not flicker).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<boolean>("browser-chrome:strip-hover", (e) => {
      if (e.payload) {
        if (collapseTimer.current) {
          clearTimeout(collapseTimer.current);
          collapseTimer.current = null;
        }
        setStripHover(true);
      } else if (collapseTimer.current === null) {
        collapseTimer.current = setTimeout(() => {
          collapseTimer.current = null;
          setStripHover(false);
        }, 180);
      }
    }).then((f) => {
      if (disposed) f();
      else unlisten = f;
    });
    return () => {
      disposed = true;
      unlisten?.();
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, []);

  // Only the inline panel's tab state drives this bar — standalone
  // link-preview windows broadcast with their own labels and are ignored.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<LinkPreviewTabsState>("link-preview:tabs-updated", (e) => {
      if (e.label !== "main") return;
      setBrowserTabsState(e.payload);
    }).then((f) => {
      if (disposed) f();
      else unlisten = f;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [setBrowserTabsState]);

  // Initial state (the panel may already have tabs from a previous show).
  useEffect(() => {
    ipc
      .getBrowserPanelTabsState()
      .then((state) => setBrowserTabsState(state))
      .catch(() => {});
  }, [setBrowserTabsState]);

  return (
    <div
      className="relative h-9 w-full flex items-center justify-center select-none"
      data-tauri-drag-region
      style={{ background: "transparent" }}
    >
      {expanded ? (
        <div
          className="jstudio-chromebar-in w-full flex items-center justify-between px-3"
          data-tauri-drag-region
        >
          {/* Left: surrendered to the native traffic lights (drawn above this
              view by the OS) — keep the drag region clear of them. */}
          <div className="w-[72px]" data-tauri-drag-region />

          {/* Center: the floating address bar + refresh / external icons.
              The pill itself opts out of the drag region (island root sets
              data-tauri-drag-region={false}). */}
          <div className="flex-1 flex items-center" data-tauri-drag-region>
            <BrowserDynamicIsland onInputFocusChange={setInputFocused} />
          </div>

          <div className="w-4" data-tauri-drag-region />
        </div>
      ) : (
        activeTab && (
          <div className="jstudio-chromebar-in">
            <CollapsedCapsule tab={activeTab} />
          </div>
        )
      )}

      {/* Pin — same accent story as the outline pin: locks the bar open.
          Only meaningful while expanded. */}
      {expanded && immersive && (
        <button
          type="button"
          title={pinned ? t("browser.unpinBar") : t("browser.pinBar")}
          onClick={() => setPinned((p) => !p)}
          className={`no-drag absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors duration-150 cursor-pointer ${
            pinned
              ? "text-[var(--vscode-focusBorder)] hover:bg-[var(--vscode-list-hoverBackground)]"
              : "text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
          }`}
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
