/**
 * flowchartConverter - Mermaid Flowchart -> GraphSnapshot 转换
 *
 * 将 Mermaid flowchart/graph 语法解析后的数据转换为 GraphCanvas 可用的快照格式。
 * 包含：
 *   - 节点形状映射（Mermaid 形状 -> GraphNodeShape）
 *   - classDef / linkStyle 样式映射（填充 / 描边 / 字色 / 粗细 / 虚实）
 *   - subgraph -> 分组框（矩形 + 框内左上角标题），含嵌套
 *   - 自动布局算法（基于图拓扑的层级布局 + 分组约束）
 *
 * 两条 mermaid 语义上的约定：
 *   - `~~~` 不可见边（stroke 'invisible'）只参与布局分层，不产出连线
 *     （mermaid 渲染时也不给它样式类，等同不画）。
 *   - 节点样式不在 vertex.styles（那是 `style X ...` 行内语句），classDef 需要
 *     按 vertex.classes 从 db.getClasses() 里查，行内声明优先级更高。
 */

import type {
  FlowchartData,
  MermaidClassDef,
  MermaidEdge,
  MermaidSubgraph,
  MermaidVertex,
} from './mermaidParser';
import type {
  GraphNode,
  GraphEdge,
  GraphEdgeStyle,
  GraphNodeShape,
  GraphNodeStyle,
  GraphSnapshot,
} from '../../../components/editor/nodes/graph/graphSnapshot';
import { SHAPE_FONT_SIZE } from '../../../components/editor/nodes/graph/graphTheme';
import {
  DIAMOND_INSCRIBE_FACTOR,
  DIAMOND_TEXT_PAD_X,
  DIAMOND_TEXT_PAD_Y,
  TEXT_FIT_MAX_INNER_WIDTH,
  measureLabelAtCanvasFont,
} from '../../../components/editor/nodes/graph/graphTextFit';

/* ------------------------------------------------------------------ */
/* 形状映射                                                            */
/* ------------------------------------------------------------------ */

/**
 * Mermaid 节点形状类型 -> GraphNodeShape
 *
 * Mermaid v11 中 FlowVertex 有两个相关字段：
 *   - type: FlowVertexTypeParam | ShapeID（逻辑类型，如 'diamond', 'round', 'rect' 等）
 *   - shape: ShapeID（渲染形状，如 'question'=菱形, 'stadium'=圆角, 'rect'=矩形 等）
 *
 * 优先级：shape 字段 > type 字段 > styles 数组 > 默认矩形
 */
function mapVertexToShape(vertex: MermaidVertex): GraphNodeShape {
  // 1. 优先检查 shape 字段（mermaid v11 渲染形状，最可靠）
  const shape = vertex.shape ?? '';
  if (shape) {
    if (shape === 'question' || shape === 'hexagon_alt') return 'diamond';
    if (shape === 'stadium' || shape === 'rounded') return 'rounded';
    if (shape === 'circle' || shape === 'doublecircle' || shape === 'ellipse') return 'ellipse';
    if (shape === 'cylinder') return 'database';
    if (shape === 'hexagon') return 'rectangle';
    if (shape === 'rect' || shape === 'square' || shape === 'labelRect') return 'rectangle';
  }

  // 2. 检查 type 字段（兼容 mermaid v10 及部分 v11 场景）
  const type = vertex.type ?? '';
  if (type) {
    if (type.includes('diamond') || type.includes('rhombus') || type === 'question') return 'diamond';
    if (type.includes('round') || type.includes('stadium')) return 'rounded';
    if (type.includes('circle') || type.includes('ellipse')) return 'ellipse';
    if (type.includes('cylinder') || type.includes('database')) return 'database';
  }

  // 3. 检查 styles 数组（兼容旧版本）
  const styles = vertex.styles ?? [];
  if (styles.includes('stadium') || styles.includes('round')) return 'rounded';
  if (styles.includes('circle') || styles.includes('ellipse')) return 'ellipse';
  if (styles.includes('diamond') || styles.includes('rhombus')) return 'diamond';
  if (styles.includes('cylinder') || styles.includes('database')) return 'database';

  // 默认为矩形
  return 'rectangle';
}

/* ------------------------------------------------------------------ */
/* 样式解析（classDef / style 行内语句 / linkStyle）                     */
/* ------------------------------------------------------------------ */

/**
 * CSS 声明数组的解析结果。
 *
 * mermaid 的样式声明统一是 `属性:值` 的扁平字符串数组——classDef 的 styles /
 * textStyles、节点上的 `style X ...`、连线上的 `linkStyle ...` 都是这个格式。
 */
interface StyleDecls {
  fill?: string;
  stroke?: string;
  fontColor?: string;
  strokeWidth?: number;
  dashed?: boolean;
}

/** 解析 `属性:值` 声明数组；识别不了的属性忽略，同属性后出现的覆盖先出现的。 */
function parseStyleDecls(decls: readonly string[] | undefined): StyleDecls {
  const out: StyleDecls = {};
  for (const decl of decls ?? []) {
    const at = decl.indexOf(':');
    if (at <= 0) continue;
    const prop = decl.slice(0, at).trim().toLowerCase();
    const value = decl.slice(at + 1).trim();
    if (!value) continue;
    if (prop === 'fill') out.fill = value;
    else if (prop === 'stroke') out.stroke = value;
    else if (prop === 'color') out.fontColor = value;
    else if (prop === 'stroke-width') {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n)) out.strokeWidth = n;
    } else if (prop === 'stroke-dasharray') {
      // 快照没有虚线节距字段，只保留"是虚线"这一位信息（none / 0 视为实线）。
      out.dashed = value !== 'none' && value !== '0';
    }
  }
  return out;
}

/** 声明 -> 节点样式覆盖；无有效字段时返回 undefined（让内核按 shape 给默认）。 */
function toNodeStyle(decls: StyleDecls): GraphNodeStyle | undefined {
  const style: GraphNodeStyle = {};
  if (decls.fill !== undefined) style.fill = decls.fill;
  if (decls.stroke !== undefined) style.stroke = decls.stroke;
  if (decls.fontColor !== undefined) style.fontColor = decls.fontColor;
  if (decls.strokeWidth !== undefined) style.strokeWidth = decls.strokeWidth;
  if (decls.dashed) style.dashed = true;
  return Object.keys(style).length > 0 ? style : undefined;
}

/**
 * 汇总一个图形 / 子图的样式声明：先 classDef（按名称查表，styles 在前
 * textStyles 在后），再 `style X ...` 行内声明——后者覆盖前者，与 mermaid 的
 * 层叠顺序一致。
 */
function collectDecls(
  classNames: readonly string[] | undefined,
  inline: readonly string[] | undefined,
  classes: Map<string, MermaidClassDef> | undefined,
): string[] {
  const decls: string[] = [];
  for (const name of classNames ?? []) {
    const def = classes?.get(name);
    if (!def) continue;
    decls.push(...(def.styles ?? []), ...(def.textStyles ?? []));
  }
  decls.push(...(inline ?? []));
  return decls;
}

/** 节点样式：classDef（按 vertex.classes 查）+ 节点行内 style 语句。 */
function resolveNodeStyle(
  vertex: MermaidVertex,
  classes: Map<string, MermaidClassDef> | undefined,
): GraphNodeStyle | undefined {
  return toNodeStyle(parseStyleDecls(collectDecls(vertex.classes, vertex.styles, classes)));
}

/** 默认节点尺寸（无文本内容的兜底值；有 label 时由 computeNodeSize 按内容计算） */
const DEFAULT_NODE_SIZE: Record<GraphNodeShape, { w: number; h: number }> = {
  rectangle: { w: 120, h: 60 },
  rounded: { w: 120, h: 60 },
  ellipse: { w: 120, h: 80 },
  diamond: { w: 80, h: 80 },
  text: { w: 80, h: 30 },
  actor: { w: 50, h: 150 },
  'swimlane-v': { w: 200, h: 300 },
  'swimlane-h': { w: 300, h: 200 },
  lifeline: { w: 100, h: 150 },
  activation: { w: 16, h: 60 },
  note: { w: 100, h: 60 },
  database: { w: 120, h: 80 },
  brace: { w: 160, h: 40 }, // mermaid 不会生成 brace，纯兜底
  topic: { w: 100, h: 36 },
  'edge-line': { w: 100, h: 20 },
  'edge-ortho': { w: 100, h: 20 },
  'edge-dashed': { w: 100, h: 20 },
  'edge-no-arrow': { w: 100, h: 20 },
};

/* ------------------------------------------------------------------ */
/* 文本测量与节点定尺寸                                                  */
/* ------------------------------------------------------------------ */

/** 行高（maxGraph 默认行距约 1.4 倍字号） */
const LINE_HEIGHT = Math.round(SHAPE_FONT_SIZE * 1.4); // ≈18

