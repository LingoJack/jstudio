/**
 * graphTheme — 自研画板的飞书风格主题（配色常量集中处）。
 *
 * 设计原则（参考飞书文档画板）：
 * - 白板风格：图形默认无填充，只显示边框
 * - 所有颜色跟随主题：浅色/深色模式下颜色动态变化
 * - 简洁克制：中性灰描边，而非高饱和彩虹色
 * - 圆角统一：流程图风格，圆角矩形用 12px 圆角
 */

import type { GraphNodeShape } from './graphSnapshot';

type ShapePalette = { fill: string; stroke: string };

/**
 * 浅色模式：白板风格配色。
 * 图形无填充（透明），使用中性灰描边。
 */
export const SHAPE_PALETTE_LIGHT: Record<GraphNodeShape, ShapePalette> = {
  rectangle: { fill: 'none', stroke: '#374151' }, // 中性灰描边
  rounded: { fill: 'none', stroke: '#374151' },
  ellipse: { fill: 'none', stroke: '#374151' },
  diamond: { fill: 'none', stroke: '#374151' },
  text: { fill: 'none', stroke: 'none' },
  actor: { fill: 'none', stroke: '#374151' },
  'swimlane-v': { fill: 'none', stroke: '#374151' },
  'swimlane-h': { fill: 'none', stroke: '#374151' },
  lifeline: { fill: 'none', stroke: '#374151' },
  activation: { fill: '#F3F4F6', stroke: '#374151' },
  note: { fill: 'none', stroke: '#374151' },
  'edge-line': { fill: 'none', stroke: '#374151' },
  'edge-ortho': { fill: 'none', stroke: '#374151' },
  'edge-dashed': { fill: 'none', stroke: '#374151' },
  'edge-no-arrow': { fill: 'none', stroke: '#374151' },
};

/** 暗色模式：同样的白板风格，描边使用浅色以保证可见性。 */
export const SHAPE_PALETTE_DARK: Record<GraphNodeShape, ShapePalette> = {
  rectangle: { fill: 'none', stroke: '#9CA3AF' },
  rounded: { fill: 'none', stroke: '#9CA3AF' },
  ellipse: { fill: 'none', stroke: '#9CA3AF' },
  diamond: { fill: 'none', stroke: '#9CA3AF' },
  text: { fill: 'none', stroke: 'none' },
  actor: { fill: 'none', stroke: '#9CA3AF' },
  'swimlane-v': { fill: 'none', stroke: '#9CA3AF' },
  'swimlane-h': { fill: 'none', stroke: '#9CA3AF' },
  lifeline: { fill: 'none', stroke: '#9CA3AF' },
  activation: { fill: '#374151', stroke: '#9CA3AF' },
  note: { fill: 'none', stroke: '#9CA3AF' },
  'edge-line': { fill: 'none', stroke: '#9CA3AF' },
  'edge-ortho': { fill: 'none', stroke: '#9CA3AF' },
  'edge-dashed': { fill: 'none', stroke: '#9CA3AF' },
  'edge-no-arrow': { fill: 'none', stroke: '#9CA3AF' },
};

export const FONT_LIGHT = '#374151';
export const FONT_DARK = '#E5E7EB';
export const EDGE_LIGHT = '#6B7280';
export const EDGE_DARK = '#9CA3AF';

/** 图形样式 */
export const SHAPE_STROKE_WIDTH = 1.5;
export const SHAPE_FONT_SIZE = 13;
export const SHAPE_ARC_SIZE = 12; // 飞书风格：更大的圆角

/** 选中框样式 - 跟随主题 */
export const SELECTION_COLOR_LIGHT = '#3B82F6'; // 蓝色选中框
export const SELECTION_COLOR_DARK = '#60A5FA';
export const SELECTION_STROKE_WIDTH = 2;
export const SELECTION_DASHED = false; // 实线更清晰

/** 调整手柄样式（飞书风格：小圆点）- 跟随主题 */
export const HANDLE_SIZE = 7;
export const HANDLE_FILL_COLOR_LIGHT = '#FFFFFF';
export const HANDLE_FILL_COLOR_DARK = '#1F2937';
export const HANDLE_STROKE_COLOR_LIGHT = '#3B82F6';
export const HANDLE_STROKE_COLOR_DARK = '#60A5FA';

/** 连接点样式（悬停边缘时显示的锚点）- 跟随主题
 * 飞书风格：纯色小圆点，无填充，简洁优雅
 */
export const CONNECTION_POINT_COLOR_LIGHT = '#3B82F6';
export const CONNECTION_POINT_COLOR_DARK = '#60A5FA';
export const CONNECTION_POINT_SIZE = 10; // 精巧但清晰，在虚线生命线上可辨

/** 拖动预览样式 - 跟随主题 */
export const PREVIEW_FILL_COLOR_LIGHT = 'rgba(59, 130, 246, 0.1)';
export const PREVIEW_STROKE_COLOR_LIGHT = '#3B82F6';
export const PREVIEW_FILL_COLOR_DARK = 'rgba(96, 165, 250, 0.15)';
export const PREVIEW_STROKE_COLOR_DARK = '#60A5FA';

/** 取当前主题下某形状的配色。 */
export function paletteFor(shape: GraphNodeShape, dark: boolean): ShapePalette {
  return (dark ? SHAPE_PALETTE_DARK : SHAPE_PALETTE_LIGHT)[shape];
}

/** 获取选中框颜色 */
export function getSelectionColor(dark: boolean): string {
  return dark ? SELECTION_COLOR_DARK : SELECTION_COLOR_LIGHT;
}

/** 获取手柄填充颜色 */
export function getHandleFillColor(dark: boolean): string {
  return dark ? HANDLE_FILL_COLOR_DARK : HANDLE_FILL_COLOR_LIGHT;
}

/** 获取手柄描边颜色 */
export function getHandleStrokeColor(dark: boolean): string {
  return dark ? HANDLE_STROKE_COLOR_DARK : HANDLE_STROKE_COLOR_LIGHT;
}

/** 获取连接点颜色 */
export function getConnectionPointColor(dark: boolean): string {
  return dark ? CONNECTION_POINT_COLOR_DARK : CONNECTION_POINT_COLOR_LIGHT;
}

/** 获取连线颜色 */
export function getEdgeColor(dark: boolean): string {
  return dark ? EDGE_DARK : EDGE_LIGHT;
}

/** 获取字体颜色 */
export function getFontColor(dark: boolean): string {
  return dark ? FONT_DARK : FONT_LIGHT;
}

/** 创建连接点 SVG 图标（飞书风格）
 *  设计：白底圆环 + 蓝色实心圆心的"靶心"，Base64 编码保证所有浏览器/缩放级别都清晰渲染，
 *  避免 data URI 的字符编码问题导致显示为方块或缺失。
 */
export function createConnectionPointSVG(dark: boolean): string {
  const color = getConnectionPointColor(dark);
  const bgColor = dark ? '#1F2937' : '#FFFFFF';
  const size = CONNECTION_POINT_SIZE;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 1;
  const rInner = 2.5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">\n    <circle cx="${cx}" cy="${cy}" r="${rOuter}"\n      fill="${bgColor}" stroke="${color}" stroke-width="1.5"/>\n    <circle cx="${cx}" cy="${cy}" r="${rInner}"\n      fill="${color}" stroke="none"/>\n  </svg>`;
  const base64 = btoa(
    encodeURIComponent(svg).replace(
      /%([0-9A-F]{2})/g,
      (_match, p1: string) => String.fromCharCode(Number.parseInt(p1, 16)),
    ),
  );
  return `data:image/svg+xml;base64,${base64}`;
}
