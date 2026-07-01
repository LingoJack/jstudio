/**
 * graphTheme — 自研画板的飞书风格主题（配色常量集中处）。
 *
 * 抽离原因：GraphCanvas（创建节点）与 graphModel（快照灌入）都需要按 shape
 * 给出飞书配色，若各自硬编码会不一致。集中在这里，数据层和 UI 层共用。
 */

import type { GraphNodeShape } from './graphSnapshot';

type ShapePalette = { fill: string; stroke: string };

/** 浅色模式：每种形状一组淡彩填充 + 同色系描边。 */
export const SHAPE_PALETTE_LIGHT: Record<GraphNodeShape, ShapePalette> = {
  rectangle: { fill: '#EDF4FF', stroke: '#3370FF' }, // 淡蓝（处理）
  rounded: { fill: '#E8F7F0', stroke: '#20A66B' }, // 淡绿（起止）
  ellipse: { fill: '#FFF3E0', stroke: '#F08F4C' }, // 淡橙（节点）
  diamond: { fill: '#FFF1D6', stroke: '#E0A23A' }, // 淡黄（判定）
  text: { fill: 'none', stroke: 'none' },
};

/** 暗色模式：同色系降饱和，保证深底上清晰。 */
export const SHAPE_PALETTE_DARK: Record<GraphNodeShape, ShapePalette> = {
  rectangle: { fill: '#1E2F4D', stroke: '#4D80E6' },
  rounded: { fill: '#1B3528', stroke: '#3CB371' },
  ellipse: { fill: '#3D2A16', stroke: '#D6904A' },
  diamond: { fill: '#3A3014', stroke: '#C9952E' },
  text: { fill: 'none', stroke: 'none' },
};

export const FONT_LIGHT = '#1F2329';
export const FONT_DARK = '#E6E8EB';
export const EDGE_LIGHT = '#8F959E';
export const EDGE_DARK = '#7A808A';

export const SHAPE_STROKE_WIDTH = 1;
export const SHAPE_FONT_SIZE = 13;
export const SHAPE_ARC_SIZE = 8;

/** 取当前主题下某形状的飞书配色。 */
export function paletteFor(
  shape: GraphNodeShape,
  dark: boolean,
): ShapePalette {
  return (dark ? SHAPE_PALETTE_DARK : SHAPE_PALETTE_LIGHT)[shape];
}
