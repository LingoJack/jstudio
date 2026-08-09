/**
 * Pure utility functions for GraphCanvas - no React dependencies.
 *
 * Extracted from GraphCanvas.tsx to keep the component focused on
 * orchestration rather than geometry / id generation helpers.
 */

import type { CellState, CellStyle } from '@maxgraph/core';
import {
  getEdgeColor,
  getFontColor,
  getLabelBackgroundColor,
  SHAPE_STROKE_WIDTH,
  SHAPE_FONT_SIZE,
  ARROW_END_SIZE,
} from './graphTheme';
import { MINDMAP_EDGE_STYLE } from './mindmapLayout';

/** 边数超过此阈值时自动关闭连线流动动画，保证大图流畅。 */
export const FLOW_ANIMATION_THRESHOLD = 20;

/** 边框命中容差（屏幕像素），转换为图坐标后使用 */
export const BORDER_TOLERANCE_PX = 8;

/**
 * 判断点 (x, y) 是否落在 cell state 的边框上（而非内部）。
 * 原理：点在外扩矩形（bounds ± tol）内，且不在内缩矩形内部。
 * 支持旋转：将点击点逆旋转到图形局部坐标系后再做矩形判定。
 */
export function isOnBorder(state: CellState, x: number, y: number, tol: number): boolean {
  let px = x;
  let py = y;
  const rotation = state.style?.rotation;
  if (rotation) {
    const alpha = (rotation * Math.PI) / 180;
    const cos = Math.cos(-alpha);
    const sin = Math.sin(-alpha);
    const cx = state.getCenterX();
    const cy = state.getCenterY();
    const dx = x - cx;
    const dy = y - cy;
    px = dx * cos - dy * sin + cx;
    py = dx * sin + dy * cos + cy;
  }
  const inOuter =
    px >= state.x - tol &&
    px <= state.x + state.width + tol &&
    py >= state.y - tol &&
    py <= state.y + state.height + tol;
  if (!inOuter) return false;
  const inInner =
    px > state.x + tol &&
    px < state.x + state.width - tol &&
    py > state.y + tol &&
    py < state.y + state.height - tol;
  return !inInner;
}

/** 思维导图连线样式：无箭头贝塞尔曲线，跟随主题连线色。 */
export function mindmapEdgeStyle(dark: boolean): CellStyle {
  return {
    edgeStyle: MINDMAP_EDGE_STYLE,
    curved: true,
    endArrow: 'none',
    startArrow: 'none',
    endSize: ARROW_END_SIZE,
    strokeColor: getEdgeColor(dark),
    strokeWidth: SHAPE_STROKE_WIDTH,
    fontSize: SHAPE_FONT_SIZE,
    fontColor: getFontColor(dark),
    labelBackgroundColor: getLabelBackgroundColor(dark),
  };
}

/** 生成唯一 cell id。 */
export function nextCellId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
