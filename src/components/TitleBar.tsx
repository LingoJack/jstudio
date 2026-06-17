import { useStore } from '../store/useStore';
import { Search } from 'lucide-react';

/**
 * macOS-style title bar spanning the full window width.
 *
 * - Left: traffic-light buttons (native, rendered by the OS in Overlay mode).
 *   We reserve horizontal space with `pl-[72px]` so the buttons sit inside this
 *   bar and never overlap the Activity Bar below.
 * - Center/right: a global document search input.
 *
 * The whole bar is a Tauri drag region (except the input), so the user can
 * grab anywhere to move the window.
 */
export default function TitleBar() {
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);

  return (
    <div
      data-tauri-drag-region
      className="h-9 shrink-0 flex items-center bg-[var(--vscode-titleBar-background)] border-b border-[var(--vscode-titleBar-border)] px-3 select-none relative z-50"
    >
      {/* Centered search bar (absolute so traffic-light padding doesn't offset it) */}
      <div className="absolute left-1/2 -translate-x-1/2 w-64 max-w-[50%]">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--vscode-icon-foreground)] opacity-60 pointer-events-none" />
        <input
          type="text"
          placeholder="搜索文档..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-tauri-drag-region={false}
          className="w-full h-6 text-xs pl-7 pr-2 rounded-sm border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-60 focus:outline-none focus:border-[var(--vscode-focusBorder)] transition-colors duration-150"
        />
      </div>
    </div>
  );
}
