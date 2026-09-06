/**
 * BrowserChromeWindowApp — the native chrome overlay for the inline browser
 * panel (window=browser-chrome, hosted in the MAIN window).
 *
 * The panel's page views are native WebContentsView children that cover ALL
 * React DOM of the main window, so once a page is loaded the React title bar
 * (and its address capsule) is invisible under them. This component instead
 * lives in a transparent WebContentsView stacked ABOVE the page views,
 * covering only the 36px title-bar strip: the address capsule + refresh /
 * external buttons float over the full-bleed page content (DocumentPanel-style
 * under-the-bar layout; the page rect starts at the window top — see
 * BrowserPanel's reported rect).
 *
 * Feeds: the store's browserSlice is driven by `link-preview:tabs-updated`
 * events for label "main" (the overlay is not a BrowserWindow, so main.ts
 * forwards those to it directly) + one initial state fetch on mount.
 */

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import BrowserDynamicIsland from "../layout/BrowserDynamicIsland";
import { ipc } from "../../lib/core/ipc";
import { useStore } from "../../store/useStore";
import type { LinkPreviewTabsState } from "../../types/browser";

export default function BrowserChromeWindowApp() {
  const setBrowserTabsState = useStore((s) => s.setBrowserTabsState);

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
      className="h-9 w-full flex items-center justify-between px-3 select-none"
      data-tauri-drag-region
      style={{ background: "transparent" }}
    >
      {/* Left: surrendered to the native traffic lights (drawn above this
          view by the OS) — keep the drag region clear of them. */}
      <div className="w-[72px]" data-tauri-drag-region />

      {/* Center: the floating address capsule + refresh / external icons.
          The pill itself opts out of the drag region (island root sets
          data-tauri-drag-region={false}). */}
      <div className="flex-1 flex items-center" data-tauri-drag-region>
        <BrowserDynamicIsland />
      </div>

      <div className="w-4" data-tauri-drag-region />
    </div>
  );
}
