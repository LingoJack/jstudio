import { useI18n } from '../lib/i18n';
import { Pencil, Trash2, FolderOpen, Copy, CopyPlus, FolderInput } from 'lucide-react';
import { MenuList, MenuItem, MenuDivider } from './ui/MenuList';

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
  /** Callback when the user picks "Move to Folder" */
  onMoveTo: () => void;
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
  onMoveTo,
}: DocumentContextMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
      <MenuItem icon={<Pencil />} onClick={onRename}>
        {t('doclist.rename')}
      </MenuItem>
      <MenuItem icon={<FolderInput />} onClick={onMoveTo}>
        {t('doclist.moveTo')}
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
        {t('doclist.delete')}
      </MenuItem>
    </MenuList>
  );
}
