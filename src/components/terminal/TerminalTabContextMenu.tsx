import { useI18n } from '../../lib/i18n';
import { Pencil, X } from 'lucide-react';

export interface TerminalTabContextMenuProps {
  /** Screen coordinates where the menu should appear */
  x: number;
  y: number;
  /** Callback when the user picks "Rename" */
  onRename: () => void;
  /** Callback when the user picks "Close" */
  onClose: () => void;
}

/**
 * Floating right-click context menu for a terminal tab.
 *
 * Rendered as a fixed-position overlay at (x, y). The caller owns
 * the lifecycle (open/close) — this component only renders and delegates.
 */
export default function TerminalTabContextMenu({
  x,
  y,
  onRename,
  onClose,
}: TerminalTabContextMenuProps) {
  const { t } = useI18n();

  const itemClass =
    'w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-menu-hoverBackground)]';
  const dividerClass =
    'my-1 border-t border-[var(--vscode-menu-separatorBackground)]';

  return (
    <div
      className="fixed z-50 min-w-[140px] py-1 rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-lg text-sm"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button onClick={onRename} className={itemClass}>
        <Pencil className="w-4 h-4 opacity-70" />
        <span>{t('terminal.rename')}</span>
      </button>

      <div className={dividerClass} />

      <button
        onClick={onClose}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-menu-hoverBackground)]"
      >
        <X className="w-4 h-4 opacity-70" />
        <span>{t('terminal.close')}</span>
      </button>
    </div>
  );
}
