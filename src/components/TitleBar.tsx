import SearchBar from './SearchBar';

/**
 * macOS-style title bar spanning the full window width.
 *
 * - Left: traffic-light buttons (native, rendered by the OS in Overlay mode).
 *   We reserve horizontal space with `pl-[72px]` so the buttons sit inside this
 *   bar and never overlap the Activity Bar below.
 * - Center: a global document search input (SearchBar component).
 *
 * The whole bar is a Tauri drag region (except the input), so the user can
 * grab anywhere to move the window.
 */
export default function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="h-9 shrink-0 flex items-center bg-[var(--vscode-titleBar-background)] border-b border-[var(--vscode-titleBar-border)] px-3 select-none relative z-50"
    >
      <SearchBar />
    </div>
  );
}
