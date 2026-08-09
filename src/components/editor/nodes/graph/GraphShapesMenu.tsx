/**
 * GraphShapesMenu - 形状全量下拉菜单（hover 展开，按类别分区）。
 *
 * 抽取自 GraphToolbar。包含触发按钮 + 下拉内容 + 外层 ref 容器。
 * 样式沿用 jgraph-dropdown / jgraph-dropdown-menu 自有体系。
 */

import type { RefObject } from "react";
import { Shapes } from "lucide-react";
import { ShapeGlyph } from "./ShapeGlyph";
import { shapeGroups } from "./graphShapeMenu";
import type { GraphNodeShape } from "./graphSnapshot";

export interface GraphShapesMenuProps {
  pendingShape: GraphNodeShape | null;
  shapesMenuOpen: boolean;
  shapesMenuRef: RefObject<HTMLDivElement | null>;
  onShapesClick: () => void;
  onShapesEnter: () => void;
  onShapesLeave: () => void;
  onSelectShape: (shape: GraphNodeShape) => void;
}

export function GraphShapesMenu({
  pendingShape,
  shapesMenuOpen,
  shapesMenuRef,
  onShapesClick,
  onShapesEnter,
  onShapesLeave,
  onSelectShape,
}: GraphShapesMenuProps) {
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
      </button>
      {shapesMenuOpen && (
        <div className="jgraph-dropdown-menu" role="presentation">
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
                  onClick={() => onSelectShape(shape)}
                >
                  <ShapeGlyph shape={shape} />
                  <span>{title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
