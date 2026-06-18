import { useStore } from '../store/useStore';
import { Search } from 'lucide-react';

/**
 * Global document search bar.
 *
 * Rendered centered in the title bar. The container is marked as
 * non-draggable so the input remains interactive even though the
 * surrounding title bar is a Tauri drag region.
 */
export default function SearchBar() {
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 w-96 max-w-[60%]"
      data-tauri-drag-region={false}
    >
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--vscode-icon-foreground)] opacity-60 pointer-events-none" />
      <input
        type="text"
        placeholder="搜索文档..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        data-tauri-drag-region={false}
        className="w-full h-7 text-sm pl-8 pr-3 rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-60 focus:outline-none focus:border-[var(--vscode-focusBorder)] transition-colors duration-150"
      />
    </div>
  );
}
