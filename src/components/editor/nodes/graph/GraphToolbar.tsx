/**
 * GraphToolbar - 从 GraphCanvas 提取的画图工具栏。
 *
 * 纯 JSX 组件，接收所有数据和回调作为 props。
 * 包含：形状选择菜单、LRM 最近使用、撤销/重做/删除、时序图切换、
 * 标签对齐、填充色选择、缩放控制、更多菜单（网格/自动激活/导入/导出）。
 */

import type { RefObject } from "react";
import {
  Undo2,
  Redo2,
  Trash2,
  MoveRight,
  Reply,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ZoomIn,
  ZoomOut,
  Maximize,
} from "lucide-react";
import { ShapeGlyph } from "./ShapeGlyph";
import { shapeTitleMap } from "./graphShapeMenu";
import { GraphShapesMenu } from "./GraphShapesMenu";
import { GraphFillPopover } from "./GraphFillPopover";
import { GraphMoreMenu } from "./GraphMoreMenu";
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
  onMoreClick: () => void;
  onMoreEnter: () => void;
  onMoreLeave: () => void;
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
    onMoreClick,
    onMoreEnter,
    onMoreLeave,
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
      <GraphShapesMenu
        pendingShape={pendingShape}
        shapesMenuOpen={shapesMenuOpen}
        shapesMenuRef={shapesMenuRef}
        onShapesClick={onShapesClick}
        onShapesEnter={onShapesEnter}
        onShapesLeave={onShapesLeave}
        onSelectShape={onSelectShape}
      />
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
          <GraphFillPopover
            selectedFillColor={selectedFillColor}
            fillPickerOpen={fillPickerOpen}
            fillPickerRef={fillPickerRef}
            onToggleFillPicker={onToggleFillPicker}
            onSetFillColor={onSetFillColor}
            darkMode={darkMode}
          />
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
      {/* 更多菜单：收纳低频开关 & 导入入口（hover 展开） */}
      <GraphMoreMenu
        moreMenuOpen={moreMenuOpen}
        moreMenuRef={moreMenuRef}
        onMoreClick={onMoreClick}
        onMoreEnter={onMoreEnter}
        onMoreLeave={onMoreLeave}
        showGrid={showGrid}
        autoActivation={autoActivation}
        onToggleGrid={onToggleGrid}
        onToggleAutoActivation={onToggleAutoActivation}
        onOpenMermaidImport={onOpenMermaidImport}
        onOpenAiGraphImport={onOpenAiGraphImport}
        onExportPng={onExportPng}
        onExportSvg={onExportSvg}
        onCopyImage={onCopyImage}
        onCopySvg={onCopySvg}
      />
    </div>
  );
}
