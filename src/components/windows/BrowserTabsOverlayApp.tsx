/**
 * BrowserTabsOverlayApp — floating tab-bar overlay for the inline browser
 * panel (main window).
 *
 * The inline browser panel's content is a native OS child webview, which
 * always composites in front of the main window's own React DOM — so a
 * tab bar rendered inside BrowserPanel.tsx can never visually float over
 * live page content; it can only reserve space beside it. To get a real
 * floating effect (tab pill on top of the page, like a real browser), the
 * tab bar is hosted in its own *separate* transparent child webview
 * (label `tabbar-main`) stacked above the content webview.
 *
 * This component is that overlay's entire UI: just the floating TabBar,
 * no address bar. Geometry (position/size) is driven entirely from Rust
 * (`update_browser_tabbar_rect`, called from BrowserPanel's ResizeObserver)
 * — this component only renders content, it doesn't measure or position
 * itself.
 *
 * Settings (glassOpacity / position) are loaded once via `loadSettings()`
 * rather than through the zustand store, since this window runs in its
 * own JS realm and the main window's store isn't hydrated here. There is
 * no live cross-window settings sync (same precedent as
 * LinkPreviewTabsApp), so the tab bar picks up new settings values only
 * on next mount (e.g. reopening the browser panel with tabs).
 *
 * The overlay webview is `transparent(true)` — pixels outside the tab
 * pill itself have alpha=0, so WKWebView lets mouse clicks pass through
 * to the content webview beneath. Only the opaque glass pill blocks
 * clicks, matching the behavior of a real browser's floating tab strip.
 */

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useWindowThemeSync } from "../../lib/windows/useWindowThemeSync";
import { storage, type LinkPreviewTabsState } from "../../lib/core/storage";
import BrowserTabs from "../panels/BrowserTabs";

export default function BrowserTabsOverlayApp() {
  const [state, setState] = useState<LinkPreviewTabsState>({
    tabs: [],
    activeTabId: null,
  });
  const [glassOpacity, setGlassOpacity] = useState(0.08);
  const [position, setPosition] = useState<"top" | "bottom">("bottom");

  // Sync theme with main window (includes app theme colors)
  useWindowThemeSync();

  // Init: fetch initial tabs state + tab-bar display settings (one-shot;
  // no live sync, mirrors LinkPreviewTabsApp's precedent).
  useEffect(() => {
    storage.getBrowserPanelTabsState().then(setState).catch(console.error);
    storage
      .loadSettings()
      .then((settings) => {
        if (typeof settings.tabBarGlassOpacity === "number") {
          setGlassOpacity(settings.tabBarGlassOpacity);
        }
        if (settings.tabBarPosition) {
          setPosition(settings.tabBarPosition);
        }
      })
      .catch(console.error);
  }, []);

  // Listen for Rust-side events — full state synced via tabs-updated
  useEffect(() => {
    const unlisten = listen<LinkPreviewTabsState>(
      "link-preview:tabs-updated",
      (event) => {
        setState(event.payload);
      },
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (state.tabs.length === 0) return null;

  // Wrapper div provides a proper positioning context (position: relative)
  // for TabBar's absolute-positioned outer div, matching how
  // LinkPreviewTabsApp wraps TabBar in `.link-preview-root`. Without this,
  // TabBar's `absolute left-0 right-0 bottom-0` falls back to the ICB,
  // which works but can interact badly with body/#root margin or height.
  // `overflow: hidden` clips the pill's drop shadow at the webview edge
  // cleanly (the shadow would be clipped by the native webview bounds
  // anyway).
  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <BrowserTabs
        tabs={state.tabs}
        activeTabId={state.activeTabId}
        glassOpacity={glassOpacity}
        position={position}
      />
    </div>
  );
}
