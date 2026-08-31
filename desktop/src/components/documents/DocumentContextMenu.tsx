import { useI18n } from '../../lib/core/i18n';
import { Pencil, Trash2, FolderOpen, Copy, CopyPlus, PackageOpen, History, FileCode2 } from 'lucide-react';
import { MenuList, MenuItem, MenuDivider } from '../ui/MenuList';

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
  /** Callback when the user picks "Export Backup (.jnote)" */
  onExportBundle: () => void;
  /** Callback when the user picks "Copy as Markdown" */
  onCopyAsMarkdown: () => void;
  /** Callback when the user picks "Backup & Restore" */
  onBackupRestore: () => void;
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
  onExportBundle,
  onCopyAsMarkdown,
  onBackupRestore,
}: DocumentContextMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
      <MenuItem icon={<Pencil />} onClick={onRename}>
        {t('doclist.rename')}
      </MenuItem>

      <MenuDivider />

      <MenuItem icon={<PackageOpen />} onClick={onExportBundle}>
        {t('doclist.exportBundle')}
      </MenuItem>
      <MenuItem icon={<FileCode2 />} onClick={onCopyAsMarkdown}>
        {t('doclist.copyAsMarkdown')}
      </MenuItem>
      <MenuItem icon={<History />} onClick={onBackupRestore}>
        {t('doclist.backupRestore')}
      </MenuItem>

      <MenuDivider />

      <MenuItem icon={<FolderOpen />} onClick={onOpenInFinder}>
        {t('doclist.openInFinder')}
      </MenuItem>
      <MenuItem icon={<Copy />} onClick={onCopyPath}>
        {t('doclist.copyPath')}
      </MenuItem>
      <MenuItem icon={<CopyPlus />} onClick={onCopyRelativePath}>
        {t('doclist.copyRelativePath')}
      </MenuItem>

      <MenuDivider />

      <MenuItem variant="danger" icon={<Trash2 />} onClick={onDelete}>
        {t('doclist.moveToTrash')}
      </MenuItem>
    </MenuList>
  );
}
