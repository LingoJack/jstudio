/**
 * Pure utility functions for GraphCanvas - no React dependencies.
 *
 * Extracted from GraphCanvas.tsx to keep the component focused on
 * orchestration rather than geometry / id generation helpers.
 */

import type { CellState, CellStyle } from '@maxgraph/core';
import {
  getFontColor,
  getLabelBackgroundColor,
  SHAPE_FONT_SIZE,
  ARROW_END_SIZE,
  mindmapEdgeStrokeColor,
  mindmapEdgeStrokeWidth,
  type MindmapScheme,
} from './graphTheme';
import { MINDMAP_EDGE_STYLE } from './mindmapLayout';
import {
  BRACE_GAP,
  BRACE_THICKNESS,
  defaultBraceDirection,
} from './graphConstants';
import type { BraceDirection } from './graphSnapshot';

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

/**
 * 思维导图连线样式：无箭头贝塞尔曲线，跟随方案 + 深度 + 分支索引着色。
 *
 * - neon：分支用循环色（紫/绿/琥珀），叶子用父分支色
 * - mono：分支级用主色，叶级用灰色
 *
 * mmBranch/mmDepth 写入 CellStyle 供主题刷新反查。
 */
export function mindmapEdgeStyle(
  dark: boolean,
  scheme: MindmapScheme,
  depth: number,
  branchIndex = 0,
): CellStyle {
  return {
    edgeStyle: MINDMAP_EDGE_STYLE,
    curved: true,
    endArrow: 'none',
    startArrow: 'none',
    endSize: ARROW_END_SIZE,
    strokeColor: mindmapEdgeStrokeColor(scheme, dark, depth, branchIndex),
    strokeWidth: mindmapEdgeStrokeWidth(scheme, depth),
    fontSize: SHAPE_FONT_SIZE,
    fontColor: getFontColor(dark),
    labelBackgroundColor: getLabelBackgroundColor(dark),
    mmBranch: branchIndex,
    mmDepth: depth,
  } as CellStyle;
}

/** 生成唯一 cell id。 */
export function nextCellId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 花括号放置结果。 */
export interface BracePlacement {
  dir: BraceDirection;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 由选区包围盒 + 朝向计算花括号位置（括号在选区对应侧，间隔 BRACE_GAP）。 */
export function computeBracePlacement(
  bounds: RectLike,
  dir: BraceDirection,
): BracePlacement {
  switch (dir) {
    case 'up':
      return {
        dir,
        x: bounds.x,
        y: bounds.y - BRACE_GAP - BRACE_THICKNESS,
        w: bounds.width,
        h: BRACE_THICKNESS,
      };
    case 'left':
      return {
        dir,
        x: bounds.x - BRACE_GAP - BRACE_THICKNESS,
        y: bounds.y,
        w: BRACE_THICKNESS,
        h: bounds.height,
      };
    case 'right':
      return {
        dir,
        x: bounds.x + bounds.width + BRACE_GAP,
        y: bounds.y,
        w: BRACE_THICKNESS,
        h: bounds.height,
      };
    default: // down
      return {
        dir: 'down',
        x: bounds.x,
        y: bounds.y + bounds.height + BRACE_GAP,
        w: bounds.width,
        h: BRACE_THICKNESS,
      };
  }
}

/** 两个矩形是否重叠（含边界相接视为不重叠）。 */
export function rectsOverlap(a: RectLike, b: RectLike): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** 对侧朝向映射（翻转花括号朝向用）。 */
export const OPPOSITE_BRACE_DIRECTION: Record<BraceDirection, BraceDirection> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/**
 * 选择花括号朝向：优先默认侧（宽选区 → down，高选区 → right）；
 * 默认侧落位与现有图形重叠时翻到对侧（避免多个花括号堆在同一侧）。
 * 对侧也被占则保持默认侧（重叠总可手动拖开）。
 */
export function chooseBraceDirection(
  bounds: RectLike,
  isOccupied: (rect: BracePlacement) => boolean,
): BraceDirection {
  const primary = defaultBraceDirection(bounds.width, bounds.height);
  const opposite = OPPOSITE_BRACE_DIRECTION[primary];
  if (isOccupied(computeBracePlacement(bounds, primary))) {
    if (!isOccupied(computeBracePlacement(bounds, opposite))) return opposite;
  }
  return primary;
}