/**
 * 标签字宽估算（图坐标 px），按画布等宽字体 Maple Mono CN 的 metrics 校准：
 * Latin advance = 0.6em，CJK/全角恰为 Latin 的 2 倍。
 *
 * 只用于折行断点估算与无 DOM 时的兜底定尺寸；有 DOM 时尺寸走
 * measureLabelForLayout 的实测（与导入后的文字适配同口径）。
 * 估算宁可略大：偏小会让文字适配把框二次放大，冲破按成员包络
 * 计算的分组框。
 */
const ASCII_CHAR_WIDTH = SHAPE_FONT_SIZE * 0.6; // ≈7.8
const WIDE_CHAR_WIDTH = ASCII_CHAR_WIDTH * 2; // ≈15.6

/** 判断字符是否为全角宽字符（CJK / 全角符号 / 圈号数字等，约占两个 Latin 宽） */
function isWideChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2460 && code <= 0x24ff) || // 圈号数字 ①②③ 等
    (code >= 0x2e80 && code <= 0x9fff) || // CJK 部首 .. CJK 统一表意
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容表意
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK 兼容形式
    (code >= 0xff00 && code <= 0xff60) || // 全角形式
    (code >= 0x20000 && code <= 0x2fa1f) || // CJK 扩展 B+
    // 中西文混排高频的"歧义宽度"标点：CJK 字体按全宽渲染（Monaco 等纯
    // 拉丁等宽字体里是半宽）。归到宽字符只会让框略宽（安全方向），
    // 漏掉则折行预算偏小，导入后被文字适配二次折行、框体加高。
    code === 0x00b7 || // · 间隔号
    code === 0x2014 || // — 破折号
    code === 0x2026 // … 省略号
  );
}

/** 按 `<br/>` / `<br>` / `\n` 切行，并剥除残余 HTML 标签 */
function splitLabelLines(label: string): string[] {
  return label
    .split(/<br\s*\/?>|\n/gi)
    .map((l) => l.replace(/<[^>]+>/g, '').trim());
}

/** 估算单行渲染宽度：宽字符 ≈ 2 个 Latin 宽，ASCII ≈ 0.6 字号（见上方常量注释） */
function estimateLineWidth(line: string): number {
  let w = 0;
  for (const ch of line) {
    w += isWideChar(ch) ? WIDE_CHAR_WIDTH : ASCII_CHAR_WIDTH;
  }
  return w;
}

/**
 * 测量 label 渲染尺寸。
 * @returns maxWidth 最长行估算宽度（px）；lineCount 行数（至少 1）
 */
export function measureLabel(label: string): { maxWidth: number; lineCount: number } {
  const lines = splitLabelLines(label);
  let maxWidth = 0;
  for (const line of lines) {
    maxWidth = Math.max(maxWidth, estimateLineWidth(line));
  }
  return { maxWidth, lineCount: Math.max(lines.length, 1) };
}

/**
 * 超宽 label 折行：单行估算宽度超过 maxTextWidth 时按宽度预算断行
 * （优先在空格处断开，CJK 任意位置可断），用 `<br/>` 重新连接。
 *
 * 预算与导入后"文字适配"的折行上限（TEXT_FIT_MAX_INNER_WIDTH）一致：
 * 断行过晚（行宽超上限）时，适配会重新折行并把框加高。
 *
 * 注意：过程中会剥除 label 内除换行外的 HTML 标签（mermaid 流程图
 * label 极少使用行内 HTML，剥除可避免在标签中间断行产生坏 HTML）。
 */
export function wrapLabel(
  label: string,
  maxTextWidth: number = TEXT_FIT_MAX_INNER_WIDTH,
): string {
  const lines = splitLabelLines(label);
  const out: string[] = [];
  for (const line of lines) {
    if (estimateLineWidth(line) <= maxTextWidth) {
      out.push(line);
      continue;
    }
    let current = '';
    for (const ch of line) {
      if (current.length > 0 && estimateLineWidth(current + ch) > maxTextWidth) {
        // 尝试回退到最近的空格断行（断点太短则硬断）
        const lastSpace = current.lastIndexOf(' ');
        if (lastSpace > 0 && estimateLineWidth(current.slice(0, lastSpace)) >= maxTextWidth * 0.5) {
          out.push(current.slice(0, lastSpace));
          current = current.slice(lastSpace + 1) + ch;
        } else {
          out.push(current);
          current = ch === ' ' ? '' : ch;
        }
      } else {
        current += ch;
      }
    }
    if (current) out.push(current);
  }
  return out.join('<br/>');
}

/**
 * 标签实测尺寸：有 DOM（渲染进程）时用画布同款字体实测量，
 * 与导入后"文字适配"（graphTextFit.fitCellToText）完全同口径——
 * 同字体、line-height normal、同折行上限，适配量出的尺寸不会更大，
 * 框体零放大，导入布局几何（含分组框包络）原样保留。
 * 无 DOM（无头测试）退回字宽估算。
 */
function measureLabelForLayout(label: string): { w: number; h: number } {
  if (typeof document !== 'undefined' && document.body) {
    return measureLabelAtCanvasFont(label);
  }
  const { maxWidth, lineCount } = measureLabel(label);
  return { w: maxWidth, h: lineCount * LINE_HEIGHT };
}

/**
 * 按 label 内容计算节点尺寸。
 *
 * 菱形 / 椭圆的文字须落在内接区域，系数相应放大；
 * 未列出的 shape（流程图解析不会产生）回退到 DEFAULT_NODE_SIZE。
 *
 * 内距（矩形 32 / 菱形公式）都不小于文字适配的放大阈值
 * （RECT_TEXT_PAD_X*2 = 24 等），保证适配零放大。
 */
export function computeNodeSize(
  shape: GraphNodeShape,
  label: string,
): { w: number; h: number } {
  const m = measureLabelForLayout(label);
  const textW = Math.ceil(m.w);
  const textH = Math.ceil(m.h);
  switch (shape) {
    case 'diamond':
      // 内接区域补偿：可用宽高约为框体一半 —— 公式与文字适配一致
      // （graphTextFit 的 DIAMOND_TEXT_PAD_X/Y + 系数 2）。
      return {
        w: Math.max(100, (textW + DIAMOND_TEXT_PAD_X) * DIAMOND_INSCRIBE_FACTOR),
        h: Math.max(80, (textH + DIAMOND_TEXT_PAD_Y) * DIAMOND_INSCRIBE_FACTOR),
      };
    case 'ellipse':
      // 椭圆不在文字适配范围（TEXT_FIT_SHAPES），保留内接补偿公式。
      return {
        w: Math.max(120, textW * 1.3 + 32),
        h: Math.max(80, textH * 1.4 + 24),
      };
    case 'database':
      // 圆柱体不在文字适配范围：上下帽各占 min(w*0.2, h*0.15)，
      // 这里直接给出装得下文本的尺寸（旧值 120x80 装不下两行中文）。
      return {
        w: Math.max(120, textW + 40),
        h: Math.max(80, textH + 56),
      };
    case 'rectangle':
    case 'rounded':
      return {
        w: Math.max(120, textW + 32),
        h: Math.max(60, textH + 20),
      };
    default:
      return DEFAULT_NODE_SIZE[shape] ?? DEFAULT_NODE_SIZE.rectangle;
  }
}

/* ------------------------------------------------------------------ */
/* 连线映射                                                            */
/* ------------------------------------------------------------------ */

/** 默认 / 加粗连线宽度（对应 mermaid 线型 normal / thick）。 */
const DEFAULT_EDGE_STROKE_WIDTH = 1.5;
const THICK_EDGE_STROKE_WIDTH = 3;

/**
 * `~~~` 不可见边：mermaid 渲染时不给它任何样式类（SVG 路径无描边 = 看不见），
 * 只用来把两个节点锚在相邻层。转换时保留其布局作用，但不产出连线。
 */
function isInvisibleEdge(edge: MermaidEdge): boolean {
  return edge.stroke === 'invisible';
}

/**
 * Mermaid 边类型 -> GraphEdge 样式
 *
 * Mermaid 连线语法：
 *   - 箭头实线: --> 或 ---> -> endArrow='classic', dashed=false
 *   - 无箭头实线: --- 或 ---- -> endArrow='none', dashed=false
 *   - 箭头虚线: -.-> 或 -..-> -> endArrow='classic', dashed=true
 *   - 无箭头虚线: -.- 或 -..- -> endArrow='none', dashed=true
 *   - 粗箭头: ==> 或 ===> -> strokeWidth=3, dashed=false
 *   - 多箭头: --o 或 --x -> 特殊箭头类型
 *   - 不可见边: ~~~ -> stroke='invisible'（不绘制，见 isInvisibleEdge）
 *
 * 颜色 / 粗细 / 虚实优先取 linkStyle 行内声明（edge.style），缺省时按线型推断。
 *
 * 参考: https://mermaid.js.org/syntax/flowchart.html#links
 */
