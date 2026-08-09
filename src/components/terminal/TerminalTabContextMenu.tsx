/**
 * TerminalTabContextMenu - 从 TerminalTabs 抽取的终端标签右键菜单。
 *
 * 菜单项：Rename / Detach / Close。
 * 由 TabBar 的 renderContextMenu 回调渲染，菜单关闭通过 onCloseMenu
 * 回调显式触发（双保险，TabBar 自身也有 window-click 关闭逻辑）。
 */

import { Pencil, X, ExternalLink } from "lucide-react";
import { useI18n } from "../../lib/core/i18n";
import { MenuList, MenuItem, MenuDivider } from "../ui/MenuList";

export interface TerminalTabContextMenuProps {
  /** 当前右键的终端组 ID。 */
  groupId: string;
  /** 屏幕坐标（fixed 定位）。 */
  x: number;
  y: number;
  /** 是否允许分离到新窗口（多于 1 个组时为 true）。 */
  canDetach: boolean;
  /** 关闭菜单回调。 */
  onCloseMenu: () => void;
  /** 重命名回调。 */
  onRename: (groupId: string) => void;
  /** 分离到新窗口回调。 */
  onDetach: (groupId: string) => void;
  /** 关闭终端组回调（父组件内部查找 session 并调 closeSession）。 */
  onCloseTab: (groupId: string) => void;
}

export function TerminalTabContextMenu({
  groupId,
  x,
  y,
  canDetach,
  onCloseMenu,
  onRename,
  onDetach,
  onCloseTab,
}: TerminalTabContextMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
      <MenuItem
        icon={<Pencil className="w-4 h-4" />}
        onClick={() => {
          onRename(groupId);
          onCloseMenu();
        }}
      >
        {t("terminal.rename")}
      </MenuItem>

      {canDetach && (
        <MenuItem
          icon={<ExternalLink className="w-4 h-4" />}
          onClick={() => {
            onDetach(groupId);
            onCloseMenu();
          }}
        >
          {t("terminal.detachTab")}
        </MenuItem>
      )}

      <MenuDivider />

      <MenuItem
        variant="danger"
        icon={<X className="w-4 h-4" />}
        onClick={() => {
          onCloseTab(groupId);
          onCloseMenu();
        }}
      >
        {t("terminal.close")}
      </MenuItem>
    </MenuList>
  );
}
