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
} from './graphTheme';
import { styleToNodeShape } from './graphModel';

export interface UseGraphThemeParams {
  graphRef: RefObject<Graph | null>;
  darkModeRef: RefObject<boolean>;
  /** 暗色模式 prop（作为 effect 依赖触发重绘） */
  darkMode: boolean;
}

export function useGraphTheme({ graphRef, darkModeRef, darkMode }: UseGraphThemeParams) {
  // 主题色刷新：暗色切换 / 同模式下切换主题（jstudio-light -> ink-light）都走这条路径。
  // 读 darkModeRef.current 以保证事件回调里拿到最新值（事件触发时组件未必重渲染）。
  const applyThemeColors = useCallback(() => {
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
    graph.batchUpdate(() => {
      const parent = graph.getDefaultParent();
      const cells = graph.getChildCells(parent, true, true);
      for (const cell of cells) {
        const oldStyle = (cell.getStyle() as CellStyle) ?? {};
        if (cell.isVertex()) {
          const shape = styleToNodeShape(oldStyle);
          // 思维导图节点：按填充色推断深度，重新应用对应深度的全套配色。
          // 用户通过取色器自定义了颜色时（mindmapDepthFromFill 返回 null），
          // 回退到下方的通用逻辑。
          if (shape === 'topic') {
            const depth = mindmapDepthFromFill(oldStyle.fillColor);
            if (depth !== null) {
              const mm = mindmapStyleForDepth(depth, dark);
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
          graph.getDataModel().setStyle(cell, {
            ...oldStyle,
            strokeColor: getEdgeColor(dark),
            // 边标签底色与画布一致，字色跟随主题。
            fontColor: getFontColor(dark),
          });
        }
      }
    });

    // 刷新视图让更改生效
    graph.getView().validate();
    graph.refresh();
  }, [graphRef, darkModeRef]);

  // 暗色模式切换时刷新所有跟随主题的颜色
  useEffect(() => {
    applyThemeColors();
  }, [darkMode, applyThemeColors]);

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
