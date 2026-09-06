/**
 * BrowserSmartIsland — the browser panel's address bar in the title bar,
 * following the document sidebar's hover-expand design language.
 *
 * Layout: the title bar strip takes REAL space (the page view starts below
 * it — see BrowserPanel's reported rect), so the bar never collides with a
 * site's own header.
 *
 * States:
 *   - Collapsed: favicon + domain pill, centered.
 *   - Expanded (hover / focused input / pinned / new-tab): full address bar
 *     (BrowserDynamicIsland) + a Pin toggle at the right edge.
 *
 * Hover source: the title bar is an app-region drag area, which swallows DOM
 * mouse events, so hover state comes from main.ts's cursor poll
 * (`browser-panel:strip-hover`) instead of onMouseEnter. Timing mirrors
 * useSidebarHover: expand immediately, collapse after a 180ms grace delay,
 * collapse on window blur.
 */

import { useEffect, useRef, useState } from "react";
import { Globe, Pin } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import BrowserDynamicIsland from "./BrowserDynamicIsland";
import { useI18n } from "../../lib/core/i18n";
import { useStore } from "../../store/useStore";
import { getFaviconUrl } from "../../store/browserSlice";
import type { LinkPreviewTabInfo } from "../../types/browser";

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
      className="no-drag h-7 px-2.5 rounded-md flex items-center gap-1.5 border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)]"
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

export default function BrowserSmartIsland() {
  const { t } = useI18n();
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

  // Hover from the main-process cursor poll (drag regions swallow DOM mouse
  // events). Enter expands immediately; leave collapses after the sidebar's
  // 180ms grace delay (crossing between the strip and the pill must not
  // flicker). Window blur collapses immediately.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<boolean>("browser-panel:strip-hover", (e) => {
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

  useEffect(() => {
    const collapseNow = () => setStripHover(false);
    window.addEventListener("blur", collapseNow);
    return () => window.removeEventListener("blur", collapseNow);
  }, []);

  return (
    <div className="relative h-9 w-full flex items-center justify-center">
      {expanded ? (
        <div
          className="jstudio-chromebar-in w-full flex items-center justify-between px-3"
          data-tauri-drag-region
        >
          {/* Left: surrendered to the native traffic lights. */}
          <div className="w-[72px]" data-tauri-drag-region />

          {/* Center: address bar + refresh / external buttons. The island
              root opts out of the drag region itself. */}
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

      {/* Pin — same accent story as the outline pin: locks the bar open. */}
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
