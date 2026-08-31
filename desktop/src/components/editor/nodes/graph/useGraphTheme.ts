/**
 * useGraphTheme - 从 GraphCanvas 提取的主题色刷新逻辑。
 *
 * 负责暗色模式切换 & 同模式下切换主题（jstudio-light -> ink-light）时
 * 刷新画板上所有跟随主题的颜色（选中框、手柄、连接点、cell 填充/描边/字色）。
 */

import { useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import {
  type Graph,
  HandleConfig,
  VertexHandlerConfig,
  EdgeHandlerConfig,
  ImageBox,
  type CellStyle,
  type ConnectionHandler,
  type SelectionHandler,
} from '@maxgraph/core';

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
  DEFAULT_MINDMAP_SCHEME,
  type MindmapScheme,
} from './graphTheme';
import { styleToNodeShape } from './graphModel';

export interface UseGraphThemeParams {
  graphRef: RefObject<Graph | null>;
  darkModeRef: RefObject<boolean>;
  /** 暗色模式 prop（作为 effect 依赖触发重绘） */
  darkMode: boolean;
  /** 当前思维导图配色方案（块属性）。切换时强制重写所有 topic cell 的标记 + 配色。 */
  mindmapScheme: MindmapScheme;
}

export function useGraphTheme({ graphRef, darkModeRef, darkMode, mindmapScheme }: UseGraphThemeParams) {
  /**
   * 主题色刷新：暗色切换 / 同模式下切换主题（jstudio-light -> ink-light）/
   * 思维导图方案切换 都走这条路径。
   *
   * @param schemeOverride 若提供，强制把所有 topic cell 的 mmScheme 标记改成此值
   *                        并重新应用配色（用户点 toggle 切换方案时用）。
   *                        不提供则保留每个 cell 原有的 mmScheme。
   */
  const applyThemeColors = useCallback(
    (schemeOverride?: MindmapScheme) => {
      const graph = graphRef.current;
      if (!graph) return;
      const dark = darkModeRef.current;

      const color = getSelectionColor(dark);

      // 更新选中框颜色（节点 + 连线）
      VertexHandlerConfig.selectionColor = color;
      EdgeHandlerConfig.selectionColor = color;

      // 更新手柄颜色
      HandleConfig.fillColor = getHandleFillColor(dark);
      HandleConfig.strokeColor = getHandleStrokeColor(dark);
      EdgeHandlerConfig.connectFillColor = getHandleFillColor(dark);

      // 更新连接点样式（maxGraph 中为 ConstraintHandler 实例属性）
      const connectionHandler = graph.getPlugin<ConnectionHandler>('ConnectionHandler');
      if (connectionHandler?.constraintHandler) {
        connectionHandler.constraintHandler.pointImage = new ImageBox(
          createConnectionPointSVG(dark),
          CONNECTION_POINT_SIZE,
          CONNECTION_POINT_SIZE,
        );
        connectionHandler.constraintHandler.highlightColor = getConnectionPointColor(dark);
      }

      // 更新拖动预览颜色（SelectionHandler）
      const selectionHandler = graph.getPlugin<SelectionHandler>('SelectionHandler');
      if (selectionHandler) {
        selectionHandler.previewColor = color;
      }

      // 更新默认样式（影响新建图形）
      const defaultPal = paletteFor('rectangle', dark);
      const vertexDefault = graph.getStylesheet().getDefaultVertexStyle();
      vertexDefault.fillColor = defaultPal.fill;
      vertexDefault.strokeColor = defaultPal.stroke;
      vertexDefault.fontColor = getFontColor(dark);

      const edgeDefault = graph.getStylesheet().getDefaultEdgeStyle();
      edgeDefault.strokeColor = getEdgeColor(dark);

      // 更新已存在 cell 的样式：让画板上的图形跟着主题变色。
      // maxGraph 在 cell 创建时把样式烘焙到 cell 上，不会从默认 stylesheet 重新解析，
      // 因此切换主题时必须主动遍历刷新。仅刷新颜色（fill/stroke/font），
      // 保留结构属性（shape/rounded/edgeStyle/arrows 等）。
      //
      // 思维导图节点（topic）有三条路径：
      //   1. schemeOverride 提供（用户点 toggle 切方案）：强制重写 mmScheme 标记 + 配色
      //   2. cell 有 mmScheme 标记：按标记 + 深度 + 分支索引重算配色
      //   3. cell 无 mmScheme 标记（旧靛蓝快照）：回退 legacyMindmapStyleForDepth 保留原配色
      graph.batchUpdate(() => {
        const parent = graph.getDefaultParent();
        const cells = graph.getChildCells(parent, true, true);

        // Pre-pass: reindex depth=1 branches so each sibling gets a unique
        // cycling color. Fixes old snapshots where all branches had
        // branchIndex=0 (due to a spawn bug), causing neon mode to render
        // all branches the same color.
        const branchIndexMap = new Map<string, number>();
        const siblingCount = new Map<string, number>();
        for (const cell of cells) {
          if (!cell.isVertex()) continue;
          const s = (cell.getStyle() as CellStyle) ?? {};
          if (styleToNodeShape(s) !== 'topic') continue;
          const m = mindmapMetaFromStyle(s as Record<string, unknown>);
          if (!m || m.depth !== 1) continue;
          const inEdges = graph.getIncomingEdges(cell, parent);
          const rootCell = inEdges[0]?.getTerminal(true);
          const rootId = String(rootCell?.getId() ?? '');
          const idx = siblingCount.get(rootId) ?? 0;
          branchIndexMap.set(String(cell.getId() ?? ''), idx);
          siblingCount.set(rootId, idx + 1);
        }
        for (const cell of cells) {
          const oldStyle = (cell.getStyle() as CellStyle) ?? {};
          if (cell.isVertex()) {
            const shape = styleToNodeShape(oldStyle);
            if (shape === 'topic') {
              const meta = mindmapMetaFromStyle(oldStyle as Record<string, unknown>);
              const effectiveScheme = schemeOverride ?? meta?.scheme ?? DEFAULT_MINDMAP_SCHEME;
              const depth = meta?.depth ?? 0;
              const branchIndex = meta?.branchIndex ?? 0;

              if (meta || schemeOverride) {
                // 路径 1 / 2：新方案 cell，或强制重写
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
                  mmDepth: depth,
                } as CellStyle);
                continue;
              }

              // 路径 3：旧快照无 mmScheme 标记 → 回退靛蓝配色保留原样
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
                  fontStyle: mm.fontStyle,
                });
                continue;
              }
              // 既无 mmScheme 标记、也不在旧靛蓝色板里（用户自定义色）→ 走通用映射
            }
            const pal = paletteFor(shape, dark);
            // 用户填充色走双套色板映射（已知色 ↔ 对应明暗变体，未知自定义色保留），
            // 避免"深色模式把字刷白、浅色填充保留"导致的白字浅底不可读。
            const oldFill = oldStyle.fillColor;
            const newFill =
              oldFill && oldFill !== 'none' ? mapFillColor(oldFill, dark) : pal.fill;
            // 所有形状按填充亮度自适应字色。
            const newFontColor = fontColorFor(newFill, dark);
            graph.getDataModel().setStyle(cell, {
              ...oldStyle,
              fillColor: newFill,
              strokeColor: pal.stroke,
              fontColor: newFontColor,
            });
          } else if (cell.isEdge()) {
            // 思维导图连线：按 target cell 的 scheme/depth/branch 重算 strokeColor + strokeWidth
            const oldRecord = oldStyle as Record<string, unknown>;
            const hasMM =
              oldStyle.edgeStyle === 'mindmapCurveEdgeStyle' ||
              typeof oldRecord.mmDepth === 'number';
            if (hasMM) {
              const target = cell.getTerminal(false);
              const targetStyle = target
                ? (graph.getCurrentCellStyle(target) as Record<string, unknown>)
                : undefined;
              const meta = mindmapMetaFromStyle(targetStyle);
              const scheme = schemeOverride ?? meta?.scheme ?? DEFAULT_MINDMAP_SCHEME;
              const depth =
                typeof oldRecord.mmDepth === 'number'
                  ? oldRecord.mmDepth
                  : (meta?.depth ?? 1);
              const branchIndex =
                typeof oldRecord.mmBranch === 'number'
                  ? oldRecord.mmBranch
                  : (meta?.branchIndex ?? 0);
              graph.getDataModel().setStyle(cell, {
                ...oldStyle,
                strokeColor: mindmapEdgeStrokeColor(scheme, dark, depth, branchIndex),
                strokeWidth: mindmapEdgeStrokeWidth(scheme, depth),
                mmScheme: scheme,
                mmBranch: branchIndex,
                mmDepth: depth,
                // 边标签：字号 / 字色 / 背景色
                fontColor: getFontColor(dark),
              } as CellStyle);
            } else {
              graph.getDataModel().setStyle(cell, {
                ...oldStyle,
                strokeColor: getEdgeColor(dark),
                // 边标签底色与画布一致，字色跟随主题。
                fontColor: getFontColor(dark),
              });
            }
          }
        }
      });

      // 刷新视图让更改生效
      graph.getView().validate();
      graph.refresh();
    },
    [graphRef, darkModeRef],
  );

  // 暗色模式切换时刷新所有跟随主题的颜色
  useEffect(() => {
    applyThemeColors();
  }, [darkMode, applyThemeColors]);

  // 用户切换思维导图方案（toggle 按钮）：强制重写所有 topic cell 的 mmScheme 标记
  // + 配色。scheme 变化时触发，darkMode 不变。
  useEffect(() => {
    applyThemeColors(mindmapScheme);
  }, [mindmapScheme, applyThemeColors]);

  // 同模式下切换主题（jstudio-light -> ink-light）：applyAppTheme 更新 <html> 上的
  // CSS 变量后派发 'apptheme-change' 事件，这里监听并重新读取 accent 色。
  // darkMode 未变，但 --vscode-focusBorder 已更新，需重新刷一遍连线/选中/连接点。
  useEffect(() => {
    const handler = () => applyThemeColors();
    window.addEventListener('apptheme-change', handler);
    return () => window.removeEventListener('apptheme-change', handler);
  }, [applyThemeColors]);

  return { applyThemeColors };
}
