/**
 * WorkspaceGroupMenu - 从 WorkspaceList 抽取的工作空间分组右键菜单。
 *
 * 菜单项：新建任务 / 设为当前工作空间。
 */

import { Plus, FolderOpen } from "lucide-react";
import { useI18n } from "../../lib/core/i18n";
import { MenuList, MenuItem, MenuDivider } from "../ui/MenuList";

export interface WorkspaceGroupMenuProps {
  /** 屏幕坐标（fixed 定位）。 */
  x: number;
  y: number;
  /** 是否为当前激活工作空间（是则禁用「设为当前」项）。 */
  isActiveWorkspace: boolean;
  /** 新建任务回调。 */
  onCreateSession: () => void;
  /** 设为当前工作空间回调。 */
  onSetWorkspace: () => void;
  /** 关闭菜单回调。 */
  onClose: () => void;
}

export function WorkspaceGroupMenu({
  isActiveWorkspace,
  onCreateSession,
  onSetWorkspace,
  onClose,
  x,
  y,
}: WorkspaceGroupMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
      <MenuItem
        icon={<Plus className="w-4 h-4" />}
        onClick={() => {
          onCreateSession();
          onClose();
        }}
      >
        {t("agent.newTask")}
      </MenuItem>
      <MenuDivider />
      <MenuItem
        icon={<FolderOpen className="w-4 h-4" />}
        disabled={isActiveWorkspace}
        onClick={() => {
          onSetWorkspace();
          onClose();
        }}
      >
        {t("agent.setAsCurrentWorkspace")}
      </MenuItem>
    </MenuList>
  );
}
