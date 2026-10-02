import { useStore } from '../../store/useStore';
import { SIDEBAR } from '../../lib/constants';
import BrowserTabStrip from '../panels/BrowserTabStrip';
import { setTitlebarLeftSlot, setTitlebarSlot } from './titlebarSlot';

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
 * - Center: a context-sensitive zone. When the browser sidebar view is
 *   active, the centre renders the Chrome-style tab strip
 *   (`BrowserTabStrip` — tabs + new-tab, then trailing drag region).
 *   Otherwise it is an empty drag region, with an absolute center slot
 *   (`TITLEBAR_CENTER_SLOT_ID`) for the document tab capsule.
 *
 * The whole bar is a Tauri drag region (except interactive elements), so the
 * user can grab anywhere to move the window.
 */
export default function AppTitleBar() {
  const activeSidebarView = useStore((s) => s.activeSidebarView);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const isBrowserView = activeSidebarView === 'browser';

  return (
    <div
      className="drag-region absolute top-0 inset-x-0 h-9 flex items-center justify-between px-3 select-none z-toolbar"
      // Fully transparent, no blur/tint: the document scroll area extends
      // beneath this bar (App.tsx punches the content column through in doc
      // view) and the text stays crisp under it.
      style={{ background: 'transparent' }}
    >
      {/* Left: placeholder for traffic lights space — the whole left zone is
          surrendered to the native traffic lights; no app UI lives here. */}
      <div className="w-[72px]" />

      {/* Left slot: the document sidebar portals its header actions (search /
          pin / more) here, right-aligned to the sidebar's right edge.
          The INITIAL right offset is rendered from the store (activity bar +
          sidebar width) so the slot is already above the sidebar edge at
          FIRST PAINT — Electron snapshots draggable regions from the first
          layout, and a later JS move (DocumentSidebar's ResizeObserver,
          which keeps tracking hover/resize animations) would leave the
          native no-drag hole at the slot's unpositioned right-0 spot:
          physical clicks on the icons then hit the bar's drag rect and
          never reach the renderer. The observer's writes converge on this
          same value, so this stays a no-op for it.
          pointer-events-none: empty slot space falls through to the bar's
          drag region; the portaled group re-enables pointer events.
          NOTE: only the BAR ROOT carries .drag-region — see its comment. */}
      <div
        ref={setTitlebarLeftSlot}
        style={{ right: `calc(100% - ${SIDEBAR.ACTIVITY_BAR + sidebarWidth}px)` }}
        className="pointer-events-none absolute top-0 h-9 flex items-center"
      />

      {/* Center: browser tab strip (browser view) or empty drag space — the
          bar root's drag region already covers it; interactive children opt
          out with .no-drag (double-click-to-maximize works on the bar). */}
      <div className="flex-1 flex items-center">
        {isBrowserView ? <BrowserTabStrip /> : null}
      </div>

      {/* Center slot for the document tab capsule (portaled by DocumentTabs
          when position is 'top'). items-end + the capsule's own
          translate-y-1/2 make the capsule straddle the title bar's bottom
          edge (chrome-tab style): taller than the 36px bar without getting
          its top clipped by the window frame. Empty + pointer-events-none;
          deliberately NO .drag-region here — see the left-slot note above. */}
      <div
        id={TITLEBAR_CENTER_SLOT_ID}
        ref={setTitlebarSlot}
        className="absolute inset-x-0 top-0 bottom-0 flex items-end justify-center pointer-events-none"
      />

      {/* Right: spacer (sidebar toggle moved into DocumentSidebar as a pin) */}
      <div className="w-4" />
    </div>
  );
}
