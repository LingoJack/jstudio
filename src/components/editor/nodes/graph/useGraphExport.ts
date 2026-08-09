 /**
 * useGraphExport - 从 GraphCanvas 提取的导出 / 缩放 / 导入相关 handlers。
 *
 * 依赖项均为 ref 或 state setter，不引入额外渲染周期，
 * 因此可安全从组件体中剥离。
 */

import { useCallback } from 'react';
import type { RefObject } from 'react';
import { type Graph, type FitPlugin } from '@maxgraph/core';

import { logger } from '../../../../lib/core/logger';
import { saveSvg, saveBlob, svgToPngBlob, copyImageToClipboard, copyTextToClipboard } from '../../../../lib/export/fileExport';
import { toast } from '../../../../lib/core/toast';

import { parseGraphSnapshot } from './graphSnapshot';
import { applySnapshotToGraph } from './graphModel';
import { ZOOM_MIN, ZOOM_MAX } from './graphConstants';

export interface UseGraphExportParams {
  graphRef: RefObject<Graph | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  darkModeRef: RefObject<boolean>;
  showGridRef: RefObject<boolean>;
  exportFitModeRef: RefObject<boolean>;
  applyingRef: RefObject<boolean>;
  lastEmittedRef: RefObject<string>;
  onChangeRef: RefObject<(snapshotJson: string) => void>;
  updateFlowAnimationRef: RefObject<() => void>;
  setMoreMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
}

