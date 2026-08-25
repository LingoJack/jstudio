import { useStore } from '../../store/useStore';
import BrowserDynamicIsland from './BrowserDynamicIsland';

/**
 * macOS-style title bar spanning the full window width.
 *
 * - Left: traffic-light buttons (native, rendered by the OS in Overlay mode).
 *   We reserve horizontal space with `pl-[72px]` so the buttons sit inside this
 *   bar and never overlap the Activity Bar below.
 * - Center: **Dynamic Island** – a context-sensitive zone. When the browser
 *   sidebar view is active, the centre renders a compact address bar
 *   (`BrowserDynamicIsland`). Otherwise it is an empty drag region.
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
      className="h-9 shrink-0 flex items-center justify-between bg-[var(--vscode-activityBar-background)] px-3 select-none relative z-toolbar"
    >
      {/* Left: placeholder for traffic lights space */}
      <div className="w-[72px]" data-tauri-drag-region />

      {/* Center: Dynamic Island (browser address bar) or empty drag region.
          Always a drag region - when the browser is active, the pill itself
          (BrowserDynamicIsland root) has `data-tauri-drag-region={false}` to
          exclude itself, so the empty space around the pill remains draggable
          (needed for double-click-to-maximize on macOS). */}
      <div className="flex-1 flex items-center" data-tauri-drag-region>
        {isBrowserView ? <BrowserDynamicIsland /> : null}
      </div>

      {/* Right: spacer (sidebar toggle moved into DocumentSidebar as a pin) */}
      <div className="w-4" data-tauri-drag-region />
    </div>
  );
}
