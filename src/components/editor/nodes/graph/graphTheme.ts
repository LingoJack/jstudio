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
  'edge-line': { fill: 'none', stroke: '#0052D9' },
  'edge-ortho': { fill: 'none', stroke: '#0052D9' },
  'edge-dashed': { fill: 'none', stroke: '#0052D9' },
  'edge-no-arrow': { fill: 'none', stroke: '#0052D9' },
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
  'edge-line': { fill: 'none', stroke: '#07C160' },
  'edge-ortho': { fill: 'none', stroke: '#07C160' },
  'edge-dashed': { fill: 'none', stroke: '#07C160' },
  'edge-no-arrow': { fill: 'none', stroke: '#07C160' },
};

export const FONT_LIGHT = '#374151';
export const FONT_DARK = '#E5E7EB';
export const EDGE_LIGHT = '#0052D9'; // 浅色 fallback：主题蓝（--vscode-focusBorder）
export const EDGE_DARK = '#07C160'; // 暗色 fallback：主题绿（--vscode-focusBorder）

/**
 * 运行时读取主题 accent 色（--vscode-focusBorder）。
 * applyAppTheme 在主题切换时更新 <html> 上的 CSS 变量，本函数每次调用都
 * 读取最新值，保证连线 / 选中框 / 连接点等跟随当前主题（含 ink-light、
 * ink-dark 等非默认主题）。读取失败时 fallback 到 EDGE_LIGHT / EDGE_DARK
 * 硬编码常量，兼容初始化时序与 SSR。
 */
function readThemeAccentColor(dark: boolean): string {
  if (typeof window !== 'undefined') {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--vscode-focusBorder')
      .trim();
    if (v) return v;
  }
  return dark ? EDGE_DARK : EDGE_LIGHT;
}

/**
 * 把 hex 颜色向白色混合（提亮）。amount=0 不变，amount=1 全白。
 * 用于流动圆点：比线条色更亮的同色系，在线条上跳出但不破坏主题色和谐。
 */
