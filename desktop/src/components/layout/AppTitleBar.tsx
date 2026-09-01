import { useStore } from '../../store/useStore';
import BrowserDynamicIsland from './BrowserDynamicIsland';
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
 * - Center: **Dynamic Island** – a context-sensitive zone. When the browser
 *   sidebar view is active, the centre renders a compact address bar
 *   (`BrowserDynamicIsland`). Otherwise it is an empty drag region, with an
 *   absolute center slot (`TITLEBAR_CENTER_SLOT_ID`) for the document tab
 *   capsule.
 *
 * The whole bar is a Tauri drag region (except interactive elements), so the
 * user can grab anywhere to move the window.
 */
export default function AppTitleBar() {
  const activeSidebarView = useStore((s) => s.activeSidebarView);
  const isBrowserView = activeSidebarView === 'browser';

  return (
    <div
      data-tauri-drag-region
      className="absolute top-0 inset-x-0 h-9 flex items-center justify-between px-3 select-none z-toolbar"
      // Fully transparent, no blur/tint: the document scroll area extends
      // beneath this bar (App.tsx punches the content column through in doc
      // view) and the text stays crisp under it.
      style={{ background: 'transparent' }}
    >
      {/* Left: placeholder for traffic lights space — the whole left zone is
          surrendered to the native traffic lights; no app UI lives here. */}
      <div className="w-[72px]" data-tauri-drag-region />

      {/* Center: Dynamic Island (browser address bar) or empty drag region.
          Always a drag region - when the browser is active, the pill itself
          (BrowserDynamicIsland root) has `data-tauri-drag-region={false}` to
          exclude itself, so the empty space around the pill remains draggable
          (needed for double-click-to-maximize on macOS). */}
      <div className="flex-1 flex items-center" data-tauri-drag-region>
        {isBrowserView ? <BrowserDynamicIsland /> : null}
      </div>

      {/* Center slot for the document tab capsule (portaled by DocumentTabs
          when position is 'top'). The capsule is slimmed to 34px so it sits
          fully inside the 36px bar (vertically centered) instead of hanging
          below it and overlapping the document title. Empty +
          pointer-events-none so it never blocks window dragging. */}
      <div
        id={TITLEBAR_CENTER_SLOT_ID}
        ref={setTitlebarSlot}
        data-tauri-drag-region
        className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center pointer-events-none"
      />

      {/* Right: spacer (sidebar toggle moved into DocumentSidebar as a pin) */}
      <div className="w-4" data-tauri-drag-region />
    </div>
  );
}
