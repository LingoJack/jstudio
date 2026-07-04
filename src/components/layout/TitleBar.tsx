import SearchBar from '../editor/SearchBar';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { PanelLeft } from 'lucide-react';

/**
 * macOS-style title bar spanning the full window width.
 *
 * - Left: traffic-light buttons (native, rendered by the OS in Overlay mode).
 *   We reserve horizontal space with `pl-[72px]` so the buttons sit inside this
 *   bar and never overlap the Activity Bar below.
 * - Center: a global document search input (SearchBar component).
 * - Right: a sidebar toggle button (VSCode-style).
 *
 * The whole bar is a Tauri drag region (except interactive elements), so the
 * user can grab anywhere to move the window.
 */
export default function TitleBar() {
  const { t } = useI18n();
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);

  return (
    <div
      data-tauri-drag-region
      className="h-9 shrink-0 flex items-center bg-[var(--vscode-titleBar-background)] border-b border-[var(--vscode-titleBar-border)] px-3 select-none relative z-toolbar"
    >
      <SearchBar />

      {/* Right: sidebar toggle (VSCode-style) */}
      <button
        type="button"
        onClick={toggleSidebar}
        data-tauri-drag-region={false}
        title={isSidebarOpen ? t('titlebar.collapseSidebar') : t('titlebar.expandSidebar')}
        className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors duration-150 cursor-pointer ${
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
