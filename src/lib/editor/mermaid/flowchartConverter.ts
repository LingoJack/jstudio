/**
 * flowchartConverter - Mermaid Flowchart -> GraphSnapshot 转换
 *
 * 将 Mermaid flowchart/graph 语法解析后的数据转换为 GraphCanvas 可用的快照格式。
 * 包含：
 *   - 节点形状映射（Mermaid 形状 -> GraphNodeShape）
 *   - 连线样式映射（Mermaid 箭头 -> GraphEdge 样式）
 *   - 自动布局算法（基于图拓扑的层级布局）
 */

import type { FlowchartData, MermaidVertex, MermaidEdge } from './mermaidParser';
import type { GraphNode, GraphEdge, GraphNodeShape, GraphSnapshot } from '../../../components/editor/nodes/graph/graphSnapshot';

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
  topic: { w: 100, h: 36 },
  'edge-line': { w: 100, h: 20 },
  'edge-ortho': { w: 100, h: 20 },
  'edge-dashed': { w: 100, h: 20 },
  'edge-no-arrow': { w: 100, h: 20 },
};

/* ------------------------------------------------------------------ */
/* 文本测量与节点定尺寸                                                  */
/* ------------------------------------------------------------------ */

/**
 * 标签字号。与 graphTheme.SHAPE_FONT_SIZE(13) 对齐--
 * lib 层不可反向 import components 层的运行时常量，此处本地定义。
 */
const LABEL_FONT_SIZE = 13;

/** 行高（maxGraph 默认行距约 1.4 倍字号） */
const LINE_HEIGHT = Math.round(LABEL_FONT_SIZE * 1.4); // ≈18

/** ASCII 字符平均宽度估算 */
const ASCII_CHAR_WIDTH = 7;

/** 单行文本宽度上限，超过则 wrapLabel 折行，避免节点无限宽 */
const MAX_TEXT_WIDTH = 340;

/** 判断字符是否为全角宽字符（CJK / 全角符号 / 圈号数字等，约占一个字号宽） */
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
    (code >= 0x20000 && code <= 0x2fa1f) // CJK 扩展 B+
  );
}

/** 按 `<br/>` / `<br>` / `\n` 切行，并剥除残余 HTML 标签 */
function splitLabelLines(label: string): string[] {
  return label
    .split(/<br\s*\/?>|\n/gi)
    .map((l) => l.replace(/<[^>]+>/g, '').trim());
}

