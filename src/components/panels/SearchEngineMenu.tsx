/**
 * SearchEngineMenu - 搜索引擎选择下拉菜单。
 *
 * 抽取自 BrowserStartPage 的内联 MenuList。仅渲染菜单本身；
 * 触发按钮与 outside-click ref 仍由父组件持有（菜单 DOM 落在
 * 父组件 ref 容器内，outside-click 逻辑无需改动）。
 */

import { MenuItem, MenuList } from "../ui/MenuList";
import {
  getSearchEngineFaviconUrl,
  type SearchEngine,
} from "../../store/browserSlice";

export interface SearchEngineMenuProps {
  /** 所有可选搜索引擎。 */
  engines: SearchEngine[];
  /** 当前选中的引擎 id（用于高亮）。 */
  currentEngineId: string;
  /** 选中某个引擎时回调。 */
  onSelect: (id: string) => void;
  /** 透传给 MenuList 的 className（用于定位）。 */
  className?: string;
}

export function SearchEngineMenu({
  engines,
  currentEngineId,
  onSelect,
  className,
}: SearchEngineMenuProps) {
  return (
    <MenuList className={className}>
      {engines.map((e) => (
        <MenuItem
          key={e.id}
          icon={
            <img
              src={getSearchEngineFaviconUrl(e.id)}
              alt=""
              className="w-3.5 h-3.5 rounded-sm"
              draggable={false}
            />
          }
          onClick={() => onSelect(e.id)}
          className={
            e.id === currentEngineId
              ? "bg-[var(--vscode-menu-hoverBackground)]"
              : ""
          }
        >
          {e.name}
        </MenuItem>
      ))}
    </MenuList>
  );
}