function mapEdgeTypeToStyle(edge: MermaidEdge): {
  routing: 'orthogonal' | 'straight';
  dashed: boolean;
  endArrow: string;
  strokeWidth: number;
  stroke?: string;
} {
  const type = edge.type ?? '';
  const stroke = edge.stroke ?? 'normal';
  const decls = parseStyleDecls(edge.style);

  // stroke 类型: normal, dotted, thick, invisible
  const strokeWidth =
    decls.strokeWidth ?? (stroke === 'thick' ? THICK_EDGE_STROKE_WIDTH : DEFAULT_EDGE_STROKE_WIDTH);
  const dashed = decls.dashed ?? stroke === 'dotted';

  // 箭头类型
  let endArrow = 'classic';
  if (type.includes('arrow_cross')) {
    endArrow = 'block';
  } else if (type.includes('arrow_circle')) {
    endArrow = 'oval';
  } else if (type.includes('arrow_open')) {
    endArrow = 'none';
  } else if (type.includes('double_arrow')) {
    // 双向箭头：设置 startArrow
    endArrow = 'classic';
    // 在 GraphEdge 中会特殊处理
  }

  // 连线走线风格：默认正交（流程图标准）
  const routing: 'orthogonal' | 'straight' = 'orthogonal';

  return { routing, dashed, endArrow, strokeWidth, stroke: decls.stroke };
}

/* ------------------------------------------------------------------ */
/* 分组（subgraph）                                                     */
/* ------------------------------------------------------------------ */

/** 组框内边距：组框边到成员图形 / 子组框的距离。 */
const GROUP_PAD = 16;

/** 单行标题带高度：组框顶部留给标题的区域，成员从它下方开始排。 */
const GROUP_TITLE_H = 24;

/** 每跨一道组边界，层内相邻节点额外让出的距离（让两侧组框各有一份内边距 + 净空）。 */
const GROUP_GAP_UNIT = GROUP_PAD + 4;

/** 组框节点 id 前缀（与叶子节点的 `node-` 前缀区分开）。 */
const GROUP_ID_PREFIX = 'group-';

/** 一个分组（subgraph）：只保留含叶子成员的组，空组不画框。 */
interface FlowchartGroup {
  id: string;
  /** 已折行 / 已剥 HTML 的标题。 */
  title: string;
  /** 标题最宽行的估算宽度（px）：组框要装得下它，否则标题越出右边框。 */
  titleW: number;
  /** 标题带高度，按标题行数放大（多行标题需要更高的留白）。 */
  titleH: number;
  /** 嵌套深度：顶层组为 0。 */
  depth: number;
  /** 直接成员（叶子节点 id，不含子组成员）。 */
  leaves: string[];
  /** 直接子组 id（组框算几何时子组框也算它的成员）。 */
  children: string[];
  /** 组框样式（来自该 subgraph 的 classDef）。 */
  style?: GraphNodeStyle;
}

/** 布局与转换共用的分组索引。 */
export interface FlowchartGroups {
  groups: FlowchartGroup[];
  /** 叶子节点 -> 由外到内的所属组链；无分组为空数组。 */
  chainOf: (nodeId: string) => string[];
  /** 组 id -> 标题带高度（未参与布局的组返回默认单行高度）。 */
  titleHOf: (groupId: string) => number;
}

/** 无分组的空索引（单节点图、旧调用方的兜底）。 */
const NO_GROUPS: FlowchartGroups = {
  groups: [],
  chainOf: () => [],
  titleHOf: () => GROUP_TITLE_H,
};

/**
 * 由 subgraph 列表建组树。
 *
 * mermaid 只在父组的 `nodes` 里列**直接子项**（子组 id 或叶子 id），
 * 所以父子关系 = "哪个组的 nodes 里含我这个组 id"。
 * 直接成员需要再扣掉子组 id 与子组已认领的叶子（兼容把孙辈一并列出的版本）。
 */
function buildGroups(
  subgraphs: MermaidSubgraph[],
  classes: Map<string, MermaidClassDef> | undefined,
  vertices: Map<string, MermaidVertex>,
): FlowchartGroups {
  if (subgraphs.length === 0) return NO_GROUPS;

  const byId = new Map(subgraphs.map((s) => [s.id, s]));

  const parentOf = new Map<string, string>();
  for (const child of subgraphs) {
    for (const parent of subgraphs) {
      if (parent.id === child.id) continue;
      if (parent.nodes.includes(child.id)) {
        parentOf.set(child.id, parent.id);
        break;
      }
    }
  }
  const childIdsOf = new Map<string, string[]>();
  for (const [child, parent] of parentOf) {
    const arr = childIdsOf.get(parent) ?? [];
    arr.push(child);
    childIdsOf.set(parent, arr);
  }

  const leafCache = new Map<string, string[]>();
  /** 直接成员：组自己列出的 nodes 里，扣掉子组 id 与子组已认领的叶子。 */
  const directLeavesOf = (groupId: string): string[] => {
    const sg = byId.get(groupId);
    if (!sg) return [];
    const childIds = new Set(childIdsOf.get(groupId) ?? []);
    const nested = new Set<string>();
    for (const childId of childIds) for (const leaf of allLeavesOf(childId)) nested.add(leaf);
    return sg.nodes.filter((id) => !childIds.has(id) && !nested.has(id) && vertices.has(id));
  };
  const allLeavesOf = (groupId: string): string[] => {
    const cached = leafCache.get(groupId);
    if (cached) return cached;
    const children = childIdsOf.get(groupId) ?? [];
    const leaves = [
      ...directLeavesOf(groupId),
      ...children.flatMap((childId) => allLeavesOf(childId)),
    ];
    leafCache.set(groupId, leaves);
    return leaves;
  };

  const depthOf = (groupId: string): number => {
    let depth = 0;
    let cur = parentOf.get(groupId);
    while (cur !== undefined) {
      depth++;
      cur = parentOf.get(cur);
    }
    return depth;
  };

  const groups: FlowchartGroup[] = [];
  const titleHMap = new Map<string, number>();
  for (const sg of subgraphs) {
    const allLeaves = allLeavesOf(sg.id);
    if (allLeaves.length === 0) continue;
    const title = wrapLabel(sg.title ?? '');
    const measuredTitle = measureLabelForLayout(title);
    // 标题带高度：单行用默认带高，多行按实测文本高补足
    const titleH = Math.max(
      GROUP_TITLE_H,
      GROUP_TITLE_H + Math.ceil(measuredTitle.h) - LINE_HEIGHT,
    );
    titleHMap.set(sg.id, titleH);
    groups.push({
      id: sg.id,
      title,
      titleW: Math.ceil(measuredTitle.w),
      titleH,
      depth: depthOf(sg.id),
      leaves: directLeavesOf(sg.id),
      children: childIdsOf.get(sg.id) ?? [],
      style: toNodeStyle(parseStyleDecls(collectDecls(sg.classes, undefined, classes))),
    });
  }

  // 叶子 -> 由外到内的组链（同层多组时按 subgraph 出现顺序稳定取第一个）
  const chainMap = new Map<string, string[]>();
  for (const group of groups) {
    for (const leaf of group.leaves) {
      if (chainMap.has(leaf)) continue;
      const chain: string[] = [];
      let cur: string | undefined = group.id;
      while (cur !== undefined) {
        chain.unshift(cur);
        cur = parentOf.get(cur);
      }
      chainMap.set(leaf, chain);
    }
  }

  return {
    groups,
    chainOf: (nodeId) => chainMap.get(nodeId) ?? [],
    titleHOf: (groupId) => titleHMap.get(groupId) ?? GROUP_TITLE_H,
  };
}

/* ------------------------------------------------------------------ */
/* 自动布局 - Sugiyama 层级布局框架                                      */
/* ------------------------------------------------------------------ */

/** 布局参数 */
const LAY_BASE = 50;
const LAY_H_GAP = 40;
const LAY_V_GAP = 60;
/** dummy 节点 ID 前缀 */
const DUMMY_PREFIX = '__dummy_';

/** 跨层长边（span>=2，已插入 dummy 链）信息，用于通道航点烘焙 */
interface LongEdgeInfo {
  /** DAG 方向 key `${u}->${v}` */
  key: string;
  u: string;
  v: string;
  /** 中间各层的 dummy 节点（从 lu+1 到 lv-1） */
  chain: string[];
}

/**
 * Phase 1: 构建有向无环图。
 *
 * - 移除自环 (A->A)
 * - DFS 检测回边并**移除**（而非翻转）消环：
 *   回边不参与分层/排序/对齐，避免其 dummy 链扰动主链的交叉轴对齐；
 *   布局完成后回边以"外侧环路"方式独立布线（见 layoutNodes）。
 * - 返回处理后的邻接表（不修改原始 edges）
 */