/** 估算单行渲染宽度：宽字符 ≈ 字号，ASCII ≈ 7px */
function estimateLineWidth(line: string): number {
  let w = 0;
  for (const ch of line) {
    w += isWideChar(ch) ? LABEL_FONT_SIZE : ASCII_CHAR_WIDTH;
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
 * 注意：过程中会剥除 label 内除换行外的 HTML 标签（mermaid 流程图
 * label 极少使用行内 HTML，剥除可避免在标签中间断行产生坏 HTML）。
 */
export function wrapLabel(label: string, maxTextWidth: number = MAX_TEXT_WIDTH): string {
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
 * 按 label 内容计算节点尺寸。
 *
 * 菱形 / 椭圆的文字须落在内接区域，系数相应放大；
 * 未列出的 shape（流程图解析不会产生）回退到 DEFAULT_NODE_SIZE。
 */
export function computeNodeSize(
  shape: GraphNodeShape,
  label: string,
): { w: number; h: number } {
  const { maxWidth, lineCount } = measureLabel(label);
  const textH = lineCount * LINE_HEIGHT;
  switch (shape) {
    case 'diamond':
      return {
        w: Math.max(100, Math.ceil(maxWidth * 1.4) + 40),
        h: Math.max(80, Math.ceil(textH * 1.9) + 24),
      };
    case 'ellipse':
      return {
        w: Math.max(120, Math.ceil(maxWidth * 1.3) + 32),
        h: Math.max(80, Math.ceil(textH * 1.4) + 24),
      };
    case 'rectangle':
    case 'rounded':
      return {
        w: Math.max(120, maxWidth + 32),
        h: Math.max(60, textH + 20),
      };
    default:
      return DEFAULT_NODE_SIZE[shape] ?? DEFAULT_NODE_SIZE.rectangle;
  }
}

/* ------------------------------------------------------------------ */
/* 连线映射                                                            */
/* ------------------------------------------------------------------ */

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
 *
 * 参考: https://mermaid.js.org/syntax/flowchart.html#links
 */
function mapEdgeTypeToStyle(edge: MermaidEdge): {
  routing: 'orthogonal' | 'straight';
  dashed: boolean;
  endArrow: string;
  strokeWidth: number;
} {
  const type = edge.type ?? '';
  const stroke = edge.stroke ?? 'normal';

  // stroke 类型: normal, dotted, thick
  const strokeWidth = stroke === 'thick' ? 3 : 1.5;
  const dashed = stroke === 'dotted';

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

  return { routing, dashed, endArrow, strokeWidth };
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
 * - DFS 检测回边并翻转，消除所有环
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

  // 翻转回边
  for (const [u, v] of backEdges) {
    const ou = outgoing.get(u)!;
    const iv = incoming.get(v)!;
    ou.splice(ou.indexOf(v), 1);
    iv.splice(iv.indexOf(u), 1);
    outgoing.get(v)!.push(u);
    incoming.get(u)!.push(v);
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
): {
  positions: Map<string, { x: number; y: number }>;
  channelWaypoints: Map<string, { x: number; y: number }[]>;
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

  // ---- 主轴（层 Y / 层 X）：逐层累计，缝隙按穿过长边数自适应 ----
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
      mainCursor += Math.max(baseMainGap, 20 + seamCount[l] * 12);
    }
  }
  const totalMain = mainCursor;

  // ---- 交叉轴：中位数迭代对齐 ----
  const crossPos = new Map<string, number>();
  // 初始放置：按定序从左到右打包
  for (const layer of levels) {
    let cursor = 0;
    for (const node of layer) {
      crossPos.set(node, cursor);
      cursor += crossDim(node) + crossGap;
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
      for (const node of layer) {
        const w = crossDim(node);
        const d = desired.get(node);
        let x = d !== undefined ? d - w / 2 : crossPos.get(node)!;
        x = Math.max(x, cursor);
        crossPos.set(node, x);
        cursor = x + w + crossGap;
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
        cursor = x - crossGap;
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

  return { positions, channelWaypoints };
}

/**
 * 尺寸感知的层级布局（Sugiyama 框架）。
 *
 * 完整流程：
 *   1. buildDAG       — 构建有向图，移除自环，DFS 翻转回边消环
 *   2. assignLayers   — 最长路径分层（拓扑序 + max(前驱层+1)）
 *   3. insertDummies  — 跨层边插入虚拟节点，使所有边只跨 1 层
 *   4. minimizeCrossings — Barycenter 启发式，8 轮上下交替减少交叉
 *   5. assignCoordinates — 中位数迭代对齐 + 自适应缝隙 + 跨层边通道航点烘焙
 *
 * @param sizes 每个节点的实际渲染尺寸（由 computeNodeSize 得出）
 */
export function layoutNodes(
  vertices: Map<string, MermaidVertex>,
  edges: MermaidEdge[],
  direction: string,
  sizes: Map<string, { w: number; h: number }>,
): {
  positions: Map<string, { x: number; y: number }>;
  waypoints: Map<string, { x: number; y: number }[]>;
} {
  const nodeIds = Array.from(vertices.keys());
  if (nodeIds.length === 0) return { positions: new Map(), waypoints: new Map() };

  // Phase 1
  const { outgoing, incoming } = buildDAG(nodeIds, edges);
  // Phase 2
  const levels = assignLayers(nodeIds, outgoing, incoming);
  // Phase 3
  const { levels: dLevels, outgoing: dOut, incoming: dIn, isDummy, edgeToDummies } =
    insertDummies(levels, outgoing, incoming);
  // Phase 4
  const ordered = minimizeCrossings(dLevels, dOut, dIn);
  // Phase 5 + 6（含 dummy 位置与跨层边通道航点）
  const longEdges: LongEdgeInfo[] = [];
  for (const [key, info] of edgeToDummies) {
    longEdges.push({ key, u: info.u, v: info.v, chain: info.chain });
  }
  const { positions: allPositions, channelWaypoints } = assignCoordinates(
    ordered,
    dOut,
    dIn,
    sizes,
    isDummy,
    direction,
    longEdges,
  );

  // 分离真实节点位置与 dummy 航点
  const positions = new Map<string, { x: number; y: number }>();
  for (const [id, pos] of allPositions) {
    if (!isDummy.has(id)) positions.set(id, pos);
  }

  // 跨层边航点（键统一为原始边方向；回边在 DAG 中被翻转过，需反转航点序列）
  const waypoints = new Map<string, { x: number; y: number }[]>();
  for (const edge of edges) {
    if (edge.start === edge.end) continue;
    const fwdKey = `${edge.start}->${edge.end}`;
    const revKey = `${edge.end}->${edge.start}`;
    let pts = channelWaypoints.get(fwdKey);
    let reversed = false;
    if (!pts) {
      pts = channelWaypoints.get(revKey);
      reversed = true;
    }
    if (!pts || pts.length === 0) continue;
    waypoints.set(fwdKey, reversed ? [...pts].reverse() : pts);
  }

  return { positions, waypoints };
}

/* ------------------------------------------------------------------ */
/* 转换函数                                                            */
/* ------------------------------------------------------------------ */

/**
 * 将 Flowchart 数据转换为 GraphSnapshot
 */
export function convertFlowchartToSnapshot(data: FlowchartData): GraphSnapshot {
  const { vertices, edges, direction } = data;

  const nodes: GraphNode[] = [];
  const graphEdges: GraphEdge[] = [];

  // 1. 标签折行 + 按内容计算节点尺寸
  const labels = new Map<string, string>();
  const sizes = new Map<string, { w: number; h: number }>();
  for (const [id, vertex] of vertices) {
    const shape = mapVertexToShape(vertex);
    const label = wrapLabel(vertex.text ?? id);
    labels.set(id, label);
    sizes.set(id, computeNodeSize(shape, label));
  }

  // 2. 布局计算（尺寸感知）
  const dir = direction ?? 'TB';
  const { positions, waypoints } = layoutNodes(vertices, edges, dir, sizes);
  const isHorizontalDir = dir === 'LR' || dir === 'RL';

  // 3. 转换节点
  for (const [id, vertex] of vertices) {
    const shape = mapVertexToShape(vertex);
    const size = sizes.get(id) ?? DEFAULT_NODE_SIZE.rectangle;
    const pos = positions.get(id) ?? { x: 50, y: 50 };

    nodes.push({
      id: `node-${id}`,
      shape,
      x: pos.x,
      y: pos.y,
      w: size.w,
      h: size.h,
      label: labels.get(id) ?? id,
    });
  }

  // 4. 转换连线
  for (let edgeIdx = 0; edgeIdx < edges.length; edgeIdx++) {
    const edge = edges[edgeIdx];
    const sourceId = `node-${edge.start}`;
    const targetId = `node-${edge.end}`;

    // 检查源和目标节点是否存在
    if (!vertices.has(edge.start) || !vertices.has(edge.end)) {
      continue; // 跳过无效边
    }

    const style = mapEdgeTypeToStyle(edge);
    const wp = waypoints.get(`${edge.start}->${edge.end}`);

    const graphEdge: GraphEdge = {
      // 平行边（A->B 写两次）需靠循环索引区分，不能用时间戳（同一毫秒内相同）
      id: `edge-${edge.start}-${edge.end}-${edgeIdx}`,
      source: sourceId,
      target: targetId,
      label: edge.text ?? undefined,
      routing: style.routing,
      endArrow: style.endArrow,
      style: {
        dashed: style.dashed,
        strokeWidth: style.strokeWidth,
      },
    };

    // 烘焙端口约束（下出上进 / 右出左进）：让内置正交路由器的水平段
    // 落在层间缝隙，结构上不可能横穿同层节点。按最终坐标比较中心，
    // 天然兼容回边翻转与 BT/RL。
    const sp = positions.get(edge.start);
    const tp = positions.get(edge.end);
    if (sp && tp) {
      const ss = sizes.get(edge.start) ?? DEFAULT_NODE_SIZE.rectangle;
      const ts = sizes.get(edge.end) ?? DEFAULT_NODE_SIZE.rectangle;
      const forward = isHorizontalDir
        ? tp.x + ts.w / 2 >= sp.x + ss.w / 2
        : tp.y + ts.h / 2 >= sp.y + ss.h / 2;
      if (isHorizontalDir) {
        graphEdge.exit = forward ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 };
        graphEdge.entry = forward ? { x: 0, y: 0.5 } : { x: 1, y: 0.5 };
      } else {
        graphEdge.exit = forward ? { x: 0.5, y: 1 } : { x: 0.5, y: 0 };
        graphEdge.entry = forward ? { x: 0.5, y: 0 } : { x: 0.5, y: 1 };
      }
    }

    if (wp && wp.length > 0) graphEdge.waypoints = wp;
    graphEdges.push(graphEdge);
  }

  // 5. 构建快照
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
