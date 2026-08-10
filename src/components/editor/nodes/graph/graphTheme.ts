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
  database: { fill: 'none', stroke: '#374151' },
  topic: { fill: '#E0E7FF', stroke: '#6366F1' }, // 思维导图根节点默认：浅靛蓝填充
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
  database: { fill: 'none', stroke: '#9CA3AF' },
  topic: { fill: '#3730A3', stroke: '#818CF8' }, // 思维导图根节点默认：暗色靛蓝填充
  'edge-line': { fill: 'none', stroke: '#07C160' },
  'edge-ortho': { fill: 'none', stroke: '#07C160' },
  'edge-dashed': { fill: 'none', stroke: '#07C160' },
  'edge-no-arrow': { fill: 'none', stroke: '#07C160' },
};

export const FONT_LIGHT = '#374151';
export const FONT_DARK = '#E5E7EB';

/**
 * 填充色双套色板：每个用户可选颜色都有浅色 / 深色两个变体。
 * 浅色变体是 pastel 底（配深字），深色变体是同色相低明度底（配浅字）。
 * 主题切换时通过 mapFillColor 双向互换，旧快照中的浅色值自动受益，无需数据迁移。
 */
const FILL_COLOR_PAIRS: { light: string; dark: string; label: string }[] = [
  { light: '#fef3c7', dark: '#713f12', label: '浅黄' },
  { light: '#dbeafe', dark: '#1e3a8a', label: '浅蓝' },
  { light: '#dcfce7', dark: '#14532d', label: '浅绿' },
  { light: '#fce7f3', dark: '#831843', label: '浅粉' },
  { light: '#f3e8ff', dark: '#581c87', label: '浅紫' },
  { light: '#fed7aa', dark: '#7c2d12', label: '浅橙' },
  { light: '#e5e7eb', dark: '#4b5563', label: '浅灰' },
  { light: '#ffffff', dark: '#1f2937', label: '白色' },
  { light: '#fde68a', dark: '#92400e', label: '黄' },
  { light: '#93c5fd', dark: '#1d4ed8', label: '蓝' },
  { light: '#86efac', dark: '#15803d', label: '绿' },
  { light: '#f9a8d4', dark: '#be185d', label: '粉' },
  // 内部色（不在取色器中展示）：activation 活动块的默认填充，同样跟随主题。
  { light: '#f3f4f6', dark: '#374151', label: '' },
];

/** 取色器预设：按当前主题返回对应变体的色值（所见即所得）。 */
export function fillPresetsFor(dark: boolean): { value: string; label: string }[] {
  return FILL_COLOR_PAIRS.filter((p) => p.label).map((p) => ({
    value: dark ? p.dark : p.light,
    label: p.label,
  }));
}

const fillLookup = new Map<string, { light: string; dark: string }>();
for (const p of FILL_COLOR_PAIRS) {
  fillLookup.set(p.light.toLowerCase(), p);
  fillLookup.set(p.dark.toLowerCase(), p);
}

/**
 * 主题切换时映射填充色：已知色（色板配对）双向互换；未知自定义色原样保留。
 * 'none' / 空值原样返回。
 */
export function mapFillColor(color: string, dark: boolean): string {
  if (!color || color === 'none') return color;
  const pair = fillLookup.get(color.toLowerCase());
  if (!pair) return color;
  const target = dark ? pair.dark : pair.light;
  // 保留原值的大小写风格无意义——统一返回小写 hex。
  return target;
}

