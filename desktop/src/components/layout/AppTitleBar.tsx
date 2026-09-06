import { setTitlebarSlot } from './titlebarSlot';

/** DOM id of the title-bar center slot. DocumentTabs portals the floating
 *  tab capsule here when the tab bar position is 'top' — the capsule then
 *  sits inside the title bar row instead of floating over the content. */
export const TITLEBAR_CENTER_SLOT_ID = 'app-titlebar-center-slot';

/**
 * macOS-style title bar spanning the full window width.
 *
 * - Left: traffic-light buttons (native, rendered by the OS in Overlay mode).
 *   We reserve horizontal space with `pl-[72px]` so the buttons sit inside this
 *   bar and never overlap the Activity Bar below.
 * - Center: **Dynamic Island** zone. When the browser panel is active, the
 *   address capsule does NOT render here — the panel's page view is a native
 *   WebContentsView that covers all React DOM, so the capsule lives in a
 *   transparent native overlay above it (BrowserChromeWindowApp, wired in
 *   main.ts's TabsManager chromeView). This row stays an empty drag region.
 *
 * The whole bar is a Tauri drag region (except interactive elements), so the
 * user can grab anywhere to move the window.
 */
export default function AppTitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="absolute top-0 inset-x-0 h-9 flex items-center justify-between px-3 select-none z-toolbar"
      // Fully transparent, no blur/tint: the document scroll area extends
      // beneath this bar (App.tsx punches the content column through in doc
      // view) and the browser page view starts at y=0 under it too.
      style={{ background: 'transparent' }}
    >
      {/* Left: placeholder for traffic lights space — the whole left zone is
          surrendered to the native traffic lights; no app UI lives here. */}
      <div className="w-[72px]" data-tauri-drag-region />

      {/* Center: empty drag region — the browser capsule is the native
          overlay (see header note); the doc tab capsule portals into the
          absolute slot below. */}
      <div className="flex-1 flex items-center" data-tauri-drag-region />

      {/* Center slot for the document tab capsule (portaled by DocumentTabs
          when position is 'top'). items-end + the capsule's own
          translate-y-1/2 make the capsule straddle the title bar's bottom
          edge (chrome-tab style): taller than the 36px bar without getting
          its top clipped by the window frame. Empty + pointer-events-none
          so it never blocks window dragging. */}
      <div
        id={TITLEBAR_CENTER_SLOT_ID}
        ref={setTitlebarSlot}
        data-tauri-drag-region
        className="absolute inset-x-0 top-0 bottom-0 flex items-end justify-center pointer-events-none"
      />

      {/* Right: spacer (sidebar toggle moved into DocumentSidebar as a pin) */}
      <div className="w-4" data-tauri-drag-region />
    </div>
  );
}
