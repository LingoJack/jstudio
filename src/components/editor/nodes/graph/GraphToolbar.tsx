/**
 * GraphToolbar - 从 GraphCanvas 提取的画图工具栏。
 *
 * 纯 JSX 组件，接收所有数据和回调作为 props。
 * 包含：形状选择菜单、LRM 最近使用、撤销/重做/删除、时序图切换、
 * 标签对齐、填充色选择、缩放控制、更多菜单（网格/自动激活/导入/导出）。
 */

import type { RefObject } from "react";
import {
  Shapes,
  Undo2,
  Redo2,
  Trash2,
  MoveRight,
  Reply,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  ZoomIn,
  ZoomOut,
  Maximize,
  MoreHorizontal,
  Grid3x3,
  Check,
  SquareStack,
  FileDown,
  Sparkles,
  Download,
  Copy,
  ClipboardCopy,
} from "lucide-react";
import { ShapeGlyph } from "./ShapeGlyph";
import { shapeGroups, shapeTitleMap } from "./graphShapeMenu";
import { fillPresetsFor } from "./graphTheme";
import type { GraphNodeShape, LabelAlign } from "./graphSnapshot";

export interface GraphToolbarProps {
  // Shape menu
  pendingShape: GraphNodeShape | null;
  recentShapes: GraphNodeShape[];
  shapesMenuOpen: boolean;
  shapesMenuRef: RefObject<HTMLDivElement | null>;
  onShapesClick: () => void;
  onShapesEnter: () => void;
  onShapesLeave: () => void;
  onSelectShape: (shape: GraphNodeShape) => void;

  // Undo / Redo / Delete
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;

  // Sequence diagram
  selectedSeqEdge: "call" | "return" | null;
  onToggleSeqMessage: () => void;

  // Label alignment
  selectedLabelAlign: LabelAlign | null;
  onSetLabelAlign: (align: LabelAlign) => void;

  // Fill color
  selectedFillColor: string | null;
  fillPickerOpen: boolean;
  fillPickerRef: RefObject<HTMLDivElement | null>;
  onToggleFillPicker: () => void;
  onSetFillColor: (color: string) => void;
  darkMode: boolean;

  // Zoom
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;

  // More menu
  moreMenuOpen: boolean;
  moreMenuRef: RefObject<HTMLDivElement | null>;
  onToggleMoreMenu: () => void;
  showGrid: boolean;
  autoActivation: boolean;
  onToggleGrid: () => void;
  onToggleAutoActivation: () => void;
  onOpenMermaidImport: () => void;
  onOpenAiGraphImport: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onCopyImage: () => void;
  onCopySvg: () => void;
}