function lightenHex(hex: string, amount: number): string {
  const m = hex.replace(/^#/, '');
  if (m.length !== 6) return hex;
  const r = Number.parseInt(m.slice(0, 2), 16);
  const g = Number.parseInt(m.slice(2, 4), 16);
  const b = Number.parseInt(m.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return hex;
  const mix = (v: number) =>
    Math.min(255, Math.round(v + (255 - v) * amount))
      .toString(16)
      .padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

/** 图形样式 */
export const SHAPE_STROKE_WIDTH = 1.5;
export const SHAPE_FONT_SIZE = 13;
export const SHAPE_ARC_SIZE = 12; // 飞书风格：更大的圆角

/** 选中框样式 - 跟随主题（accent 色 = --vscode-focusBorder） */
export const SELECTION_STROKE_WIDTH = 2;
export const SELECTION_DASHED = false; // 实线更清晰

/** 调整手柄样式（飞书风格：小圆点）- 跟随主题 */
export const HANDLE_SIZE = 7;
export const HANDLE_FILL_COLOR_LIGHT = '#FFFFFF';
export const HANDLE_FILL_COLOR_DARK = '#1F2937';

/** 连接点样式（悬停边缘时显示的锚点）- 跟随主题
 * 飞书风格：纯色小圆点，无填充，简洁优雅
 */
export const CONNECTION_POINT_SIZE = 10; // 精巧但清晰，在虚线生命线上可辨

/** 取当前主题下某形状的配色。 */
export function paletteFor(shape: GraphNodeShape, dark: boolean): ShapePalette {
  const pal = (dark ? SHAPE_PALETTE_DARK : SHAPE_PALETTE_LIGHT)[shape];
  // 连线类形状的描边跟随主题 accent 色（--vscode-focusBorder），
  // 其余形状保持中性灰描边（白板风格）。
  if (
    shape === 'edge-line' ||
    shape === 'edge-ortho' ||
    shape === 'edge-dashed' ||
    shape === 'edge-no-arrow'
  ) {
    return { fill: pal.fill, stroke: readThemeAccentColor(dark) };
  }
  return pal;
}

/** 获取选中框颜色 — 跟随主题 accent 色 */
export function getSelectionColor(dark: boolean): string {
  return readThemeAccentColor(dark);
}

/** 获取手柄填充颜色 */
export function getHandleFillColor(dark: boolean): string {
  return dark ? HANDLE_FILL_COLOR_DARK : HANDLE_FILL_COLOR_LIGHT;
}

/** 获取手柄描边颜色 — 跟随主题 accent 色 */
export function getHandleStrokeColor(dark: boolean): string {
  return readThemeAccentColor(dark);
}

/** 获取连接点颜色 — 跟随主题 accent 色 */
export function getConnectionPointColor(dark: boolean): string {
  return readThemeAccentColor(dark);
}

/** 获取连线颜色 — 跟随主题 accent 色（动画圆点继承连线 stroke，自动跟随） */
export function getEdgeColor(dark: boolean): string {
  return readThemeAccentColor(dark);
}

/** 获取连线流动圆点颜色 — 主题 accent 色提亮 40%，比线条更亮，在连线上跳出明显 */
export function getEdgeDotColor(dark: boolean): string {
  return lightenHex(readThemeAccentColor(dark), 0.4);
}

/** 获取字体颜色 */
export function getFontColor(dark: boolean): string {
  return dark ? FONT_DARK : FONT_LIGHT;
}

/** 创建连接点 SVG 图标（飞书风格）
 *  设计：白底圆环 + 蓝色实心圆心的"靶心"，Base64 编码保证所有浏览器/缩放级别都清晰渲染，
 *  避免 data URI 的字符编码问题导致显示为方块或缺失。
 *
 *  @param dark 是否暗色主题
 *  @param size SVG 边长（默认 CONNECTION_POINT_SIZE）。lifeline 生命线段锚点密集，
 *              用小尺寸（4px）避免视觉突兀。
 */
export function createConnectionPointSVG(dark: boolean, size = CONNECTION_POINT_SIZE): string {
  const color = getConnectionPointColor(dark);
  const bgColor = dark ? '#1F2937' : '#FFFFFF';
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 1;
  // 内圆半径随外圆缩放：默认 14px 时 rInner=2.5；4px 时 rInner≈0.7（保持比例）
  const rInner = Math.max(0.7, size * (2.5 / CONNECTION_POINT_SIZE));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">\n    <circle cx="${cx}" cy="${cy}" r="${rOuter}"\n      fill="${bgColor}" stroke="${color}" stroke-width="1.5"/>\n    <circle cx="${cx}" cy="${cy}" r="${rInner}"\n      fill="${color}" stroke="none"/>\n  </svg>`;
  const base64 = btoa(
    encodeURIComponent(svg).replace(
      /%([0-9A-F]{2})/g,
      (_match, p1: string) => String.fromCharCode(Number.parseInt(p1, 16)),
    ),
  );
  return `data:image/svg+xml;base64,${base64}`;
}

/** 创建透明的连接点 SVG（1px 全透明）。
 *
 *  用途：lifeline 生命线段需要密集的 constraint（每 10px 一个）才能让 maxGraph
 *  识别"任意 Y 都能拉线"，但密集的小蓝点视觉上太乱。
 *  解决方案：constraint 保留（功能上能识别），但锚点图片改成全透明（视觉上看不见）。
 *  hover 时的视觉反馈由 sequenceInteraction.ts 的自定义 SVG overlay 提供。
 */
export function createInvisibleConnectionPointSVG(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1">\n    <circle cx="0.5" cy="0.5" r="0.5" fill="transparent" stroke="none"/>\n  </svg>`;
  const base64 = btoa(
    encodeURIComponent(svg).replace(
      /%([0-9A-F]{2})/g,
      (_match, p1: string) => String.fromCharCode(Number.parseInt(p1, 16)),
    ),
  );
  return `data:image/svg+xml;base64,${base64}`;
}
