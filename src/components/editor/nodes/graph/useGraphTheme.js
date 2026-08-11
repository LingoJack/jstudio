import { useCallback, useEffect } from "react";
import {
  HandleConfig,
  VertexHandlerConfig,
  EdgeHandlerConfig,
  ImageBox
} from "@maxgraph/core";
import {
  getSelectionColor,
  getHandleFillColor,
  getHandleStrokeColor,
  getConnectionPointColor,
  getFontColor,
  getEdgeColor,
  paletteFor,
  fontColorFor,
  mapFillColor,
  createConnectionPointSVG,
  CONNECTION_POINT_SIZE,
  mindmapStyleForDepth,
  mindmapDepthFromFill,
  mindmapMetaFromStyle,
  mindmapEdgeStrokeColor,
  mindmapEdgeStrokeWidth,
  legacyMindmapStyleForDepth,
  DEFAULT_MINDMAP_SCHEME
} from "./graphTheme";
import { styleToNodeShape } from "./graphModel";
function useGraphTheme({ graphRef, darkModeRef, darkMode, mindmapScheme }) {
  const applyThemeColors = useCallback(
    (schemeOverride) => {
      const graph = graphRef.current;
      if (!graph) return;
      const dark = darkModeRef.current;
      const color = getSelectionColor(dark);
      VertexHandlerConfig.selectionColor = color;
      EdgeHandlerConfig.selectionColor = color;
      HandleConfig.fillColor = getHandleFillColor(dark);
      HandleConfig.strokeColor = getHandleStrokeColor(dark);
      EdgeHandlerConfig.connectFillColor = getHandleFillColor(dark);
      const connectionHandler = graph.getPlugin("ConnectionHandler");
      if (connectionHandler?.constraintHandler) {
        connectionHandler.constraintHandler.pointImage = new ImageBox(
          createConnectionPointSVG(dark),
          CONNECTION_POINT_SIZE,
          CONNECTION_POINT_SIZE
        );
        connectionHandler.constraintHandler.highlightColor = getConnectionPointColor(dark);
      }
      const selectionHandler = graph.getPlugin("SelectionHandler");
      if (selectionHandler) {
        selectionHandler.previewColor = color;
      }
      const defaultPal = paletteFor("rectangle", dark);
      const vertexDefault = graph.getStylesheet().getDefaultVertexStyle();
      vertexDefault.fillColor = defaultPal.fill;
      vertexDefault.strokeColor = defaultPal.stroke;
      vertexDefault.fontColor = getFontColor(dark);
      const edgeDefault = graph.getStylesheet().getDefaultEdgeStyle();
      edgeDefault.strokeColor = getEdgeColor(dark);
      graph.batchUpdate(() => {
        const parent = graph.getDefaultParent();
        const cells = graph.getChildCells(parent, true, true);
        const branchIndexMap = /* @__PURE__ */ new Map();
        const siblingCount = /* @__PURE__ */ new Map();
        for (const cell of cells) {
          if (!cell.isVertex()) continue;
          const s = cell.getStyle() ?? {};
          if (styleToNodeShape(s) !== "topic") continue;
          const m = mindmapMetaFromStyle(s);
          if (!m || m.depth !== 1) continue;
          const inEdges = graph.getIncomingEdges(cell, parent);
          const rootCell = inEdges[0]?.getTerminal(true);
          const rootId = String(rootCell?.getId() ?? "");
          const idx = siblingCount.get(rootId) ?? 0;
          branchIndexMap.set(String(cell.getId() ?? ""), idx);
          siblingCount.set(rootId, idx + 1);
        }
        for (const cell of cells) {
          const oldStyle = cell.getStyle() ?? {};
          if (cell.isVertex()) {
            const shape = styleToNodeShape(oldStyle);
            if (shape === "topic") {
              const meta = mindmapMetaFromStyle(oldStyle);
              const effectiveScheme = schemeOverride ?? meta?.scheme ?? DEFAULT_MINDMAP_SCHEME;
              const depth = meta?.depth ?? 0;
              const branchIndex = meta?.branchIndex ?? 0;
              if (meta || schemeOverride) {
                const mm = mindmapStyleForDepth(depth, dark, effectiveScheme, branchIndex);
                graph.getDataModel().setStyle(cell, {
                  ...oldStyle,
                  fillColor: mm.fillColor,
                  strokeColor: mm.strokeColor,
                  fontColor: mm.fontColor,
                  strokeWidth: mm.strokeWidth,
                  fontSize: mm.fontSize,
                  fontStyle: mm.fontStyle,
                  mmScheme: effectiveScheme,
                  mmBranch: branchIndex,
                  mmDepth: depth
                });
                continue;
              }
              const legacyDepth = mindmapDepthFromFill(oldStyle.fillColor);
              if (legacyDepth !== null) {
                const mm = legacyMindmapStyleForDepth(legacyDepth, dark);
                graph.getDataModel().setStyle(cell, {
                  ...oldStyle,
                  fillColor: mm.fillColor,
                  strokeColor: mm.strokeColor,
                  fontColor: mm.fontColor,
                  strokeWidth: mm.strokeWidth,
                  fontSize: mm.fontSize,
                  fontStyle: mm.fontStyle
                });
                continue;
              }
            }
            const pal = paletteFor(shape, dark);
            const oldFill = oldStyle.fillColor;
            const newFill = oldFill && oldFill !== "none" ? mapFillColor(oldFill, dark) : pal.fill;
            const newFontColor = fontColorFor(newFill, dark);
            graph.getDataModel().setStyle(cell, {
              ...oldStyle,
              fillColor: newFill,
              strokeColor: pal.stroke,
              fontColor: newFontColor
            });
          } else if (cell.isEdge()) {
            const oldRecord = oldStyle;
            const hasMM = oldStyle.edgeStyle === "mindmapCurveEdgeStyle" || typeof oldRecord.mmDepth === "number";
            if (hasMM) {
              const target = cell.getTerminal(false);
              const targetStyle = target ? graph.getCurrentCellStyle(target) : void 0;
              const meta = mindmapMetaFromStyle(targetStyle);
              const scheme = schemeOverride ?? meta?.scheme ?? DEFAULT_MINDMAP_SCHEME;
              const depth = typeof oldRecord.mmDepth === "number" ? oldRecord.mmDepth : meta?.depth ?? 1;
              const branchIndex = typeof oldRecord.mmBranch === "number" ? oldRecord.mmBranch : meta?.branchIndex ?? 0;
              graph.getDataModel().setStyle(cell, {
                ...oldStyle,
                strokeColor: mindmapEdgeStrokeColor(scheme, dark, depth, branchIndex),
                strokeWidth: mindmapEdgeStrokeWidth(scheme, depth),
                mmScheme: scheme,
                mmBranch: branchIndex,
                mmDepth: depth,
                // 边标签：字号 / 字色 / 背景色
                fontColor: getFontColor(dark)
              });
            } else {
              graph.getDataModel().setStyle(cell, {
                ...oldStyle,
                strokeColor: getEdgeColor(dark),
                // 边标签底色与画布一致，字色跟随主题。
                fontColor: getFontColor(dark)
              });
            }
          }
        }
      });
      graph.getView().validate();
      graph.refresh();
    },
    [graphRef, darkModeRef]
  );
  useEffect(() => {
    applyThemeColors();
  }, [darkMode, applyThemeColors]);
  useEffect(() => {
    applyThemeColors(mindmapScheme);
  }, [mindmapScheme, applyThemeColors]);
  useEffect(() => {
    const handler = () => applyThemeColors();
    window.addEventListener("apptheme-change", handler);
    return () => window.removeEventListener("apptheme-change", handler);
  }, [applyThemeColors]);
  return { applyThemeColors };
}
export {
  useGraphTheme
};
