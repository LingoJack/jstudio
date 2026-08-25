import { useStore } from '../../store/useStore';
import BrowserDynamicIsland from './BrowserDynamicIsland';
import { setTitlebarSlot } from './titlebarSlot';

/** DOM id of the title-bar center slot. DocumentTabs portals the floating
 *  tab capsule here when the tab bar position is 'top' — the capsule then
 *  sits inside the title bar row instead of floating over the content. */
export const TITLEBAR_CENTER_SLOT_ID = 'app-titlebar-center-slot';
/** DOM id of the title-bar LEFT slot (after the traffic-light spacer).
 *  DocumentSidebar portals its toolbar (search / pin / more) here, making
 *  the title bar the app's single unified top row. */
export const TITLEBAR_LEFT_SLOT_ID = 'app-titlebar-left-slot';

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
          when position is 'top'). items-end + the capsule's own
          translate-y-1/2 make the capsule straddle the title bar's bottom
          edge (chrome-tab style): taller than the 36px bar without getting
          its top clipped by the window frame. Empty + pointer-events-none
          so it never blocks window dragging. */}
      <div
        id={TITLEBAR_CENTER_SLOT_ID}
        ref={(el) => setTitlebarSlot('center', el)}
        data-tauri-drag-region
        className="absolute inset-x-0 top-0 bottom-0 flex items-end justify-center pointer-events-none"
      />

      {/* Right slot: the sidebar toolbar (search / pin / more), portaled by
          DocumentSidebar — kept well clear of the traffic lights on the left. */}
      <div
        id={TITLEBAR_LEFT_SLOT_ID}
        ref={(el) => setTitlebarSlot('left', el)}
        className="flex items-center"
      />

      {/* Right: spacer (sidebar toggle moved into DocumentSidebar as a pin) */}
      <div className="w-4" data-tauri-drag-region />
    </div>
  );
}
