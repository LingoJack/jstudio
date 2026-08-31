/**
 * DocumentTabContextMenu - 从 DocumentTabs 抽取的文档标签右键菜单。
 *
 * 菜单项：Detach / Close / Close Others。
 */

import { X, ExternalLink } from "lucide-react";
import { useI18n } from "../../lib/core/i18n";
import { MenuList, MenuItem, MenuDivider } from "../ui/MenuList";

export interface DocumentTabContextMenuProps {
  /** 当前右键的标签 ID。 */
  tabId: string;
  /** 屏幕坐标（fixed 定位）。 */
  x: number;
  y: number;
  /** 是否允许分离到新窗口（多于 1 个标签且有 docId 时为 true）。 */
  canDetach: boolean;
  /** 是否允许关闭其他标签（多于 1 个文档标签时为 true）。 */
  canCloseOthers: boolean;
  /** 关闭菜单回调。 */
  onCloseMenu: () => void;
  /** 分离到新窗口回调。 */
  onDetach: (tabId: string) => void;
  /** 关闭当前标签回调。 */
  onClose: (tabId: string) => void;
  /** 关闭其他标签回调。 */
  onCloseOthers: (tabId: string) => void;
}

export function DocumentTabContextMenu({
  tabId,
  x,
  y,
  canDetach,
  canCloseOthers,
  onCloseMenu,
  onDetach,
  onClose,
  onCloseOthers,
}: DocumentTabContextMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
      {canDetach && (
        <>
          <MenuItem
            icon={<ExternalLink className="w-4 h-4" />}
            onClick={() => {
              onDetach(tabId);
              onCloseMenu();
            }}
          >
            {t("workspace.detachToWindow")}
          </MenuItem>
          <MenuDivider />
        </>
      )}
      <MenuItem
        icon={<X className="w-4 h-4" />}
        onClick={() => {
          onClose(tabId);
          onCloseMenu();
        }}
      >
        {t("workspace.closeTab")}
      </MenuItem>
      {canCloseOthers && (
        <MenuItem
          onClick={() => {
            onCloseOthers(tabId);
            onCloseMenu();
          }}
        >
          {t("workspace.closeOthers")}
        </MenuItem>
      )}
    </MenuList>
  );
}
