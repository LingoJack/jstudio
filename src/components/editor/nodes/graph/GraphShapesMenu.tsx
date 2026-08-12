/**
 * GraphShapesMenu - 形状全量下拉菜单（hover 展开，按类别分区）。
 *
 * 抽取自 GraphToolbar。包含触发按钮 + 下拉内容 + 外层 ref 容器。
 * 样式沿用 jgraph-dropdown / jgraph-dropdown-menu 自有体系。
 */

import type { RefObject } from "react";
import { Shapes } from "lucide-react";
import { ShapeGlyph } from "./ShapeGlyph";
import { shapeGroups } from "./shapeMenuData";
import { useDropdownMenuFit } from "./useDropdownMenuFit";
import type { GraphNodeShape } from "./graphSnapshot";

export interface GraphShapesMenuProps {
  pendingShape: GraphNodeShape | null;
  pendingLifelineCount: number;
  shapesMenuOpen: boolean;
  shapesMenuRef: RefObject<HTMLDivElement | null>;
  onShapesClick: () => void;
  onShapesEnter: () => void;
  onShapesLeave: () => void;
  onSelectShape: (shape: GraphNodeShape, metaKey: boolean) => void;
}

export function GraphShapesMenu({
  pendingShape,
  pendingLifelineCount,
  shapesMenuOpen,
  shapesMenuRef,
  onShapesClick,
  onShapesEnter,
  onShapesLeave,
  onSelectShape,
}: GraphShapesMenuProps) {
  const menuListRef = useDropdownMenuFit(shapesMenuOpen);
  // 计数 badge 显示条件：仅当 lifeline 处于 pending 且计数 > 1。
  const showLifelineBadge = pendingShape === 'lifeline' && pendingLifelineCount > 1;

  return (
    <div
      className="jgraph-dropdown"
      ref={shapesMenuRef}
      onMouseEnter={onShapesEnter}
      onMouseLeave={onShapesLeave}
    >
      <button
        type="button"
        className="jgraph-tool-btn"
        title="全部形状｜悬停展开选择"
        onClick={onShapesClick}
      >
        <Shapes size={16} />
        {showLifelineBadge && (
          <span className="jgraph-shapes-badge" aria-label={`批量计数 ${pendingLifelineCount}`}>
            ×{pendingLifelineCount}
          </span>
        )}
      </button>
      {shapesMenuOpen && (
        <div className="jgraph-dropdown-menu" ref={menuListRef} role="presentation">
          {shapeGroups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <div className="jgraph-dropdown-sep" />}
              <div className="jgraph-dropdown-section-label">{group.label}</div>
              {group.shapes.map(({ shape, title }) => (
                <button
                  key={shape}
                  type="button"
                  className={`jgraph-dropdown-item ${pendingShape === shape ? 'is-active' : ''}`}
                  title={`${title}｜点击后在画布拖拽划定大小`}
                  onClick={(e) => onSelectShape(shape, e.metaKey || e.ctrlKey)}
                >
                  <ShapeGlyph shape={shape} />
                  <span>{title}</span>
                  {shape === 'lifeline' && showLifelineBadge && (
                    <span className="jgraph-shapes-badge" aria-label={`批量计数 ${pendingLifelineCount}`}>
                      ×{pendingLifelineCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
