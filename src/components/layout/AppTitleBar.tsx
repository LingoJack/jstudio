import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { PanelLeft } from 'lucide-react';
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
 * - Right: a sidebar toggle button (VSCode-style).
 *
 * The whole bar is a Tauri drag region (except interactive elements), so the
 * user can grab anywhere to move the window.
 */
export default function AppTitleBar() {
  const { t } = useI18n();
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const activeSidebarView = useStore((s) => s.activeSidebarView);
  const isBrowserView = activeSidebarView === 'browser';

  return (
    <div
      data-tauri-drag-region
      className="h-8 shrink-0 flex items-center justify-between bg-[var(--vscode-activityBar-background)] border-b border-[var(--vscode-panel-border)] px-3 select-none relative z-toolbar"
    >
      {/* Left: placeholder for traffic lights space */}
      <div className="w-[72px]" data-tauri-drag-region />

      {/* Center: Dynamic Island (browser address bar) or empty drag region */}
      <div className="flex-1 flex items-center" data-tauri-drag-region={!isBrowserView}>
        {isBrowserView ? <BrowserDynamicIsland /> : null}
      </div>

      {/* Right: sidebar toggle */}
      <button
        type="button"
        onClick={toggleSidebar}
        data-tauri-drag-region={false}
        title={isSidebarOpen ? t('titlebar.collapseSidebar') : t('titlebar.expandSidebar')}
        className={`p-1 rounded-md transition-colors duration-150 cursor-pointer ${
          isSidebarOpen
            ? 'text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
            : 'text-[var(--vscode-foreground)] bg-[var(--vscode-list-activeSelectionBackground)] hover:bg-[var(--vscode-list-hoverBackground)]'
        }`}
      >
        <PanelLeft className="w-4 h-4" />
      </button>
    </div>
  );
}
