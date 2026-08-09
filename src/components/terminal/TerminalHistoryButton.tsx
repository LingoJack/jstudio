import TerminalRecentDirsDropdown from './TerminalRecentDirsDropdown';

/**
 * TerminalHistoryButton - "recent working directories" icon rendered in
 * `AppTitleBar`'s trailing-action slot when the terminal view is active.
 *
 * Thin wrapper around `TerminalRecentDirsDropdown` styled for the title bar
 * (7×7 rounded-md button, opens downward because the bar sits at the top).
 */
export default function TerminalHistoryButton() {
  return (
    <TerminalRecentDirsDropdown
      position="top"
      buttonClassName="w-7 h-7 flex items-center justify-center rounded-md transition-colors duration-75 cursor-pointer text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:text-[var(--vscode-foreground)] opacity-80 hover:opacity-100"
      buttonActiveClassName="opacity-100 bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-foreground)]"
      iconClassName="w-4 h-4"
    />
  );
}
