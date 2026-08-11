import { useCallback } from "react";
import { logger } from "../../../../lib/core/logger";
import { saveSvg, saveBlob, svgToPngBlob, copyImageToClipboard, copyTextToClipboard } from "../../../../lib/export/fileExport";
import { toast } from "../../../../lib/core/toast";
import { parseGraphSnapshot } from "./graphSnapshot";
import { applySnapshotToGraph } from "./graphModel";
import { ZOOM_MIN, ZOOM_MAX } from "./graphConstants";
function useGraphExport({
  graphRef,
  containerRef,
  darkModeRef,
  showGridRef,
  exportFitModeRef,
  applyingRef,
  lastEmittedRef,
  onChangeRef,
  updateFlowAnimationRef,
  setMoreMenuOpen
}) {
  const buildExportSvg = useCallback(() => {
    const container = containerRef.current;
    const graph = graphRef.current;
    if (!container || !graph) return null;
    const svg = container.querySelector("svg");
    if (!svg) return null;
    const clone = svg.cloneNode(true);
    const gChildren = clone.querySelectorAll(":scope > g");
    for (let i = 2; i < gChildren.length; i++) {
      gChildren[i].remove();
    }
    clone.querySelectorAll(".jgraph-edge-dot").forEach((el) => el.remove());
    const parent = graph.getDefaultParent();
    const cells = graph.getChildCells(parent);
    const bounds = exportFitModeRef.current ? graph.getBoundingBoxFromGeometry(cells, true) : null;
    const padding = 20;
    let width;
    let height;
    let vx = 0;
    let vy = 0;
    const view = graph.getView();
    const scale = view.scale;
    const tx = view.translate.x * scale;
    const ty = view.translate.y * scale;
    if (bounds) {
      vx = bounds.x * scale + tx - padding;
      vy = bounds.y * scale + ty - padding;
      width = bounds.width * scale + padding * 2;
      height = bounds.height * scale + padding * 2;
      clone.setAttribute("viewBox", `${vx} ${vy} ${width} ${height}`);
    } else {
      width = container.clientWidth;
      height = container.clientHeight;
      clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.removeAttribute("style");
    if (showGridRef.current) {
      const dark = darkModeRef.current;
      const gridColor = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.035)";
      const gridSize = 10;
      const ns = "http://www.w3.org/2000/svg";
      const defs = document.createElementNS(ns, "defs");
      const pattern = document.createElementNS(ns, "pattern");
      pattern.setAttribute("id", "jgraph-export-grid");
      pattern.setAttribute("width", String(gridSize));
      pattern.setAttribute("height", String(gridSize));
      pattern.setAttribute("patternUnits", "userSpaceOnUse");
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", `M ${gridSize} 0 L 0 0 0 ${gridSize}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", gridColor);
      path.setAttribute("stroke-width", "1");
      pattern.appendChild(path);
      defs.appendChild(pattern);
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", String(vx));
      rect.setAttribute("y", String(vy));
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", String(height));
      rect.setAttribute("fill", "url(#jgraph-export-grid)");
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
      logger.error("[GraphCanvas]", `SVG export failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    setMoreMenuOpen(false);
  }, [buildExportSvg, setMoreMenuOpen]);
  const handleExportPng = useCallback(async () => {
    const result = buildExportSvg();
    if (!result) return;
    try {
      const bg = darkModeRef.current ? "#1e1e1e" : "#ffffff";
      const blob = await svgToPngBlob(result.svgString, result.width, result.height, bg);
      await saveBlob(blob, `diagram-${Date.now()}.png`, "PNG", ["png"]);
    } catch (err) {
      logger.error("[GraphCanvas]", `PNG export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setMoreMenuOpen(false);
  }, [buildExportSvg, darkModeRef, setMoreMenuOpen]);
  const handleCopyImage = useCallback(async () => {
    const result = buildExportSvg();
    if (!result) return;
    try {
      const bg = darkModeRef.current ? "#1e1e1e" : "#ffffff";
      const blob = await svgToPngBlob(result.svgString, result.width, result.height, bg);
      await copyImageToClipboard(blob);
      toast.success("\u56FE\u7247\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F");
    } catch (err) {
      logger.error("[GraphCanvas]", `Copy image failed: ${err instanceof Error ? err.message : String(err)}`);
      toast.error("\u590D\u5236\u5931\u8D25");
    }
    setMoreMenuOpen(false);
  }, [buildExportSvg, darkModeRef, setMoreMenuOpen]);
  const handleCopySvg = useCallback(() => {
    const result = buildExportSvg();
    if (!result) return;
    copyTextToClipboard(result.svgString).then(() => toast.success("SVG \u4EE3\u7801\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F")).catch((err) => {
      logger.error("[GraphCanvas]", `Copy SVG failed: ${err instanceof Error ? err.message : String(err)}`);
      toast.error("\u590D\u5236\u5931\u8D25");
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
  const handleFit = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const hasCells = graph.getChildVertices(graph.getDefaultParent()).length > 0;
    if (hasCells) {
      graph.getPlugin("fit")?.fitCenter({ margin: 24 });
    } else {
      graph.zoomActual();
    }
  }, [graphRef]);
  const applyImportedSnapshot = useCallback((snapshotJson) => {
    const graph = graphRef.current;
    if (!graph) return;
    const parsed = parseGraphSnapshot(snapshotJson);
    applyingRef.current = true;
    try {
      graph.batchUpdate(() => {
        applySnapshotToGraph(graph, parsed, darkModeRef.current);
      });
      const hasCells = graph.getChildVertices(graph.getDefaultParent()).length > 0;
      if (hasCells) {
        graph.getPlugin("fit")?.fitCenter({ margin: 24 });
      }
      lastEmittedRef.current = snapshotJson;
      onChangeRef.current(snapshotJson);
      updateFlowAnimationRef.current();
    } finally {
      applyingRef.current = false;
    }
  }, [graphRef, applyingRef, darkModeRef, lastEmittedRef, onChangeRef, updateFlowAnimationRef]);
  const handleMermaidImport = useCallback(
    (snapshotJson) => applyImportedSnapshot(snapshotJson),
    [applyImportedSnapshot]
  );
  const handleAiGraphImport = useCallback(
    (snapshotJson) => applyImportedSnapshot(snapshotJson),
    [applyImportedSnapshot]
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
    handleAiGraphImport
  };
}
export {
  useGraphExport
};