/** 计算 hex 颜色的相对亮度（0=黑，1=白）。无法解析时返回 null。 */
function relativeLuminance(hex: string): number | null {
  const m = hex.replace(/^#/, '');
  const full =
    m.length === 3
      ? m.split('').map((c) => c + c).join('')
      : m;
  if (full.length !== 6) return null;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** 深色填充上的字色 / 浅色填充上的字色 */
const FONT_ON_DARK_FILL = '#F9FAFB';
const FONT_ON_LIGHT_FILL = '#1F2937';

/**
 * 字色决策：
 * - 无填充 → 主题字色（深/浅模式各自的默认色）。
 * - 有填充 → 按填充亮度自适应：浅底深字、深底浅字，保证任意自定义色都可读。
 */
export function fontColorFor(fill: string | undefined, dark: boolean): string {
  if (!fill || fill === 'none') return getFontColor(dark);
  const lum = relativeLuminance(fill);
  if (lum === null) return getFontColor(dark);
  return lum > 0.5 ? FONT_ON_LIGHT_FILL : FONT_ON_DARK_FILL;
}

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
 * 运行时读取连线色（--vscode-diagram-edge）。
 *
 * 连线是画板的"结构色"，各主题独立调色（见 themes/*.ts 的 diagram-edge），
 * 与交互 accent 色（focusBorder）解耦：选中框 / 手柄 / 连接点仍用 accent，
 * 连线 / 流动圆点 / 生命线悬停高亮用本函数。
 * 未定义 diagram-edge 时回退到 accent 色，保证旧主题文件兼容。
 */
function readThemeEdgeColor(dark: boolean): string {
  if (typeof window !== 'undefined') {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--vscode-diagram-edge')
      .trim();
    if (v) return v;
  }
  return readThemeAccentColor(dark);
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

/* ------------------------------------------------------------------ */
/* 思维导图配色 - M 暗夜霓虹 / N 极简黑白（双方案 + 旧靛蓝 fallback） */
/* ------------------------------------------------------------------ */

/**
 * 思维导图配色方案。
 * - 'neon' = M 暗夜霓虹：深底 + 霓虹描边/文字，分支按 紫/绿/琥珀 循环
 * - 'mono' = N 极简黑白：纯黑灰白，层次靠字号/字重
 *
 * 默认 'mono'（用户偏好极简）。旧快照无 mmScheme 标记时回退到 legacy 靛蓝配色。
 */
export type MindmapScheme = 'neon' | 'mono';

/** 默认方案（新建思维导图 / 块属性未设置时）。 */
export const DEFAULT_MINDMAP_SCHEME: MindmapScheme = 'neon';

/** M 霓虹：根节点用青色（独立于分支循环色）。 */
const NEON_ROOT = {
  dark: { fill: '#0D1117', stroke: '#22D3EE', text: '#22D3EE' },
  light: { fill: '#0D1117', stroke: '#22D3EE', text: '#22D3EE' },
};

/** M 霓虹：分支循环色（按兄弟顺序循环）。叶子继承父分支色。 */
/* M（暗夜霓虹）本质是深色美学——无论 app 主题是 light/dark，节点都画在
 * 深底上、用霓虹色描边/文字。因此 light 变体与 dark 一致，不做反色适配。 */
const NEON_BRANCH_COLORS = [
  {
    name: 'purple',
    dark: { stroke: '#A78BFA', text: '#C4B5FD' },
    light: { stroke: '#A78BFA', text: '#C4B5FD' },
  },
  {
    name: 'emerald',
    dark: { stroke: '#34D399', text: '#6EE7B7' },
    light: { stroke: '#34D399', text: '#6EE7B7' },
  },
  {
    name: 'amber',
    dark: { stroke: '#FBBF24', text: '#FDE68A' },
    light: { stroke: '#FBBF24', text: '#FDE68A' },
  },
] as const;

/** M 霓虹：所有节点 fill 同深底色（让节点"漂浮"在画布上，仅靠霓虹描边勾勒）。 */
const NEON_FILL = { dark: '#0D1117', light: '#0D1117' };

/** N 极简：浅色（SVG 原样）+ 深色（反色）。 */
const MONO_ROOT = {
  dark: { fill: '#FAFAFA', stroke: 'none', text: '#18181B' },
  light: { fill: '#18181B', stroke: 'none', text: '#FFFFFF' },
};
const MONO_BRANCH = {
  dark: { fill: '#18181B', stroke: '#FAFAFA', text: '#FAFAFA' },
  light: { fill: '#FFFFFF', stroke: '#18181B', text: '#18181B' },
};
const MONO_LEAF = {
  dark: { fill: '#18181B', stroke: '#52525B', text: '#A1A1AA' },
  light: { fill: '#FFFFFF', stroke: '#D4D4D8', text: '#71717A' },
};

/** N 极简连线色（分支级 / 叶级）。 */
const MONO_EDGE = {
  dark: { branch: '#FAFAFA', leaf: '#52525B' },
  light: { branch: '#18181B', leaf: '#D4D4D8' },
};

/** 思维导图圆角（比普通形状更大，呈现药丸 / pill 形态）。 */
export const MINDMAP_ARC_SIZE = 18;

/* ---- 旧靛蓝 XMind 配色（保留用于旧快照 fallback） ---- */
const LEGACY_MINDMAP_ROOT_LIGHT = { fill: '#E0E7FF', stroke: '#6366F1', font: '#312E81' };
const LEGACY_MINDMAP_ROOT_DARK = { fill: '#3730A3', stroke: '#818CF8', font: '#E0E7FF' };
const LEGACY_MINDMAP_ROOT_FONT_SIZE = 15;
const LEGACY_MINDMAP_BRANCH_LIGHT = { fill: '#EEF2FF', stroke: '#A5B4FC', font: '#4338CA' };
const LEGACY_MINDMAP_BRANCH_DARK = { fill: '#312E81', stroke: '#6366F1', font: '#C7D2FE' };
const LEGACY_MINDMAP_LEAF_LIGHT = { fill: '#F5F7FF', stroke: '#C7D2FE', font: '#6366F1' };
const LEGACY_MINDMAP_LEAF_DARK = { fill: '#1E1B4B', stroke: '#4F46E5', font: '#A5B4FC' };

/** 填充色 → 旧靛蓝深度反查（仅用于旧快照主题切换时识别深度）。 */
const LEGACY_MINDMAP_FILL_TO_DEPTH: Record<string, number> = {
  '#e0e7ff': 0, '#3730a3': 0,
  '#eef2ff': 1, '#312e81': 1,
  '#f5f7ff': 2, '#1e1b4b': 2,
};

/**
 * 根据深度 + 方案返回思维导图节点的配色。
 *
 * - depth 0（根）：neon=青色描边 + 深底；mono=黑/白实心 + 反色字 + 加粗 + 大字号
 * - depth 1（分支）：neon=循环色（紫/绿/琥珀）；mono=深/浅边框
 * - depth 2+（叶子）：neon=父分支色提亮；mono=灰
 *
 * branchIndex 仅 neon 方案用，决定分支循环色。叶子继承父分支的 branchIndex。
 */
export function mindmapStyleForDepth(
  depth: number,
  dark: boolean,
  scheme: MindmapScheme = DEFAULT_MINDMAP_SCHEME,
  branchIndex = 0,
): {
  fillColor: string;
  strokeColor: string;
  fontColor: string;
  strokeWidth: number;
  fontSize: number;
  fontStyle: number;
} {
  if (scheme === 'neon') {
    const fill = dark ? NEON_FILL.dark : NEON_FILL.light;
    if (depth <= 0) {
      const p = dark ? NEON_ROOT.dark : NEON_ROOT.light;
      return {
        fillColor: p.fill,
        strokeColor: p.stroke,
        fontColor: p.text,
        strokeWidth: 2,
        fontSize: 15,
        fontStyle: 1, // bold
      };
    }
    const branch = NEON_BRANCH_COLORS[branchIndex % NEON_BRANCH_COLORS.length];
    const bc = dark ? branch.dark : branch.light;
    if (depth === 1) {
      return {
        fillColor: fill,
        strokeColor: bc.stroke,
        fontColor: bc.stroke,
        strokeWidth: 1.5,
        fontSize: SHAPE_FONT_SIZE,
        fontStyle: 1, // bold（分支字号小但加粗，对标 SVG）
      };
    }
    // 叶子：父分支色提亮做字色，描边带透明度
    return {
      fillColor: fill,
      strokeColor: bc.stroke,
      fontColor: bc.text,
      strokeWidth: 1,
      fontSize: SHAPE_FONT_SIZE,
      fontStyle: 0,
    };
  }

  // mono
  if (depth <= 0) {
    const p = dark ? MONO_ROOT.dark : MONO_ROOT.light;
    return {
      fillColor: p.fill,
      strokeColor: p.stroke,
      fontColor: p.text,
      strokeWidth: 0,
      fontSize: 15,
      fontStyle: 1, // bold
    };
  }
  if (depth === 1) {
    const p = dark ? MONO_BRANCH.dark : MONO_BRANCH.light;
    return {
      fillColor: p.fill,
      strokeColor: p.stroke,
      fontColor: p.text,
      strokeWidth: 1.5,
      fontSize: SHAPE_FONT_SIZE,
      fontStyle: 1, // bold
    };
  }
  const p = dark ? MONO_LEAF.dark : MONO_LEAF.light;
  return {
    fillColor: p.fill,
    strokeColor: p.stroke,
    fontColor: p.text,
    strokeWidth: 1,
    fontSize: SHAPE_FONT_SIZE,
    fontStyle: 0,
  };
}

/**
 * 思维导图连线 strokeColor。
 *
 * - neon：分支用循环色，叶子用父分支色
 * - mono：分支级用主色，叶级用灰色
 *
 * depth 0 不产生连线（根节点无父边），调用方不会传 depth=0。
 */
export function mindmapEdgeStrokeColor(
  scheme: MindmapScheme,
  dark: boolean,
  depth: number,
  branchIndex = 0,
): string {
  if (scheme === 'neon') {
    const branch = NEON_BRANCH_COLORS[branchIndex % NEON_BRANCH_COLORS.length];
    return (dark ? branch.dark : branch.light).stroke;
  }
  // mono
  const ec = dark ? MONO_EDGE.dark : MONO_EDGE.light;
  return depth <= 1 ? ec.branch : ec.leaf;
}

/** 思维导图连线粗度（按方案 + 深度）。 */
export function mindmapEdgeStrokeWidth(
  scheme: MindmapScheme,
  depth: number,
): number {
  if (scheme === 'neon') {
    return depth <= 1 ? 2.5 : 1;
  }
  return 1.5; // mono 全 1.5
}

/**
 * 旧靛蓝 XMind 配色（仅用于旧快照 fallback，主题切换时保留原配色）。
 */
function legacyMindmapStyleForDepth(
  depth: number,
  dark: boolean,
): {
  fillColor: string;
  strokeColor: string;
  fontColor: string;
  strokeWidth: number;
  fontSize: number;
  fontStyle: number;
} {
  if (depth <= 0) {
    const p = dark ? LEGACY_MINDMAP_ROOT_DARK : LEGACY_MINDMAP_ROOT_LIGHT;
    return {
      fillColor: p.fill,
      strokeColor: p.stroke,
      fontColor: p.font,
      strokeWidth: 1.5,
      fontSize: LEGACY_MINDMAP_ROOT_FONT_SIZE,
      fontStyle: 1,
    };
  }
  if (depth === 1) {
    const p = dark ? LEGACY_MINDMAP_BRANCH_DARK : LEGACY_MINDMAP_BRANCH_LIGHT;
    return {
      fillColor: p.fill,
      strokeColor: p.stroke,
      fontColor: p.font,
      strokeWidth: 1,
      fontSize: SHAPE_FONT_SIZE,
      fontStyle: 0,
    };
  }
  const p = dark ? LEGACY_MINDMAP_LEAF_DARK : LEGACY_MINDMAP_LEAF_LIGHT;
  return {
    fillColor: p.fill,
    strokeColor: p.stroke,
    fontColor: p.font,
    strokeWidth: 0.5,
    fontSize: SHAPE_FONT_SIZE,
    fontStyle: 0,
  };
}

/**
 * 从 CellStyle 读取思维导图元信息（方案 / 深度 / 分支索引）。
 *
 * - 有 mmScheme 标记：返回 { scheme, depth, branchIndex }
 * - 无标记（旧快照）：返回 null，调用方应回退到 legacyMindmapStyleForDepth
 *   （深度可通过 mindmapDepthFromFill 反查）
 */
export function mindmapMetaFromStyle(
  style: Record<string, unknown> | undefined,
): { scheme: MindmapScheme; depth: number; branchIndex: number } | null {
  if (!style) return null;
  const rawScheme = style.mmScheme;
  if (rawScheme !== 'neon' && rawScheme !== 'mono') return null;
  const depth =
    typeof style.mmDepth === 'number' ? style.mmDepth : 0;
  const branchIndex =
    typeof style.mmBranch === 'number' ? style.mmBranch : 0;
  return { scheme: rawScheme, depth, branchIndex };
}

/**
 * 填充色 → 旧靛蓝思维导图深度反查（仅用于旧快照 fallback）。
 *
 * 返回 null 表示填充色不属于旧靛蓝配色体系（用户自定义了颜色，或已是新 M/N 方案）。
 */
export function mindmapDepthFromFill(fill: string | undefined): number | null {
  if (!fill || fill === 'none') return null;
  const key = fill.toLowerCase();
  return key in LEGACY_MINDMAP_FILL_TO_DEPTH ? LEGACY_MINDMAP_FILL_TO_DEPTH[key] : null;
}

/** 旧靛蓝配色导出（useGraphTheme 在 fallback 路径里用）。 */
export { legacyMindmapStyleForDepth };

/**
 * 边默认箭头尺寸（像素）。
 *
 * maxGraph 默认为 30，会画出一根巨大的三角形箭头。本项目统一使用 3，
 * 小巧精致不抢眼，与飞书 / Notion 风格一致。
 *
 * 所有生成 edge 的路径都必须引用此常量，不允许再本地硬编码：
 *   - graphModel.buildEdgeStyle（读快照）
 *   - graphModel.nodeShapeToStyle 的 edge-* 预设（工具栏拖出）
 *   - GraphCanvas.createEdgeState（拉线预览）
 *   - GraphCanvas edgeDefault（手绘落线）
 */
export const ARROW_END_SIZE = 3;

/** 选中框样式 - 跟随主题（accent 色 = --vscode-focusBorder） */
export const SELECTION_STROKE_WIDTH = 2;
export const SELECTION_DASHED = false; // 实线更清晰

/** 调整手柄样式（飞书风格：实心小圆点）- 跟随主题 */
export const HANDLE_SIZE = 6;

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
    return { fill: pal.fill, stroke: readThemeEdgeColor(dark) };
  }
  return pal;
}

/** 获取选中框颜色 — 跟随主题 accent 色 */
export function getSelectionColor(dark: boolean): string {
  return readThemeAccentColor(dark);
}

/** 获取手柄填充颜色 — 与描边同为 accent 色，实心小圆点（白底圆环观感差，已废弃） */
export function getHandleFillColor(dark: boolean): string {
  return readThemeAccentColor(dark);
}

/** 获取手柄描边颜色 — 跟随主题 accent 色 */
export function getHandleStrokeColor(dark: boolean): string {
  return readThemeAccentColor(dark);
}

/** 获取连接点颜色 — 跟随主题 accent 色 */
export function getConnectionPointColor(dark: boolean): string {
  return readThemeAccentColor(dark);
}

/**
 * 运行时读取画布背景色（--vscode-editor-background）。
 * 用于边标签背景：让标签底色与画布一致，从而"遮挡"标签下方的连线，
 * 解决双击边写文字时文字与线重叠的问题。读取失败时 fallback 到
 * 浅色 #ffffff / 暗色 #1e1e1e（VSCode 暗色默认编辑器底色）。
 */
function readEditorBackground(dark: boolean): string {
  if (typeof window !== 'undefined') {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue('--vscode-editor-background')
      .trim();
    if (v) return v;
  }
  return dark ? '#1e1e1e' : '#ffffff';
}

/** 获取边标签背景色 — 与画布底色一致，让标签"穿透"显示，遮挡下方连线 */
export function getLabelBackgroundColor(dark: boolean): string {
  return readEditorBackground(dark);
}

/** 获取连线颜色 — 跟随主题连线色 --vscode-diagram-edge（动画圆点继承连线 stroke，自动跟随） */
export function getEdgeColor(dark: boolean): string {
  return readThemeEdgeColor(dark);
}

/** 获取连线流动圆点颜色 — 连线色提亮 40%，比线条更亮，在连线上跳出明显 */
export function getEdgeDotColor(dark: boolean): string {
  return lightenHex(readThemeEdgeColor(dark), 0.4);
}

/** 获取字体颜色 */
export function getFontColor(dark: boolean): string {
  return dark ? FONT_DARK : FONT_LIGHT;
}

/** 创建连接点 SVG 图标（飞书风格）
 *  设计：accent 色实心小圆点，Base64 编码保证所有浏览器/缩放级别都清晰渲染，
 *  避免 data URI 的字符编码问题导致显示为方块或缺失。
 *
 *  @param dark 是否暗色主题
 *  @param size SVG 边长（默认 CONNECTION_POINT_SIZE）。lifeline 生命线段锚点密集，
 *              用小尺寸（4px）避免视觉突兀。
 */
export function createConnectionPointSVG(dark: boolean, size = CONNECTION_POINT_SIZE): string {
  const color = getConnectionPointColor(dark);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">\n    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="none"/>\n  </svg>`;
  const base64 = btoa(
    encodeURIComponent(svg).replace(
      /%([0-9A-F]{2})/g,
      (_match, p1: string) => String.fromCharCode(Number.parseInt(p1, 16)),
    ),
  );
  return `data:image/svg+xml;base64,${base64}`;
}

/** 创建半透明的 lifeline 锚点 SVG（2px 半透明蓝点）。
 *
 *  用途：lifeline 生命线段需要密集的 constraint（每 10px 一个）才能让 maxGraph
 *  识别"任意 Y 都能拉线"。但完全透明的图片会导致 constraintHandler 无法识别 hover，
 *  鼠标按下时 fallback 到 getCellAt() 返回错误的 cell（比如 actor）。
 *  解决方案：constraint 图片改成半透明的小点，既能被识别，又不太突兀。
 *  hover 时的视觉反馈由 sequenceInteraction.ts 的自定义 SVG overlay（整条线高亮）提供。
 */
export function createLifelineConnectionPointSVG(dark: boolean): string {
  const size = 2;
  const color = readThemeEdgeColor(dark);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">\n    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${color}" fill-opacity="0.3" stroke="none"/>\n  </svg>`;
  const base64 = btoa(
    encodeURIComponent(svg).replace(
      /%([0-9A-F]{2})/g,
      (_match, p1: string) => String.fromCharCode(Number.parseInt(p1, 16)),
    ),
  );
  return `data:image/svg+xml;base64,${base64}`;
}
