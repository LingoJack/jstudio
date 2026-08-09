/**
 * ShortcutContextMenu - 快捷方式右键菜单（编辑 / 删除）。
 *
 * 抽取自 BrowserStartPage 的内联 MenuList。仅渲染菜单本身；
 * outside-click ref 仍由父组件外层 div 持有。
 */

import { Pencil, Trash2 } from "lucide-react";
import { MenuItem, MenuDivider, MenuList } from "../ui/MenuList";
import { useI18n } from "../../lib/core/i18n";
import type { BrowserShortcut } from "../../store/browserSlice";

export interface ShortcutContextMenuProps {
  /** 屏幕坐标（fixed 定位）。 */
  x: number;
  y: number;
  /** 触发菜单的快捷方式。 */
  shortcut: BrowserShortcut;
  /** 编辑回调。 */
  onEdit: (shortcut: BrowserShortcut) => void;
  /** 删除回调。 */
  onDelete: (shortcut: BrowserShortcut) => void;
}

export function ShortcutContextMenu({
  x,
  y,
  shortcut,
  onEdit,
  onDelete,
}: ShortcutContextMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
      <MenuItem
        icon={<Pencil className="w-3.5 h-3.5" />}
        onClick={() => onEdit(shortcut)}
      >
        {t("linkPreview.startPage.editShortcut")}
      </MenuItem>
      <MenuDivider />
      <MenuItem
        variant="danger"
        icon={<Trash2 className="w-3.5 h-3.5" />}
        onClick={() => onDelete(shortcut)}
      >
        {t("linkPreview.startPage.deleteShortcut")}
      </MenuItem>
    </MenuList>
  );
}