export function GraphToolbar(props: GraphToolbarProps) {
  const {
    pendingShape,
    recentShapes,
    shapesMenuOpen,
    shapesMenuRef,
    onShapesClick,
    onShapesEnter,
    onShapesLeave,
    onSelectShape,
    onUndo,
    onRedo,
    onDelete,
    selectedSeqEdge,
    onToggleSeqMessage,
    selectedLabelAlign,
    onSetLabelAlign,
    selectedFillColor,
    fillPickerOpen,
    fillPickerRef,
    onToggleFillPicker,
    onSetFillColor,
    darkMode,
    onZoomIn,
    onZoomOut,
    onFit,
    moreMenuOpen,
    moreMenuRef,
    onToggleMoreMenu,
    showGrid,
    autoActivation,
    onToggleGrid,
    onToggleAutoActivation,
    onOpenMermaidImport,
    onOpenAiGraphImport,
    onExportPng,
    onExportSvg,
    onCopyImage,
    onCopySvg,
  } = props;

  return (
    <div className="jgraph-toolbar">
      {/* 形状全量菜单：hover 展开，按类别分区 */}
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
      {/* LRU 最近使用：平铺在 Shapes 入口右侧，竖线分隔，免去展开菜单 */}
      {recentShapes.length > 0 && (
        <>
          <div className="jgraph-tool-sep" />
          {recentShapes.map((shape) => (
            <button
              key={`lru-${shape}`}
              type="button"
              className={`jgraph-tool-btn ${pendingShape === shape ? 'is-active' : ''}`}
              title={`${shapeTitleMap.get(shape) ?? shape}｜点击后在画布拖拽划定大小`}
              onClick={() => onSelectShape(shape)}
            >
              <ShapeGlyph shape={shape} />
            </button>
          ))}
        </>
      )}
      <div className="jgraph-tool-sep" />
      <button
        type="button"
        className="jgraph-tool-btn"
        title="撤销（⌘Z）"
        onClick={onUndo}
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        className="jgraph-tool-btn"
        title="重做（⌘⇧Z）"
        onClick={onRedo}
      >
        <Redo2 size={16} />
      </button>
      <button
        type="button"
        className="jgraph-tool-btn"
        title="删除选中（Del）"
        onClick={onDelete}
      >
        <Trash2 size={16} />
      </button>
      {selectedSeqEdge && (
        <>
          <div className="jgraph-tool-sep" />
          <button
            type="button"
            className="jgraph-tool-btn"
            title={
              selectedSeqEdge === 'return'
                ? '切换为调用消息（实线）'
                : '切换为返回消息（虚线）'
            }
            onClick={onToggleSeqMessage}
          >
            {selectedSeqEdge === 'return' ? (
              <MoveRight size={16} />
            ) : (
              <Reply size={16} />
            )}
          </button>
        </>
      )}
      {selectedLabelAlign && (
        <>
          <div className="jgraph-tool-sep" />
          <button
            type="button"
            className={`jgraph-tool-btn ${selectedLabelAlign === 'left' ? 'is-active' : ''}`}
            title="文字左对齐"
            onClick={() => onSetLabelAlign('left')}
          >
            <AlignLeft size={16} />
          </button>
          <button
            type="button"
            className={`jgraph-tool-btn ${selectedLabelAlign === 'center' ? 'is-active' : ''}`}
            title="文字居中对齐"
            onClick={() => onSetLabelAlign('center')}
          >
            <AlignCenter size={16} />
          </button>
          <button
            type="button"
            className={`jgraph-tool-btn ${selectedLabelAlign === 'right' ? 'is-active' : ''}`}
            title="文字右对齐"
            onClick={() => onSetLabelAlign('right')}
          >
            <AlignRight size={16} />
          </button>
        </>
      )}
      {selectedFillColor !== null && (
        <>
          <div className="jgraph-tool-sep" />
          <div className="jgraph-fill-picker" ref={fillPickerRef}>
            <button
              type="button"
              className={`jgraph-tool-btn ${selectedFillColor !== 'none' ? 'is-active' : ''}`}
              title="填充颜色"
              onClick={onToggleFillPicker}
            >
              <Palette size={16} />
            </button>
            {fillPickerOpen && (
              <div className="jgraph-fill-popover" role="presentation">
                <button
                  type="button"
                  className={`jgraph-fill-swatch jgraph-fill-none ${selectedFillColor === 'none' ? 'is-active' : ''}`}
                  title="无填充"
                  onClick={() => onSetFillColor('none')}
                />
                {fillPresetsFor(darkMode).map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`jgraph-fill-swatch ${selectedFillColor === c.value ? 'is-active' : ''}`}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                    onClick={() => onSetFillColor(c.value)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
      <div className="jgraph-tool-sep" />
      <button
        type="button"
        className="jgraph-tool-btn"
        title="放大（⌘滚轮）"
        onClick={onZoomIn}
      >
        <ZoomIn size={16} />
      </button>
      <button
        type="button"
        className="jgraph-tool-btn"
        title="缩小（⌘滚轮）"
        onClick={onZoomOut}
      >
        <ZoomOut size={16} />
      </button>
      <button
        type="button"
        className="jgraph-tool-btn"
        title="适应画布（双击空白）"
        onClick={onFit}
      >
        <Maximize size={16} />
      </button>
      {/* 更多菜单：收纳低频开关 & 导入入口 */}
      <div className="jgraph-dropdown" ref={moreMenuRef}>
        <button
          type="button"
          className="jgraph-tool-btn"
          title="更多选项"
          onClick={onToggleMoreMenu}
        >
          <MoreHorizontal size={16} />
        </button>
        {moreMenuOpen && (
          <div className="jgraph-dropdown-menu" role="presentation">
            <button
              type="button"
              className={`jgraph-dropdown-item ${showGrid ? 'is-active' : ''}`}
              title={showGrid ? '隐藏网格' : '显示网格'}
              onClick={onToggleGrid}
            >
              <Grid3x3 size={16} />
              <span>{showGrid ? '隐藏网格' : '显示网格'}</span>
              {showGrid && <Check size={14} className="jgraph-dropdown-check" />}
            </button>
            <button
              type="button"
              className={`jgraph-dropdown-item ${autoActivation ? 'is-active' : ''}`}
              title={
                autoActivation
                  ? '关闭时序图自动附加块'
                  : '开启时序图自动附加块｜时序图连线时自动生成活动块'
              }
              onClick={onToggleAutoActivation}
            >
              <SquareStack size={16} />
              <span>时序图自动附加块</span>
              {autoActivation && <Check size={14} className="jgraph-dropdown-check" />}
            </button>
            <div className="jgraph-dropdown-sep" />
            <button
              type="button"
              className="jgraph-dropdown-item"
              title="导入 Mermaid 图表"
              onClick={onOpenMermaidImport}
            >
              <FileDown size={16} />
              <span>导入 Mermaid</span>
            </button>
            <button
              type="button"
              className="jgraph-dropdown-item"
              title="AI 生成图表"
              onClick={onOpenAiGraphImport}
            >
              <Sparkles size={16} />
              <span>AI 生成图表</span>
            </button>
            <div className="jgraph-dropdown-sep" />
            <button
              type="button"
              className="jgraph-dropdown-item"
              title="导出为 PNG 图片"
              onClick={onExportPng}
            >
              <Download size={16} />
              <span>导出 PNG</span>
            </button>
            <button
              type="button"
              className="jgraph-dropdown-item"
              title="导出为 SVG 矢量图"
              onClick={onExportSvg}
            >
              <Download size={16} />
              <span>导出 SVG</span>
            </button>
            <div className="jgraph-dropdown-sep" />
            <button
              type="button"
              className="jgraph-dropdown-item"
              title="复制为 PNG 图片到剪贴板"
              onClick={onCopyImage}
            >
              <Copy size={16} />
              <span>复制为图片</span>
            </button>
            <button
              type="button"
              className="jgraph-dropdown-item"
              title="复制 SVG 源码到剪贴板"
              onClick={onCopySvg}
            >
              <ClipboardCopy size={16} />
              <span>复制 SVG 代码</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
