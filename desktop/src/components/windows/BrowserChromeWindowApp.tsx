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
 * Design — smart collapsing capsule (Arc-style):
 *   - On a real page the chrome collapses to a small translucent pill
 *     (favicon + domain) that floats without fighting the site's own header.
 *   - Hovering the strip (or focusing the address input) expands to the full
 *     address bar (BrowserDynamicIsland); leaving collapses again.
 *   - New-tab / blank state keeps the full bar expanded — there is nothing
 *     to immerse in and the input is the primary affordance.
 *
 * Feeds: the store's browserSlice is driven by `link-preview:tabs-updated`
 * events for label "main" (the overlay is not a BrowserWindow, so main.ts
 * forwards those to it directly) + one initial state fetch on mount.
 */

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import BrowserDynamicIsland from "../layout/BrowserDynamicIsland";
import { ipc } from "../../lib/core/ipc";
import { useStore } from "../../store/useStore";
import { getFaviconUrl } from "../../store/browserSlice";
import type { LinkPreviewTabInfo, LinkPreviewTabsState } from "../../types/browser";

function isBlankUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u === "" || u === "about:blank";
}

/** Collapsed idle pill: favicon + domain on dark translucent glass. */
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
      className="no-drag h-7 px-3 rounded-full flex items-center gap-1.5 bg-black/45 backdrop-blur-md text-white text-[11px] shadow-lg"
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
        <Globe className="w-3.5 h-3.5 opacity-80" />
      )}
      <span className="max-w-[180px] truncate opacity-95">{host}</span>
    </div>
  );
}

export default function BrowserChromeWindowApp() {
  const setBrowserTabsState = useStore((s) => s.setBrowserTabsState);
  const browserTabs = useStore((s) => s.browserTabs);
  const browserActiveTabId = useStore((s) => s.browserActiveTabId);
  const [hovering, setHovering] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const activeTab = browserTabs.find((tb) => tb.id === browserActiveTabId);
  // Immersive only when a real page is open; new-tab / blank keeps the full
  // bar (the input is the primary affordance there).
  const immersive = !!activeTab && !isBlankUrl(activeTab.url);
  const expanded = hovering || inputFocused || !immersive;

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
      className="h-9 w-full flex items-center justify-center select-none"
      data-tauri-drag-region
      style={{ background: "transparent" }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {expanded ? (
        <div
          className="w-full flex items-center justify-between px-3"
          data-tauri-drag-region
        >
          {/* Left: surrendered to the native traffic lights (drawn above this
              view by the OS) — keep the drag region clear of them. */}
          <div className="w-[72px]" data-tauri-drag-region />

          {/* Center: the floating address capsule + refresh / external icons.
              The pill itself opts out of the drag region (island root sets
              data-tauri-drag-region={false}). */}
          <div className="flex-1 flex items-center" data-tauri-drag-region>
            <BrowserDynamicIsland onInputFocusChange={setInputFocused} />
          </div>

          <div className="w-4" data-tauri-drag-region />
        </div>
      ) : (
        activeTab && <CollapsedCapsule tab={activeTab} />
      )}
    </div>
  );
}