export function useGraphExport({
  graphRef,
  containerRef,
  darkModeRef,
  showGridRef,
  exportFitModeRef,
  applyingRef,
  lastEmittedRef,
  onChangeRef,
  updateFlowAnimationRef,
  setMoreMenuOpen,
}: UseGraphExportParams) {
  // ── 导出 SVG / PNG ──────────────────────────────────────────────
  // maxGraph 的 SvgCanvas2D 把 view.scale 和 view.translate 烘焙到每个元素的坐标里，
  // 因此克隆 SVG 后必须用「缩放后的包围盒」设置 viewBox，否则坐标系不匹配。

  const buildExportSvg = useCallback((): { svgString: string; width: number; height: number } | null => {
    const container = containerRef.current;
    const graph = graphRef.current;
    if (!container || !graph) return null;

    const svg = container.querySelector('svg');
    if (!svg) return null;

    const clone = svg.cloneNode(true) as SVGSVGElement;

    // maxGraph SVG 内部有 4 个 <g> 子元素：background / draw / overlay / decorator。
    // overlay 和 decorator 包含选择手柄、预览连线等 UI 元素，导出时必须移除。
    const gChildren = clone.querySelectorAll(':scope > g');
    // 保留前两个（background + draw），移除后面的（overlay + decorator）
    for (let i = 2; i < gChildren.length; i++) {
      gChildren[i].remove();
    }

    // 移除连线上的圆点流动装饰 <path>（.jgraph-edge-dot）。
    // 它的 fill/stroke 完全由 vscode-theme.css 控制，导出的独立 SVG 没有 CSS，
    // 浏览器默认 fill:black 会把整条连线路径渲染成黑色填充块。
    clone.querySelectorAll('.jgraph-edge-dot').forEach((el) => el.remove());

    // 计算所有 cell 的包围盒（模型坐标 / 未缩放）
    const parent = graph.getDefaultParent();
    const cells = graph.getChildCells(parent);
    const bounds = exportFitModeRef.current
      ? graph.getBoundingBoxFromGeometry(cells, true)
      : null;

    const padding = 20;
    let width: number;
    let height: number;
    let vx = 0;
    let vy = 0;

    // view 的 scale 和 translate 已被 SvgCanvas2D 烘焙到元素坐标中，
    // 因此 viewBox 也必须用缩放后的坐标。
    const view = graph.getView();
    const scale = view.scale;
    const tx = view.translate.x * scale;
    const ty = view.translate.y * scale;

    if (bounds) {
      // 自适应模式：按所有 cell 的包围盒导出，加 padding 留白。
      vx = bounds.x * scale + tx - padding;
      vy = bounds.y * scale + ty - padding;
      width = bounds.width * scale + padding * 2;
      height = bounds.height * scale + padding * 2;
      clone.setAttribute('viewBox', `${vx} ${vy} ${width} ${height}`);
    } else {
      // 视窗模式（或无内容）：按容器可见区域导出，所见即所得。
      // SVG 内容的坐标已是屏幕坐标，(0,0) 即容器左上角。
      width = container.clientWidth;
      height = container.clientHeight;
      clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // 必须整体移除 style（maxGraph 在根节点留有 left/top/min-width/min-height 等
    // 内联样式）。WKWebView 把带这些样式的 SVG 栅格化为图片时，会把它当作
    // 定位元素计算固有尺寸，导致内容纵向被拉伸约 20%（Chromium 无此问题）。
    clone.removeAttribute('style');

    // 网格背景注入：maxGraph 的网格是 CSS background-image 画在容器 <div> 上的，
    // 克隆 SVG 时不会带过去。当用户开启了网格（showGrid）时，需要在 SVG 内部
    // 用 <pattern> + <rect> 复刻同样的 10px 点阵网格，使导出图片与画布一致。
    if (showGridRef.current) {
      const dark = darkModeRef.current;
      const gridColor = dark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(0,0,0,0.035)';
      const gridSize = 10;

      const ns = 'http://www.w3.org/2000/svg';
      const defs = document.createElementNS(ns, 'defs');
      const pattern = document.createElementNS(ns, 'pattern');
      pattern.setAttribute('id', 'jgraph-export-grid');
      pattern.setAttribute('width', String(gridSize));
      pattern.setAttribute('height', String(gridSize));
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', `M ${gridSize} 0 L 0 0 0 ${gridSize}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', gridColor);
      path.setAttribute('stroke-width', '1');
      pattern.appendChild(path);
      defs.appendChild(pattern);

      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', String(vx));
      rect.setAttribute('y', String(vy));
      rect.setAttribute('width', String(width));
      rect.setAttribute('height', String(height));
      rect.setAttribute('fill', 'url(#jgraph-export-grid)');

      // 插入到最前面，确保网格在最底层（所有 <g> 之前）。
      clone.insertBefore(rect, clone.firstChild);
      clone.insertBefore(defs, rect);
    }

    const svgString = new XMLSerializer().serializeToString(clone);
    return { svgString, width, height };
  }, [containerRef, graphRef, darkModeRef, showGridRef, exportFitModeRef]);

  const handleExportSvg = useCallback(() => {
    const result = buildExportSvg();
    if (!result) return;
    saveSvg(result.svgString, `diagram-${Date.now()}.svg`).catch((err) => {
      logger.error('[GraphCanvas]', `SVG export failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    setMoreMenuOpen(false);
  }, [buildExportSvg, setMoreMenuOpen]);

  const handleExportPng = useCallback(async () => {
    const result = buildExportSvg();
    if (!result) return;
    try {
      const bg = darkModeRef.current ? '#1e1e1e' : '#ffffff';
      const blob = await svgToPngBlob(result.svgString, result.width, result.height, bg);
      await saveBlob(blob, `diagram-${Date.now()}.png`, 'PNG', ['png']);
    } catch (err) {
      logger.error('[GraphCanvas]', `PNG export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setMoreMenuOpen(false);
  }, [buildExportSvg, darkModeRef, setMoreMenuOpen]);

  const handleCopyImage = useCallback(async () => {
    const result = buildExportSvg();
    if (!result) return;
    try {
      const bg = darkModeRef.current ? '#1e1e1e' : '#ffffff';
      const blob = await svgToPngBlob(result.svgString, result.width, result.height, bg);
      await copyImageToClipboard(blob);
      toast.success('图片已复制到剪贴板');
    } catch (err) {
      logger.error('[GraphCanvas]', `Copy image failed: ${err instanceof Error ? err.message : String(err)}`);
      toast.error('复制失败');
    }
    setMoreMenuOpen(false);
  }, [buildExportSvg, darkModeRef, setMoreMenuOpen]);

  const handleCopySvg = useCallback(() => {
    const result = buildExportSvg();
    if (!result) return;
    copyTextToClipboard(result.svgString)
      .then(() => toast.success('SVG 代码已复制到剪贴板'))
      .catch((err) => {
        logger.error('[GraphCanvas]', `Copy SVG failed: ${err instanceof Error ? err.message : String(err)}`);
        toast.error('复制失败');
      });
    setMoreMenuOpen(false);
  }, [buildExportSvg, setMoreMenuOpen]);

  const handleZoomIn = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || graph.view.scale >= ZOOM_MAX) return;
    graph.zoomIn();
  }, [graphRef]);

  const handleZoomOut = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || graph.view.scale <= ZOOM_MIN) return;
    graph.zoomOut();
  }, [graphRef]);

  // 自适应：有内容则 fitCenter 全图，无内容则回到 100%。
  const handleFit = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const hasCells = graph.getChildVertices(graph.getDefaultParent()).length > 0;
    if (hasCells) {
      graph.getPlugin<FitPlugin>('fit')?.fitCenter({ margin: 24 });
    } else {
      graph.zoomActual();
    }
  }, [graphRef]);

  // 把导入的快照应用到画板--Mermaid 导入与 AI 生成共用。
  // parse -> batchUpdate 灌入 -> fitCenter 自适应 -> 同步 lastEmitted/onChange。
  const applyImportedSnapshot = useCallback((snapshotJson: string) => {
    const graph = graphRef.current;
    if (!graph) return;
    const parsed = parseGraphSnapshot(snapshotJson);
    applyingRef.current = true;
    try {
      graph.batchUpdate(() => {
        applySnapshotToGraph(graph, parsed, darkModeRef.current);
      });
      // 导入后自适应显示
      const hasCells = graph.getChildVertices(graph.getDefaultParent()).length > 0;
      if (hasCells) {
        graph.getPlugin<FitPlugin>('fit')?.fitCenter({ margin: 24 });
      }
      lastEmittedRef.current = snapshotJson;
      onChangeRef.current(snapshotJson);
      // 导入后根据边数决定是否开启动画。
      updateFlowAnimationRef.current();
    } finally {
      applyingRef.current = false;
    }
  }, [graphRef, applyingRef, darkModeRef, lastEmittedRef, onChangeRef, updateFlowAnimationRef]);

  // Mermaid 导入处理
  const handleMermaidImport = useCallback(
    (snapshotJson: string) => applyImportedSnapshot(snapshotJson),
    [applyImportedSnapshot],
  );

  // AI 生成图表导入处理
  const handleAiGraphImport = useCallback(
    (snapshotJson: string) => applyImportedSnapshot(snapshotJson),
    [applyImportedSnapshot],
  );

  return {
    buildExportSvg,
    handleExportSvg,
    handleExportPng,
    handleCopyImage,
    handleCopySvg,
    handleZoomIn,
    handleZoomOut,
    handleFit,
    applyImportedSnapshot,
    handleMermaidImport,
    handleAiGraphImport,
  };
}
