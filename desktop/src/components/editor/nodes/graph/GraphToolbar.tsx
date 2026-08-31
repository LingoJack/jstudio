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
  Contrast,
  Braces,
  FlipVertical2,
} from "lucide-react";
import { ShapeGlyph } from "./ShapeGlyph";
import { shapeTitleMap } from "./shapeMenuData";
import { GraphShapesMenu } from "./GraphShapesMenu";
import { GraphFillPopover } from "./GraphFillPopover";
import { GraphMoreMenu } from "./GraphMoreMenu";
import type { GraphNodeShape, LabelAlign } from "./graphSnapshot";
import type { MindmapScheme } from "../../../../lib/editor/extensions/diagramExtension";

export interface GraphToolbarProps {
  // Shape menu
  pendingShape: GraphNodeShape | null;
  pendingBatchCount: number;
  recentShapes: GraphNodeShape[];
  shapesMenuOpen: boolean;
  shapesMenuRef: RefObject<HTMLDivElement | null>;
  onShapesClick: () => void;
  onShapesEnter: () => void;
  onShapesLeave: () => void;
  onSelectShape: (shape: GraphNodeShape, metaKey: boolean) => void;

  // Undo / Redo / Delete
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;

  // 花括号分组（选中 >=1 个 vertex 时显示）
  canAddBrace: boolean;
  onAddBrace: () => void;
  // 花括号翻转朝向（选中花括号时显示）
  braceSelected: boolean;
  onFlipBrace: () => void;

  // Sequence diagram
  selectedSeqEdge: "call" | "return" | null;
  onToggleSeqMessage: () => void;

  // Mindmap color scheme toggle (shown only when a topic node is selected)
  selectedMindmapTopic: boolean;
  mindmapScheme: MindmapScheme;
  onToggleMindmapScheme: () => void;

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
  exportFitMode: boolean;
  onToggleExportFitMode: () => void;
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
    pendingBatchCount,
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
    canAddBrace,
    onAddBrace,
    braceSelected,
    onFlipBrace,
    selectedSeqEdge,
    onToggleSeqMessage,
    selectedMindmapTopic,
    mindmapScheme,
    onToggleMindmapScheme,
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
    exportFitMode,
    onToggleExportFitMode,
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
        pendingBatchCount={pendingBatchCount}
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
              className={`jgraph-tool-btn ${pendingShape === shape ? "is-active" : ""}`}
              title={`${shapeTitleMap.get(shape) ?? shape}｜点击后在画布拖拽划定大小`}
              onClick={(e) => onSelectShape(shape, e.metaKey || e.ctrlKey)}
            >
              <ShapeGlyph shape={shape} />
              {shape === pendingShape &&
                !shape.startsWith("edge-") &&
                pendingBatchCount > 1 && (
                  <span
                    className="jgraph-shapes-badge"
                    aria-label={`批量计数 ${pendingBatchCount}`}
                  >
                    ×{pendingBatchCount}
                  </span>
                )}
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
      {canAddBrace && (
        <>
          <div className="jgraph-tool-sep" />
          <button
            type="button"
            className="jgraph-tool-btn"
            title="为选中图形添加花括号分组（自动按选区方向放置，被占时自动换侧）"
            onClick={onAddBrace}
          >
            <Braces size={16} />
          </button>
        </>
      )}
      {braceSelected && (
        <>
          <div className="jgraph-tool-sep" />
          <button
            type="button"
            className="jgraph-tool-btn"
            title="翻转花括号朝向（上/下、左/右互换；位置不变，可拖动归位）"
            onClick={onFlipBrace}
          >
            <FlipVertical2 size={16} />
          </button>
        </>
      )}
      {selectedSeqEdge && (
        <>
          <div className="jgraph-tool-sep" />
          <button
            type="button"
            className="jgraph-tool-btn"
            title={
              selectedSeqEdge === "return"
                ? "切换为调用消息（实线）"
                : "切换为返回消息（虚线）"
            }
            onClick={onToggleSeqMessage}
          >
            {selectedSeqEdge === "return" ? (
              <MoveRight size={16} />
            ) : (
              <Reply size={16} />
            )}
          </button>
        </>
      )}
      {selectedMindmapTopic && (
        <>
          <div className="jgraph-tool-sep" />
          <button
            type="button"
            className={`jgraph-tool-btn ${mindmapScheme === "neon" ? "is-active" : ""}`}
            title={
              mindmapScheme === "neon"
                ? "思维导图：暗夜霓虹（M）｜点击切换为极简黑白（N）"
                : "思维导图：极简黑白（N）｜点击切换为暗夜霓虹（M）"
            }
            onClick={onToggleMindmapScheme}
          >
            <Contrast size={16} />
          </button>
        </>
      )}
      {selectedLabelAlign && (
        <>
          <div className="jgraph-tool-sep" />
          <button
            type="button"
            className={`jgraph-tool-btn ${selectedLabelAlign === "left" ? "is-active" : ""}`}
            title="文字左对齐"
            onClick={() => onSetLabelAlign("left")}
          >
            <AlignLeft size={16} />
          </button>
          <button
            type="button"
            className={`jgraph-tool-btn ${selectedLabelAlign === "center" ? "is-active" : ""}`}
            title="文字居中对齐"
            onClick={() => onSetLabelAlign("center")}
          >
            <AlignCenter size={16} />
          </button>
          <button
            type="button"
            className={`jgraph-tool-btn ${selectedLabelAlign === "right" ? "is-active" : ""}`}
            title="文字右对齐"
            onClick={() => onSetLabelAlign("right")}
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
        exportFitMode={exportFitMode}
        onToggleExportFitMode={onToggleExportFitMode}
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
