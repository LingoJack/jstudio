/**
 * GraphMoreMenu - 更多选项下拉菜单（hover 展开）。
 *
 * 抽取自 GraphToolbar。包含触发按钮 + 下拉内容 + 外层 ref 容器。
 * 收纳低频开关（网格 / 时序图自动附加块）和导入导出入口。
 * 交互与 GraphShapesMenu 对齐：悬停展开，离开延迟关闭。
 * 样式沿用 jgraph-dropdown / jgraph-dropdown-menu 自有体系。
 */

import type { RefObject } from "react";
import {
  MoreHorizontal,
  Grid3x3,
  Check,
  SquareStack,
  FileDown,
  Sparkles,
  Download,
  Copy,
  Maximize2,
} from "lucide-react";

export interface GraphMoreMenuProps {
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

export function GraphMoreMenu({
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
}: GraphMoreMenuProps) {
  return (
    <div
      className="jgraph-dropdown"
      ref={moreMenuRef}
      onMouseEnter={onMoreEnter}
      onMouseLeave={onMoreLeave}
    >
      <button
        type="button"
        className="jgraph-tool-btn"
        title="更多选项｜悬停展开"
        onClick={onMoreClick}
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
            className={`jgraph-dropdown-item ${exportFitMode ? 'is-active' : ''}`}
            title={
              exportFitMode
                ? '当前：自适应内容大小。点击切换为按视窗所见即所得'
                : '当前：按视窗所见即所得。点击切换为自适应内容大小'
            }
            onClick={onToggleExportFitMode}
          >
            <Maximize2 size={16} />
            <span>{exportFitMode ? '自适应内容导出' : '视窗所见即所得'}</span>
            {exportFitMode && <Check size={14} className="jgraph-dropdown-check" />}
          </button>
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
            <Copy size={16} />
            <span>复制 SVG 代码</span>
          </button>
        </div>
      )}
    </div>
  );
}
