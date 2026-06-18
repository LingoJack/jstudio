import { useI18n } from '../lib/i18n';
import { Pencil, Trash2, FolderOpen, Copy, CopyPlus } from 'lucide-react';

export interface DocumentContextMenuProps {
  /** Screen coordinates where the menu should appear */
  x: number;
  y: number;
  /** Callback when the user picks "Rename" */
  onRename: () => void;
  /** Callback when the user picks "Delete" */
  onDelete: () => void;
  /** Callback when the user picks "Open in Finder" */
  onOpenInFinder: () => void;
  /** Callback when the user picks "Copy Path" */
  onCopyPath: () => void;
  /** Callback when the user picks "Copy Relative Path" */
  onCopyRelativePath: () => void;
}

/**
 * Floating right-click context menu for a document item in the sidebar.
 *
 * The menu is positioned at `(x, y)` and rendered as a fixed-position overlay.
 * All actions are delegated to callbacks — the caller owns the lifecycle
 * (open/close) and the actual logic.
 */
export default function DocumentContextMenu({
  x,
  y,
  onRename,
  onDelete,
  onOpenInFinder,
  onCopyPath,
  onCopyRelativePath,
}: DocumentContextMenuProps) {
  const { t } = useI18n();

  const itemClass =
    'w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-menu-hoverBackground)]';
  const dividerClass = 'my-1 border-t border-[var(--vscode-menu-separatorBackground)]';

  return (
    <div
      className="fixed z-50 min-w-[160px] py-1 rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-lg text-sm"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button onClick={onRename} className={itemClass}>
        <Pencil className="w-4 h-4 opacity-70" />
        <span>{t('doclist.rename')}</span>
      </button>

      <div className={dividerClass} />

      <button onClick={onOpenInFinder} className={itemClass}>
        <FolderOpen className="w-4 h-4 opacity-70" />
        <span>{t('doclist.openInFinder')}</span>
      </button>
      <button onClick={onCopyPath} className={itemClass}>
        <Copy className="w-4 h-4 opacity-70" />
        <span>{t('doclist.copyPath')}</span>
      </button>
      <button onClick={onCopyRelativePath} className={itemClass}>
        <CopyPlus className="w-4 h-4 opacity-70" />
        <span>{t('doclist.copyRelativePath')}</span>
      </button>

      <div className={dividerClass} />

      <button
        onClick={onDelete}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-menu-hoverBackground)]"
      >
        <Trash2 className="w-4 h-4 opacity-70" />
        <span>{t('doclist.delete')}</span>
      </button>
    </div>
  );
}
