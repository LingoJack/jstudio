import { useI18n } from '../../lib/i18n';
import { Pencil, X, ExternalLink } from 'lucide-react';
import { MenuList, MenuItem, MenuDivider } from '../ui/MenuList';

export interface TerminalTabContextMenuProps {
  /** Screen coordinates where the menu should appear */
  x: number;
  y: number;
  /** Callback when the user picks "Rename" */
  onRename: () => void;
  /** Callback when the user picks "Detach to new window" */
  onDetach: () => void;
  /** Whether detaching is allowed (false for the last remaining tab) */
  canDetach: boolean;
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
  onDetach,
  canDetach,
  onClose,
}: TerminalTabContextMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()} className="min-w-[140px]">
      <MenuItem icon={<Pencil />} onClick={onRename}>
        {t('terminal.rename')}
      </MenuItem>

      {canDetach && (
        <MenuItem icon={<ExternalLink />} onClick={onDetach}>
          {t('terminal.detachTab')}
        </MenuItem>
      )}

      <MenuDivider />

      <MenuItem variant="danger" icon={<X />} onClick={onClose}>
        {t('terminal.close')}
      </MenuItem>
    </MenuList>
  );
}