function buildDAG(
  nodeIds: string[],
  edges: { start: string; end: string }[],
): { outgoing: Map<string, string[]>; incoming: Map<string, string[]> } {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const id of nodeIds) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }

  const seen = new Set<string>();
  for (const e of edges) {
    if (e.start === e.end) continue;
    const key = `${e.start}->${e.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (outgoing.has(e.start) && incoming.has(e.end)) {
      outgoing.get(e.start)!.push(e.end);
      incoming.get(e.end)!.push(e.start);
    }
  }

  // DFS 回边检测
  const color = new Map<string, number>();
  for (const id of nodeIds) color.set(id, 0);
  const backEdges: [string, string][] = [];

  const dfs = (node: string) => {
    color.set(node, 1);
    for (const next of outgoing.get(node) ?? []) {
      const c = color.get(next) ?? 0;
      if (c === 1) backEdges.push([node, next]);
      else if (c === 0) dfs(next);
    }
    color.set(node, 2);
  };
  for (const id of nodeIds) if (color.get(id) === 0) dfs(id);

  // 移除回边（不翻转）：回边不参与布局，布局后走外侧环路
  for (const [u, v] of backEdges) {
    const ou = outgoing.get(u)!;
    const iv = incoming.get(v)!;
    ou.splice(ou.indexOf(v), 1);
    iv.splice(iv.indexOf(u), 1);
  }

  return { outgoing, incoming };
}

/**
 * Phase 2: 最长路径分层。
 *
 * 每个节点放在 max(前驱层 + 1)，保证节点出现在正确的"深度"，
 * 同时图的高度（层数）最小化。
 */
function assignLayers(
  nodeIds: string[],
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
): string[][] {
  const inDeg = new Map<string, number>();
  for (const id of nodeIds) inDeg.set(id, (incoming.get(id) ?? []).length);

  const queue: string[] = [];
  for (const id of nodeIds) if (inDeg.get(id) === 0) queue.push(id);
  if (queue.length === 0 && nodeIds.length > 0) {
    queue.push(nodeIds[0]);
    inDeg.set(nodeIds[0], 0);
  }

  const topo: string[] = [];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const node = queue.shift()!;
    topo.push(node);
    visited.add(node);
    for (const next of outgoing.get(node) ?? []) {
      const d = (inDeg.get(next) ?? 1) - 1;
      inDeg.set(next, d);
      if (d === 0 && !visited.has(next)) queue.push(next);
    }
    if (queue.length === 0 && topo.length < nodeIds.length) {
      for (const id of nodeIds) {
        if (!visited.has(id)) {
          queue.push(id);
          inDeg.set(id, 0);
          break;
        }
      }
    }
  }

  const layer = new Map<string, number>();
  for (const node of topo) {
    const preds = incoming.get(node) ?? [];
    layer.set(node, preds.length === 0 ? 0 : Math.max(...preds.map((p) => (layer.get(p) ?? 0) + 1)));
  }

  const maxLayer = Math.max(0, ...Array.from(layer.values()));
  const levels: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const node of topo) levels[layer.get(node)!].push(node);
  return levels;
}

/**
 * Phase 3: 为跨层边插入虚拟节点。
 *
 * 边 (u, v) 跨 k 层时，在中间各层插入 dummy，使所有边只跨 1 层。
 * 这是交叉最小化的前提——只有相邻层之间的边才能被正确重排序。
 */
function insertDummies(
  levels: string[][],
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
): {
  levels: string[][];
  outgoing: Map<string, string[]>;
  incoming: Map<string, string[]>;
  isDummy: Set<string>;
  edgeToDummies: Map<string, { u: string; v: string; chain: string[] }>;
} {
  const newLevels = levels.map((l) => [...l]);
  const newOut = new Map<string, string[]>();
  const newIn = new Map<string, string[]>();
  const isDummy = new Set<string>();
  const edgeToDummies = new Map<string, { u: string; v: string; chain: string[] }>();
  for (const [k, v] of outgoing) newOut.set(k, [...v]);
  for (const [k, v] of incoming) newIn.set(k, [...v]);

  const layerOf = new Map<string, number>();
  for (let i = 0; i < levels.length; i++)
    for (const n of levels[i]) layerOf.set(n, i);

  const allEdges: [string, string][] = [];
  for (const [u, vs] of outgoing) for (const v of vs) allEdges.push([u, v]);

  let count = 0;
  for (const [u, v] of allEdges) {
    const lu = layerOf.get(u)!;
    const lv = layerOf.get(v)!;
    const span = lv - lu;
    if (span <= 1) continue;

    newOut.get(u)!.splice(newOut.get(u)!.indexOf(v), 1);
    newIn.get(v)!.splice(newIn.get(v)!.indexOf(u), 1);

    let prev = u;
    const chain: string[] = [];
    for (let l = lu + 1; l < lv; l++) {
      const d = `${DUMMY_PREFIX}${count++}`;
      isDummy.add(d);
      chain.push(d);
      newOut.set(d, []);
      newIn.set(d, []);
      newLevels[l].push(d);
      layerOf.set(d, l);
      newOut.get(prev)!.push(d);
      newIn.get(d)!.push(prev);
      prev = d;
    }
    newOut.get(prev)!.push(v);
    newIn.get(v)!.push(prev);
    edgeToDummies.set(`${u}->${v}`, { u, v, chain });
  }

  return { levels: newLevels, outgoing: newOut, incoming: newIn, isDummy, edgeToDummies };
}

/**
 * 统计两个相邻层之间的边交叉数。
 * 仅考虑 upper->lower 的边（DAG 后所有边前向）。
 */
function countCrossingsBetween(
  upper: string[],
  lower: string[],
  outgoing: Map<string, string[]>,
): number {
  const upPos = new Map<string, number>();
  upper.forEach((n, i) => upPos.set(n, i));
  const loPos = new Map<string, number>();
  lower.forEach((n, i) => loPos.set(n, i));

  const pairs: [number, number][] = [];
  for (const u of upper) {
    for (const v of outgoing.get(u) ?? []) {
      const p = loPos.get(v);
      if (p !== undefined) pairs.push([upPos.get(u)!, p]);
    }
  }

  let count = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      if (pairs[i][0] < pairs[j][0] && pairs[i][1] > pairs[j][1]) count++;
      else if (pairs[i][0] > pairs[j][0] && pairs[i][1] < pairs[j][1]) count++;
    }
  }
  return count;
}

/**
 * 相邻交换法 - 直接最小化交叉数。
 *
 * 对每层尝试交换相邻节点对，如果交换后与上下层的交叉总数减少则保留。
 * barycenter 是间接启发式，相邻交换直接优化目标函数，消除残余交叉。
 */
function adjacentExchange(
  levels: string[][],
  outgoing: Map<string, string[]>,
  maxRounds = 4,
): string[][] {
  const result = levels.map((l) => [...l]);

  const layerCrossings = (l: number): number => {
    let total = 0;
    if (l > 0) total += countCrossingsBetween(result[l - 1], result[l], outgoing);
    if (l < result.length - 1) total += countCrossingsBetween(result[l], result[l + 1], outgoing);
    return total;
  };

  for (let round = 0; round < maxRounds; round++) {
    let improved = false;
    for (let l = 0; l < result.length; l++) {
      for (let i = 0; i < result[l].length - 1; i++) {
        const before = layerCrossings(l);
        [result[l][i], result[l][i + 1]] = [result[l][i + 1], result[l][i]];
        const after = layerCrossings(l);
        if (after < before) improved = true;
        else [result[l][i], result[l][i + 1]] = [result[l][i + 1], result[l][i]];
      }
    }
    if (!improved) break;
  }
  return result;
}

/**
 * Phase 4: 交叉最小化 — Barycenter 启发式。
 *
 * 多轮上下交替扫描，每层按邻居层位置均值排序。
 * barycenter 相同时保持原序（稳定排序），避免无谓抖动。
 */
function minimizeCrossings(
  levels: string[][],
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
  sweeps = 8,
): string[][] {
  const result = levels.map((l) => [...l]);

  // --- Step 1: DFS 初始排序 ---
  const dfsOrder = new Map<string, number>();
  let counter = 0;
  const visited = new Set<string>();
  const dfs = (node: string) => {
    if (visited.has(node)) return;
    visited.add(node);
    dfsOrder.set(node, counter++);
    for (const next of outgoing.get(node) ?? []) dfs(next);
  };
  for (const node of result[0] ?? []) dfs(node);
  for (const layer of result) for (const node of layer) if (!visited.has(node)) dfs(node);
  for (const layer of result) layer.sort((a, b) => (dfsOrder.get(a) ?? 0) - (dfsOrder.get(b) ?? 0));

  // --- Step 2: Barycenter ---
  const baryUp = (node: string, layer: number): number => {
    const ns = incoming.get(node) ?? [];
    let sum = 0, n = 0;
    for (const nb of ns) {
      const p = result[layer - 1]?.indexOf(nb);
      if (p !== undefined && p >= 0) { sum += p; n++; }
    }
    return n > 0 ? sum / n : -1;
  };

  const baryDown = (node: string, layer: number): number => {
    const ns = outgoing.get(node) ?? [];
    let sum = 0, n = 0;
    for (const nb of ns) {
      const p = result[layer + 1]?.indexOf(nb);
      if (p !== undefined && p >= 0) { sum += p; n++; }
    }
    return n > 0 ? sum / n : -1;
  };

  const sortLayer = (layer: number, baryFn: (n: string, l: number) => number) => {
    result[layer].sort((a, b) => {
      const ba = baryFn(a, layer);
      const bb = baryFn(b, layer);
      if (ba === -1 && bb === -1) return 0;
      if (ba === -1) return 1;
      if (bb === -1) return -1;
      const diff = ba - bb;
      return Math.abs(diff) < 0.01 ? 0 : diff;
    });
  };

  for (let s = 0; s < sweeps; s++) {
    if (s % 2 === 0) {
      for (let l = 1; l < result.length; l++) sortLayer(l, baryUp);
    } else {
      for (let l = result.length - 2; l >= 0; l--) sortLayer(l, baryDown);
    }
  }

  // --- Step 3: 相邻交换 ---
  return adjacentExchange(result, outgoing);
}

/**
 * Phase 4.5: 分组收拢。
 *
 * 交叉最小化只看拓扑，会把同一个 subgraph 的节点打散到别组节点之间；
 * 这里按"祖先链上各组在本层分组节点中的首次出现位置"作比较键做**稳定排序**，
 * 把同组节点收拢成连续的块（组内原相对顺序不变）。
 *
 * 只重排有分组的节点，且只占用它们原本的槽位——dummy（跨层长边的占位）与
 * 未分组节点原封不动，避免扰动交叉最小化与长边通道的位置。
 *
 * 例：`[IAA(G3), AU(G4), ORG(G3)]` 的键分别是 `[0,0] / [0,1] / [0,0]`
 * -> `[IAA, ORG, AU]`。
 */
function applyGroupContiguity(
  levels: string[][],
  chainOf: (nodeId: string) => string[],
): string[][] {
  return levels.map((level) => {
    const grouped = level.filter((node) => chainOf(node).length > 0);
    if (grouped.length < 2) return [...level];

    const firstSeen = new Map<string, number>();
    grouped.forEach((node, index) => {
      for (const groupId of chainOf(node)) {
        if (!firstSeen.has(groupId)) firstSeen.set(groupId, index);
      }
    });
    const sorted = [...grouped].sort((a, b) => {
      const ka = chainOf(a).map((g) => firstSeen.get(g)!);
      const kb = chainOf(b).map((g) => firstSeen.get(g)!);
      const shared = Math.min(ka.length, kb.length);
      for (let i = 0; i < shared; i++) {
        if (ka[i] !== kb[i]) return ka[i] - kb[i];
      }
      return ka.length - kb.length;
    });

    let next = 0;
    return level.map((node) => (chainOf(node).length > 0 ? sorted[next++] : node));
  });
}

/** 数值数组中位数（偶数个取中间两值均值） */
function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Phase 5 + 6: 坐标分配 + 方向转换 + 跨层边通道航点烘焙。
 *
 * 交叉轴（cross）：真正的中位数迭代对齐——4 轮交替
 *   下扫（节点期望 cross 中心 = 父节点 cross 中心中位数）/
 *   上扫（子节点 cross 中心中位数），每轮后做保序防重叠放置
 *   （左→右 与 右→左 镜像交替，保证不引入新交叉）。
 *   dummy 节点（0 宽）参与中位数对齐，使跨层长边尽量拉直。
 *
 * 主轴（main）：逐层累计层内最大尺寸 + 自适应缝隙——
 *   被 k 条跨层长边（span>=2）穿过的缝，gap = max(LAY_*_GAP, 20 + k*12)，
 *   为通道线留位。
 *
 * 跨层长边：每条缝的通道带 = [上层最大底 + 8, 下层最小顶 - 8]，穿过该缝的
 *   长边按 cross 坐标排序均摊到不同通道线；航点序列沿 dummy 链逐缝按
 *   (cross_cur, channel) -> (cross_next, channel) 交替生成，与节点坐标一起
 *   做 main/cross -> x/y 变换。相邻层边不生成航点——端口约束 + 内置 Z 形
 *   路由已保证干净，且保留用户拖节点后的动态重路由能力。
 *
 * 最后将抽象 main/cross 坐标转为 {x, y}，BT/RL 翻转主轴，
 * 整体偏移使最小坐标 >= LAY_BASE。
 */
function assignCoordinates(
  levels: string[][],
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
  sizes: Map<string, { w: number; h: number }>,
  isDummy: Set<string>,
  direction: string,
  longEdges: LongEdgeInfo[],
  groups: FlowchartGroups,
): {
  positions: Map<string, { x: number; y: number }>;
  channelWaypoints: Map<string, { x: number; y: number }[]>;
  /** 每条缝（层 m 与 m+1 之间）中点的抽象 main 坐标，供回边外侧环路取道 */
  seamMids: number[];
  /** main/cross -> x/y 变换参数（回边环路在 xy 空间直接构造时需要） */
  geom: {
    isHorizontal: boolean;
    isReverse: boolean;
    totalMain: number;
    offX: number;
    offY: number;
  };
} {
  const isHorizontal = direction === 'LR' || direction === 'RL';
  const isReverse = direction === 'RL' || direction === 'BT';

  const sizeOf = (id: string) =>
    isDummy.has(id) ? { w: 0, h: 0 } : sizes.get(id) ?? { w: 120, h: 60 };
  const mainDim = (id: string) => (isHorizontal ? sizeOf(id).w : sizeOf(id).h);
  const crossDim = (id: string) => (isHorizontal ? sizeOf(id).h : sizeOf(id).w);
  const baseMainGap = isHorizontal ? LAY_H_GAP : LAY_V_GAP;
  const crossGap = isHorizontal ? LAY_V_GAP : LAY_H_GAP;

  const layerOf = new Map<string, number>();
  for (let l = 0; l < levels.length; l++)
    for (const n of levels[l]) layerOf.set(n, l);

  // ---- 分组约束：层内额外间距 + 层间组框留白 ----
  // 同层相邻两节点每跨一道组边界（一进一出）就要让出组框边到成员的内边距，
  // 组框才不会压住隔壁组的成员。dummy 不参与（它本身就是不可见占位）。
  const groupBoundaryCount = (a: string, b: string): number => {
    const ca = groups.chainOf(a);
    const cb = groups.chainOf(b);
    const setB = new Set(cb);
    const setA = new Set(ca);
    return ca.filter((g) => !setB.has(g)).length + cb.filter((g) => !setA.has(g)).length;
  };
  const gapBetween = (a: string, b: string): number =>
    isDummy.has(a) || isDummy.has(b)
      ? crossGap
      : crossGap + GROUP_GAP_UNIT * groupBoundaryCount(a, b);

  // 每个组在主轴上的起止层：组框顶部（标题带 + 内边距）要跨出起始层上沿、
  // 底部（内边距）要跨出结束层下沿，逐层累加嵌套组框的溢出量。
  const groupMinLayer = new Map<string, number>();
  const groupMaxLayer = new Map<string, number>();
  for (let l = 0; l < levels.length; l++) {
    for (const node of levels[l]) {
      if (isDummy.has(node)) continue;
      for (const g of groups.chainOf(node)) {
        if (!groupMinLayer.has(g)) groupMinLayer.set(g, l);
        groupMaxLayer.set(g, l);
      }
    }
  }
  /** 上层底边之外还要留多少（该层收口的组框内边距） */
  const belowOverhang = (l: number): number => {
    let over = 0;
    for (const node of levels[l]) {
      if (isDummy.has(node)) continue;
      let sum = 0;
      for (const g of groups.chainOf(node)) if (groupMaxLayer.get(g) === l) sum += GROUP_PAD;
      over = Math.max(over, sum);
    }
    return over;
  };
  /** 下层顶边之外还要留多少（在该层开张的组框内边距 + 标题带） */
  const aboveOverhang = (l: number): number => {
    let over = 0;
    for (const node of levels[l]) {
      if (isDummy.has(node)) continue;
      let sum = 0;
      for (const g of groups.chainOf(node)) {
        if (groupMinLayer.get(g) !== l) continue;
        // 标题带只占主轴外层方向的留白：TB/BT 时它压在层与层之间，
        // LR/RL 时它是框内竖直方向的东西，由层内间距（gapBetween）覆盖。
        sum += GROUP_PAD + (isHorizontal ? 0 : groups.titleHOf(g));
      }
      over = Math.max(over, sum);
    }
    return over;
  };

  // ---- 主轴（层 Y / 层 X）：逐层累计，缝隙按穿过长边数 + 组框溢出量自适应 ----
  const seamCount = new Array<number>(Math.max(0, levels.length - 1)).fill(0);
  for (const le of longEdges) {
    const lu = layerOf.get(le.u)!;
    const lv = layerOf.get(le.v)!;
    for (let m = lu; m < lv; m++) seamCount[m]++;
  }

  const mainPos = new Map<string, number>();
  const levelMaxMain: number[] = [];
  let mainCursor = 0;
  for (let l = 0; l < levels.length; l++) {
    const mx = Math.max(0, ...levels[l].map(mainDim));
    levelMaxMain.push(mx);
    for (const node of levels[l]) mainPos.set(node, mainCursor);
    mainCursor += mx;
    if (l < levels.length - 1) {
      mainCursor +=
        Math.max(baseMainGap, 20 + seamCount[l] * 12) +
        belowOverhang(l) +
        aboveOverhang(l + 1);
    }
  }
  const totalMain = mainCursor;

  // ---- 交叉轴：中位数迭代对齐 ----
  const crossPos = new Map<string, number>();
  // 初始放置：按定序从左到右打包
  for (const layer of levels) {
    let cursor = 0;
    for (let i = 0; i < layer.length; i++) {
      const node = layer[i];
      crossPos.set(node, cursor);
      cursor +=
        crossDim(node) + (i < layer.length - 1 ? gapBetween(node, layer[i + 1]) : 0);
    }
  }
  const crossCenter = (id: string) => crossPos.get(id)! + crossDim(id) / 2;

  /** 保序防重叠放置：leftToRight 与镜像交替，保持层内既定顺序 */
  const placeLayer = (
    layer: string[],
    desired: Map<string, number>,
    leftToRight: boolean,
  ) => {
    if (leftToRight) {
      let cursor = -Infinity;
      for (let i = 0; i < layer.length; i++) {
        const node = layer[i];
        const w = crossDim(node);
        const d = desired.get(node);
        let x = d !== undefined ? d - w / 2 : crossPos.get(node)!;
        x = Math.max(x, cursor);
        crossPos.set(node, x);
        cursor = x + w + (i < layer.length - 1 ? gapBetween(node, layer[i + 1]) : 0);
      }
    } else {
      let cursor = Infinity;
      for (let i = layer.length - 1; i >= 0; i--) {
        const node = layer[i];
        const w = crossDim(node);
        const d = desired.get(node);
        let x = d !== undefined ? d - w / 2 : crossPos.get(node)!;
        x = Math.min(x, cursor - w);
        crossPos.set(node, x);
        cursor = x - (i > 0 ? gapBetween(layer[i - 1], node) : 0);
      }
    }
  };

  for (let round = 0; round < 4; round++) {
    const down = round % 2 === 0;
    const leftToRight = round % 2 === 0;
    if (down) {
      for (let l = 1; l < levels.length; l++) {
        const desired = new Map<string, number>();
        for (const node of levels[l]) {
          const centers = (incoming.get(node) ?? []).map((nb) => crossCenter(nb));
          if (centers.length > 0) desired.set(node, medianOf(centers));
        }
        placeLayer(levels[l], desired, leftToRight);
      }
    } else {
      for (let l = levels.length - 2; l >= 0; l--) {
        const desired = new Map<string, number>();
        for (const node of levels[l]) {
          const centers = (outgoing.get(node) ?? []).map((nb) => crossCenter(nb));
          if (centers.length > 0) desired.set(node, medianOf(centers));
        }
        placeLayer(levels[l], desired, leftToRight);
      }
    }
  }

  // ---- 跨层长边通道布线（仅 span>=2 的边） ----
  /** 长边在层 l 处经过的节点（u / dummy / v） */
  const nodeAtLayer = (le: LongEdgeInfo, l: number): string => {
    const lu = layerOf.get(le.u)!;
    if (l === lu) return le.u;
    if (l === layerOf.get(le.v)!) return le.v;
    return le.chain[l - lu - 1];
  };

  // 每条缝独立分配通道线：穿过该缝的长边按 cross 排序，均摊到通道带内
  const channelOf = new Map<string, number[]>(); // key -> 按缝升序的通道 main 坐标
  for (let m = 0; m < levels.length - 1; m++) {
    const crossing = longEdges
      .filter((le) => layerOf.get(le.u)! <= m && layerOf.get(le.v)! > m)
      .sort((a, b) => {
        const ca = (crossCenter(nodeAtLayer(a, m)) + crossCenter(nodeAtLayer(a, m + 1))) / 2;
        const cb = (crossCenter(nodeAtLayer(b, m)) + crossCenter(nodeAtLayer(b, m + 1))) / 2;
        return ca - cb;
      });
    if (crossing.length === 0) continue;
    const bandTop = mainPos.get(levels[m][0])! + levelMaxMain[m] + 8;
    const bandBottom = mainPos.get(levels[m + 1][0])! - 8;
    const bandH = bandBottom - bandTop;
    crossing.forEach((le, i) => {
      const ch = bandTop + (bandH * (i + 1)) / (crossing.length + 1);
      const arr = channelOf.get(le.key) ?? [];
      arr.push(ch);
      channelOf.set(le.key, arr);
    });
  }

  // ---- 转为 {x, y}（含 dummy），BT/RL 翻转主轴 ----
  const positions = new Map<string, { x: number; y: number }>();
  let minX = Infinity,
    minY = Infinity;

  for (let l = 0; l < levels.length; l++) {
    for (const node of levels[l]) {
      const mp = mainPos.get(node)!;
      const cp = crossPos.get(node)!;
      const s = sizeOf(node);
      let x: number, y: number;
      if (isHorizontal) {
        x = isReverse ? totalMain - mp - s.w : mp;
        y = cp;
      } else {
        x = cp;
        y = isReverse ? totalMain - mp - s.h : mp;
      }
      positions.set(node, { x, y });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
    }
  }

  const offX = Math.max(0, LAY_BASE - (minX === Infinity ? 0 : minX));
  const offY = Math.max(0, LAY_BASE - (minY === Infinity ? 0 : minY));
  if (offX > 0 || offY > 0) {
    for (const [, pos] of positions) {
      pos.x += offX;
      pos.y += offY;
    }
  }

  // ---- 通道航点：main/cross -> x/y（与节点同一变换 + 同一偏移） ----
  const toXY = (main: number, cross: number): { x: number; y: number } => {
    const m = isReverse ? totalMain - main : main;
    return isHorizontal
      ? { x: m + offX, y: cross + offY }
      : { x: cross + offX, y: m + offY };
  };

  const channelWaypoints = new Map<string, { x: number; y: number }[]>();
  for (const le of longEdges) {
    const channels = channelOf.get(le.key);
    if (!channels) continue;
    const lu = layerOf.get(le.u)!;
    const lv = layerOf.get(le.v)!;
    const abs: { main: number; cross: number }[] = [];
    for (let m = lu; m < lv; m++) {
      const ch = channels[m - lu];
      const cCur = crossCenter(nodeAtLayer(le, m));
      const cNext = crossCenter(nodeAtLayer(le, m + 1));
      abs.push({ main: ch, cross: cCur });
      abs.push({ main: ch, cross: cNext });
    }
    // 去除连续重复点（长边在该缝完全拉直时 cCur === cNext）
    const deduped: { main: number; cross: number }[] = [];
    for (const p of abs) {
      const last = deduped[deduped.length - 1];
      if (last && last.main === p.main && last.cross === p.cross) continue;
      deduped.push(p);
    }
    channelWaypoints.set(le.key, deduped.map((p) => toXY(p.main, p.cross)));
  }

  // ---- 缝隙中点（抽象 main 坐标），供回边外侧环路取道 ----
  const seamMids: number[] = [];
  for (let m = 0; m < levels.length - 1; m++) {
    if (levels[m].length === 0 || levels[m + 1].length === 0) {
      seamMids.push(0);
      continue;
    }
    const upper = mainPos.get(levels[m][0])! + levelMaxMain[m];
    const lower = mainPos.get(levels[m + 1][0])!;
    seamMids.push((upper + lower) / 2);
  }

  return {
    positions,
    channelWaypoints,
    seamMids,
    geom: { isHorizontal, isReverse, totalMain, offX, offY },
  };
}

/**
 * 尺寸感知的层级布局（Sugiyama 框架）。
 *
 * 完整流程：
 *   1. buildDAG       — 构建有向图，移除自环，DFS 检测回边并移除（不翻转）
 *   2. assignLayers   — 最长路径分层（拓扑序 + max(前驱层+1)）
 *   3. insertDummies  — 跨层边插入虚拟节点，使所有边只跨 1 层
 *   4. minimizeCrossings — Barycenter 启发式，8 轮上下交替减少交叉
 *   5. assignCoordinates — 中位数迭代对齐 + 自适应缝隙 + 跨层边通道航点烘焙
 *   6. 回边外侧环路布线 —— 回边（逆流边）不参与上述布局，统一走图外侧
 *      车道（cross 轴外侧按跨距堆叠），4 段直角环路，不穿节点、互不重叠；
 *      共享源/目标面的多条回边端口按 cross 方向摊开，缝隙取道错开。
 *
 * @param sizes 每个节点的实际渲染尺寸（由 computeNodeSize 得出）
 * @param groups 分组索引（来自 buildGroups）；不传视为无分组
 * @returns waypoints / ports 均以原始 edges 数组下标为键
 */
export function layoutNodes(
  vertices: Map<string, MermaidVertex>,
  edges: MermaidEdge[],
  direction: string,
  sizes: Map<string, { w: number; h: number }>,
  groups: FlowchartGroups = NO_GROUPS,
): {
  positions: Map<string, { x: number; y: number }>;
  waypoints: Map<number, { x: number; y: number }[]>;
  ports: Map<number, { exit: { x: number; y: number }; entry: { x: number; y: number } }>;
} {
  const nodeIds = Array.from(vertices.keys());
  if (nodeIds.length === 0)
    return { positions: new Map(), waypoints: new Map(), ports: new Map() };

  // Phase 1
  const { outgoing, incoming } = buildDAG(nodeIds, edges);
  // Phase 2
  const levels = assignLayers(nodeIds, outgoing, incoming);
  // Phase 3
  const { levels: dLevels, outgoing: dOut, incoming: dIn, isDummy, edgeToDummies } =
    insertDummies(levels, outgoing, incoming);
  // Phase 4 + 4.5（交叉最小化后按分组收拢）
  const ordered = applyGroupContiguity(minimizeCrossings(dLevels, dOut, dIn), groups.chainOf);
  // Phase 5（含 dummy 位置与跨层边通道航点）
  const longEdges: LongEdgeInfo[] = [];
  for (const [key, info] of edgeToDummies) {
    longEdges.push({ key, u: info.u, v: info.v, chain: info.chain });
  }
  const { positions: allPositions, channelWaypoints, seamMids, geom } = assignCoordinates(
    ordered,
    dOut,
    dIn,
    sizes,
    isDummy,
    direction,
    longEdges,
    groups,
  );

  // 分离真实节点位置与 dummy
  const positions = new Map<string, { x: number; y: number }>();
  for (const [id, pos] of allPositions) {
    if (!isDummy.has(id)) positions.set(id, pos);
  }

  // 真实节点层号（前向图分层，回边不参与）
  const layerOf = new Map<string, number>();
  for (let l = 0; l < levels.length; l++)
    for (const n of levels[l]) layerOf.set(n, l);

  const isHorizontal = geom.isHorizontal;
  const sizeOf = (id: string) => sizes.get(id) ?? { w: 120, h: 60 };
  const mainCenterOf = (id: string) => {
    const p = positions.get(id)!;
    const s = sizeOf(id);
    return isHorizontal ? p.x + s.w / 2 : p.y + s.h / 2;
  };
  /** 抽象 main 坐标 -> xy 主轴坐标（含翻转与偏移） */
  const mainToXY = (m: number) =>
    (geom.isReverse ? geom.totalMain - m : m) + (isHorizontal ? geom.offX : geom.offY);

  const waypoints = new Map<number, { x: number; y: number }[]>();
  const ports = new Map<number, { exit: { x: number; y: number }; entry: { x: number; y: number } }>();

  // ---- 分类：回边（逆流边）按最终主轴坐标判定 ----
  // 坐标方向与布局流向相反的边 = 回边。比较的是最终坐标，天然兼容 BT/RL
  // 与平行边（buildDAG 去重后平行回边不在布局图里，但坐标判定能覆盖到）。
  const loopIdx: number[] = [];
  const edgeDelta: number[] = []; // 各边 target - source 的主轴中心差
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    edgeDelta.push(0);
    if (e.start === e.end) continue;
    if (!positions.has(e.start) || !positions.has(e.end)) continue;
    const d = mainCenterOf(e.end) - mainCenterOf(e.start);
    edgeDelta[i] = d;
    const backward = geom.isReverse ? d > 0 : d < 0;
    if (backward && layerOf.has(e.start) && layerOf.has(e.end)) loopIdx.push(i);
  }

  // ---- 端口烘焙（所有边）：顺流右出左进 / 下出上进，逆流反之 ----
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (e.start === e.end) continue;
    if (!positions.has(e.start) || !positions.has(e.end)) continue;
    const forward = edgeDelta[i] >= 0;
    let exit: { x: number; y: number };
    let entry: { x: number; y: number };
    if (isHorizontal) {
      exit = forward ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 };
      entry = forward ? { x: 0, y: 0.5 } : { x: 1, y: 0.5 };
    } else {
      exit = forward ? { x: 0.5, y: 1 } : { x: 0.5, y: 0 };
      entry = forward ? { x: 0.5, y: 0 } : { x: 0.5, y: 1 };
    }
    ports.set(i, { exit, entry });
  }

  // ---- 回边外侧环路布线 ----
  if (loopIdx.length > 0) {
    // 车道排序：跨距越大（目标层越小、源层越大）的环路走越外侧，
    // 外层环路的竖/横段不会穿过内层环路的水平车道
    const sorted = [...loopIdx].sort((a, b) => {
      const la = layerOf.get(edges[a].end)! - layerOf.get(edges[a].start)!;
      const lb = layerOf.get(edges[b].end)! - layerOf.get(edges[b].start)!;
      if (la !== lb) return la - lb; // 跨距（end - start 为负，越小跨越大）
      return a - b;
    });
    const laneRank = new Map<number, number>();
    sorted.forEach((idx, rank) => laneRank.set(idx, rank));

    // 外侧车道基准：所有真实节点的 cross 轴最大外延
    let maxCross = -Infinity;
    for (const [id, p] of positions) {
      const s = sizeOf(id);
      maxCross = Math.max(maxCross, isHorizontal ? p.y + s.h : p.x + s.w);
    }
    const laneOf = (idx: number) =>
      maxCross + 24 + (sorted.length - 1 - laneRank.get(idx)!) * 16;

    // 共享源/目标面的回边端口沿 cross 方向摊开（0.5 为中心，步长 0.2）
    const spreadPort = (keyOf: (e: MermaidEdge) => string, isExit: boolean) => {
      const groups = new Map<string, number[]>();
      for (const idx of loopIdx) {
        const k = keyOf(edges[idx]);
        const arr = groups.get(k) ?? [];
        arr.push(idx);
        groups.set(k, arr);
      }
      for (const arr of groups.values()) {
        if (arr.length < 2) continue;
        arr.sort((a, b) => laneRank.get(a)! - laneRank.get(b)!);
        arr.forEach((idx, i) => {
          const rel = 0.5 + (i - (arr.length - 1) / 2) * 0.2;
          const p = ports.get(idx)!;
          if (isExit) {
            p.exit = isHorizontal ? { x: p.exit.x, y: rel } : { x: rel, y: p.exit.y };
          } else {
            p.entry = isHorizontal ? { x: p.entry.x, y: rel } : { x: rel, y: p.entry.y };
          }
        });
      }
    };
    spreadPort((e) => e.start, true);
    spreadPort((e) => e.end, false);

    // 缝隙取道错开：共用同一条缝（源侧/目标侧）的环路按车道序错开 ±12
    const staggerOf = (seamOf: (idx: number) => number) => {
      const groups = new Map<number, number[]>();
      for (const idx of loopIdx) {
        const m = seamOf(idx);
        const arr = groups.get(m) ?? [];
        arr.push(idx);
        groups.set(m, arr);
      }
      const result = new Map<number, number>();
      for (const arr of groups.values()) {
        arr.sort((a, b) => laneRank.get(a)! - laneRank.get(b)!);
        arr.forEach((idx, i) => result.set(idx, (i - (arr.length - 1) / 2) * 12));
      }
      return result;
    };
    const stagSource = staggerOf((idx) => layerOf.get(edges[idx].start)! - 1);
    const stagTarget = staggerOf((idx) => layerOf.get(edges[idx].end)!);

    for (const idx of loopIdx) {
      const e = edges[idx];
      const sp = positions.get(e.start)!;
      const tp = positions.get(e.end)!;
      const ss = sizeOf(e.start);
      const ts = sizeOf(e.end);
      const p = ports.get(idx)!;
      // 端口的 cross 轴绝对坐标（用摊开后的相对值）
      const exitCross = isHorizontal ? sp.y + p.exit.y * ss.h : sp.x + p.exit.x * ss.w;
      const entryCross = isHorizontal ? tp.y + p.entry.y * ts.h : tp.x + p.entry.x * ts.w;
      const gapS = mainToXY(seamMids[layerOf.get(e.start)! - 1]) + (stagSource.get(idx) ?? 0);
      const gapT = mainToXY(seamMids[layerOf.get(e.end)!]) + (stagTarget.get(idx) ?? 0);
      const lane = laneOf(idx);

      const raw = isHorizontal
        ? [
            { x: gapS, y: exitCross },
            { x: gapS, y: lane },
            { x: gapT, y: lane },
            { x: gapT, y: entryCross },
          ]
        : [
            { x: exitCross, y: gapS },
            { x: lane, y: gapS },
            { x: lane, y: gapT },
            { x: entryCross, y: gapT },
          ];
      // 去除连续重复点（相邻层回边时 gapS === gapT，环路退化为单侧绕线）
      const pts: { x: number; y: number }[] = [];
      for (const pt of raw) {
        const last = pts[pts.length - 1];
        if (last && last.x === pt.x && last.y === pt.y) continue;
        pts.push(pt);
      }
      waypoints.set(idx, pts);
    }
  }

  // ---- 前向跨层长边：通道航点（在 DAG 中可能被去重/不包含回边） ----
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (e.start === e.end || waypoints.has(i)) continue;
    const fwdKey = `${e.start}->${e.end}`;
    const revKey = `${e.end}->${e.start}`;
    let pts = channelWaypoints.get(fwdKey);
    let reversed = false;
    if (!pts) {
      pts = channelWaypoints.get(revKey);
      reversed = true;
    }
    if (!pts || pts.length === 0) continue;
    waypoints.set(i, reversed ? [...pts].reverse() : pts);
  }

  return { positions, waypoints, ports };
}

/* ------------------------------------------------------------------ */
/* 转换函数                                                            */
/* ------------------------------------------------------------------ */

/** 组框节点的形状：普通矩形，靠 labelAlign/labelVAlign 把标题压在框内左上角。 */
const GROUP_BOX_SHAPE: GraphNodeShape = 'rectangle';

/** 组框几何（画布坐标）。 */
interface GroupBox {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 嵌套深度，仅用于输出排序（外层先入数组 = z 序在下）。 */
  depth: number;
  style?: GraphNodeStyle;
}

/**
 * 组框几何：成员包围盒外扩 GROUP_PAD，上边再让出标题带高度。
 *
 * 子组框也算父组的成员（由内向外算）——否则嵌套时父子框齐边、两层标题叠在
 * 同一位置。返回顺序按嵌套深度升序（外层在前），入 nodes 数组后画在成员与
 * 内层框之下。
 */
function computeGroupBoxes(
  groups: FlowchartGroup[],
  positions: Map<string, { x: number; y: number }>,
  sizes: Map<string, { w: number; h: number }>,
): GroupBox[] {
  const boxById = new Map<string, GroupBox>();
  for (const group of [...groups].sort((a, b) => b.depth - a.depth)) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const include = (r: { x: number; y: number; w: number; h: number }) => {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    };
    for (const leaf of group.leaves) {
      const pos = positions.get(leaf);
      const size = sizes.get(leaf);
      if (!pos || !size) continue;
      include({ x: pos.x, y: pos.y, w: size.w, h: size.h });
    }
    for (const childId of group.children) {
      const childBox = boxById.get(childId);
      if (childBox) include(childBox);
    }
    if (minX === Infinity) continue;
    // 标题比成员更宽时（长 subgraph 名 + 窄成员）框要跟着变宽：
    // 否则标题会越出右边框，且导入后的"文字适配"会把整框向右拉大、压到隔壁组。
    const contentW = maxX - minX + 2 * GROUP_PAD;
    const boxW = Math.max(contentW, group.titleW + 2 * GROUP_PAD);
    boxById.set(group.id, {
      id: group.id,
      title: group.title,
      x: minX - GROUP_PAD,
      y: minY - GROUP_PAD - group.titleH,
      w: boxW,
      h: maxY - minY + 2 * GROUP_PAD + group.titleH,
      depth: group.depth,
      style: group.style,
    });
  }
  return groups
    .map((group) => boxById.get(group.id))
    .filter((box): box is GroupBox => box !== undefined)
    .sort((a, b) => a.depth - b.depth);
}

/**
 * 把内容整体平移进正坐标区：嵌套组框会向成员外侧再探出一层内边距 + 标题带，
 * 最外层框可能落到负坐标（布局阶段只保证成员 >= LAY_BASE）。
 */
function shiftIntoView(nodes: GraphNode[], edges: GraphEdge[]): void {
  let minX = Infinity;
  let minY = Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
  }
  if (minX === Infinity) return;
  const dx = Math.max(0, LAY_BASE - minX);
  const dy = Math.max(0, LAY_BASE - minY);
  if (dx === 0 && dy === 0) return;
  for (const node of nodes) {
    node.x += dx;
    node.y += dy;
  }
  for (const edge of edges) {
    for (const wp of edge.waypoints ?? []) {
      wp.x += dx;
      wp.y += dy;
    }
  }
}

/**
 * 将 Flowchart 数据转换为 GraphSnapshot
 */
export function convertFlowchartToSnapshot(data: FlowchartData): GraphSnapshot {
  const { vertices, edges, direction } = data;
  const classes = data.classes;
  const groups = buildGroups(data.subgraphs ?? [], classes, vertices);

  const nodes: GraphNode[] = [];
  const graphEdges: GraphEdge[] = [];

  // 1. 标签折行 + 按内容计算节点尺寸 + classDef / 行内样式
  const labels = new Map<string, string>();
  const sizes = new Map<string, { w: number; h: number }>();
  const styles = new Map<string, GraphNodeStyle>();
  for (const [id, vertex] of vertices) {
    const shape = mapVertexToShape(vertex);
    const label = wrapLabel(vertex.text ?? id);
    labels.set(id, label);
    sizes.set(id, computeNodeSize(shape, label));
    const style = resolveNodeStyle(vertex, classes);
    if (style) styles.set(id, style);
  }

  // 2. 布局计算（尺寸感知 + 分组约束）
  const dir = direction ?? 'TB';
  const { positions, waypoints, ports } = layoutNodes(vertices, edges, dir, sizes, groups);

  // 3. 组框先入数组（z 序在成员之下；重载后按数组顺序重建，顺序保持）
  for (const box of computeGroupBoxes(groups.groups, positions, sizes)) {
    nodes.push({
      id: `${GROUP_ID_PREFIX}${box.id}`,
      shape: GROUP_BOX_SHAPE,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      label: box.title,
      labelAlign: 'left',
      labelVAlign: 'top',
      style: box.style,
    });
  }

  // 4. 成员节点
  for (const [id, vertex] of vertices) {
    const size = sizes.get(id) ?? DEFAULT_NODE_SIZE.rectangle;
    const pos = positions.get(id) ?? { x: LAY_BASE, y: LAY_BASE };
    const node: GraphNode = {
      id: `node-${id}`,
      shape: mapVertexToShape(vertex),
      x: pos.x,
      y: pos.y,
      w: size.w,
      h: size.h,
      label: labels.get(id) ?? id,
    };
    const style = styles.get(id);
    if (style) node.style = style;
    nodes.push(node);
  }

  // 5. 转换连线（~~~ 不可见边只参与上面的布局，不出现在画板上）
  for (let edgeIdx = 0; edgeIdx < edges.length; edgeIdx++) {
    const edge = edges[edgeIdx];
    if (isInvisibleEdge(edge)) continue;

    const sourceId = `node-${edge.start}`;
    const targetId = `node-${edge.end}`;

    // 检查源和目标节点是否存在
    if (!vertices.has(edge.start) || !vertices.has(edge.end)) {
      continue; // 跳过无效边
    }

    const style = mapEdgeTypeToStyle(edge);
    const wp = waypoints.get(edgeIdx);
    const pt = ports.get(edgeIdx);

    const edgeStyle: GraphEdgeStyle = {
      dashed: style.dashed,
      strokeWidth: style.strokeWidth,
    };
    if (style.stroke !== undefined) edgeStyle.stroke = style.stroke;

    const graphEdge: GraphEdge = {
      // 平行边（A->B 写两次）需靠循环索引区分，不能用时间戳（同一毫秒内相同）
      id: `edge-${edge.start}-${edge.end}-${edgeIdx}`,
      source: sourceId,
      target: targetId,
      label: edge.text ?? undefined,
      routing: style.routing,
      endArrow: style.endArrow,
      style: edgeStyle,
    };

    // 烘焙端口约束（顺流右出左进 / 下出上进，逆流反之；共享面的回边已摊开）：
    // 让内置正交路由器的水平段落在层间缝隙，结构上不可能横穿同层节点。
    if (pt) {
      graphEdge.exit = pt.exit;
      graphEdge.entry = pt.entry;
    }

    if (wp && wp.length > 0) graphEdge.waypoints = wp;
    graphEdges.push(graphEdge);
  }

  // 6. 归一到正坐标区
  shiftIntoView(nodes, graphEdges);

  return {
    kind: 'jgraph',
    version: 1,
    nodes,
    edges: graphEdges,
    viewport: {
      scale: 1,
      dx: 0,
      dy: 0,
    },
  };
}
