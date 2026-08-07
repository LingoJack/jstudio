/**
 * flowchartConverter — Mermaid Flowchart → GraphSnapshot 转换
 *
 * 将 Mermaid flowchart/graph 语法解析后的数据转换为 GraphCanvas 可用的快照格式。
 * 包含：
 *   - 节点形状映射（Mermaid 形状 → GraphNodeShape）
 *   - 连线样式映射（Mermaid 箭头 → GraphEdge 样式）
 *   - 自动布局算法（基于图拓扑的层级布局）
 */

import type { FlowchartData, MermaidVertex, MermaidEdge } from './mermaidParser';
import type { GraphNode, GraphEdge, GraphNodeShape, GraphSnapshot } from '../../../components/editor/nodes/graph/graphSnapshot';

/* ------------------------------------------------------------------ */
/* 形状映射                                                            */
/* ------------------------------------------------------------------ */

/**
 * Mermaid 节点形状类型 → GraphNodeShape
 *
 * Mermaid 形状语法：
 *   - 默认方形: id[text] 或 id(text)
 *   - 圆角: id([text])
 *   - 圆形: id((text))
 *   - 菱形: id{text}
 *   - 六边形: id[[text]] → 暂映射为 rectangle
 *   - 不对称: id>text] → 暂映射为 rectangle
 *   - 棍棒/平行四边形: id[/text/] / id[\text\] → 暂映射为 rectangle
 *
 * 参考: https://mermaid.js.org/syntax/flowchart.html#node-shapes
 */
function mapVertexToShape(vertex: MermaidVertex): GraphNodeShape {
  // Mermaid 内部通过 nodeType 或 shape 字段表示形状
  // 类型可能在不同版本有差异，这里用多种方式判断

  const text = vertex.text ?? '';
  const domId = vertex.domId ?? '';

  // 通过 domId 的 pattern 判断形状（flowchart-node-xxx 形式）
  // 更可靠的方式是检查 vertex 的内部 type 字段

  // 检查 styles 数组中是否有形状标记
  const styles = vertex.styles ?? [];
  if (styles.includes('stadium') || styles.includes('round')) {
    return 'rounded';
  }
  if (styles.includes('circle') || styles.includes('ellipse')) {
    return 'ellipse';
  }
  if (styles.includes('diamond') || styles.includes('rhombus')) {
    return 'diamond';
  }
  // Mermaid 数据库圆柱体: [(text)] 语法 → cylinder / database 样式
  if (styles.includes('cylinder') || styles.includes('database')) {
    return 'database';
  }

  // 检查 type 字段（mermaid 内部可能设置）
  const type = vertex.type ?? '';
  if (type.includes('round') || type.includes('stadium')) {
    return 'rounded';
  }
  if (type.includes('circle') || type.includes('ellipse')) {
    return 'ellipse';
  }
  if (type.includes('diamond') || type.includes('rhombus')) {
    return 'diamond';
  }
  if (type.includes('cylinder') || type.includes('database')) {
    return 'database';
  }

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
  'edge-line': { w: 100, h: 20 },
  'edge-ortho': { w: 100, h: 20 },
  'edge-dashed': { w: 100, h: 20 },
  'edge-no-arrow': { w: 100, h: 20 },
};

/* ------------------------------------------------------------------ */
/* 文本测量与节点定尺寸                                                  */
/* ------------------------------------------------------------------ */

/**
 * 标签字号。与 graphTheme.SHAPE_FONT_SIZE(13) 对齐——
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
 * Mermaid 边类型 → GraphEdge 样式
 *
 * Mermaid 连线语法：
 *   - 箭头实线: --> 或 ---> → endArrow='classic', dashed=false
 *   - 无箭头实线: --- 或 ---- → endArrow='none', dashed=false
 *   - 箭头虚线: -.-> 或 -..-> → endArrow='classic', dashed=true
 *   - 无箭头虚线: -.- 或 -..- → endArrow='none', dashed=true
 *   - 粗箭头: ==> 或 ===> → strokeWidth=3, dashed=false
 *   - 多箭头: --o 或 --x → 特殊箭头类型
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
/* 自动布局                                                            */
/* ------------------------------------------------------------------ */

/**
 * 尺寸感知的层级布局。
 *
 * 算法：
 *   1. BFS 拓扑分层（入度为 0 的节点为第一层，逐层展开，环形图断环兜底）
 *   2. 层内排序：按"已定位前驱节点的交叉轴中心"排序（单遍 barycenter），
 *      使分支节点尽量贴近父节点，减少连线交叉
 *   3. 坐标分配：主轴（层方向）按层内最大节点尺寸 + 间距逐层累计；
 *      交叉轴按节点实际尺寸累计，每层相对最宽层居中
 *   4. BT/RL 通过对主轴坐标翻转实现，复用同一套 TB/LR 分配逻辑
 *
 * @param sizes 每个节点的实际渲染尺寸（由 computeNodeSize 得出）
 */
export function layoutNodes(
  vertices: Map<string, MermaidVertex>,
  edges: MermaidEdge[],
  direction: string,
  sizes: Map<string, { w: number; h: number }>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  // 获取所有节点 ID
  const nodeIds = Array.from(vertices.keys());
  if (nodeIds.length === 0) return positions;

  // 构建邻接关系（有向图）
  const outgoing = new Map<string, string[]>(); // 节点 → 出边目标列表
  const incoming = new Map<string, string[]>(); // 节点 → 入边源列表

  for (const nodeId of nodeIds) {
    outgoing.set(nodeId, []);
    incoming.set(nodeId, []);
  }

  for (const edge of edges) {
    const from = edge.start;
    const to = edge.end;
    if (outgoing.has(from)) {
      outgoing.get(from)?.push(to);
    }
    if (incoming.has(to)) {
      incoming.get(to)?.push(from);
    }
  }

  // 计算入度，找出第一层（入度=0 或被所有节点指向）
  const inDegree = new Map<string, number>();
  for (const nodeId of nodeIds) {
    inDegree.set(nodeId, incoming.get(nodeId)?.length ?? 0);
  }

  // 使用拓扑排序进行层级分配
  const levels: string[][] = [];
  const assigned = new Set<string>();
  const queue: string[] = [];

  // 初始：入度为 0 的节点
  for (const nodeId of nodeIds) {
    if (inDegree.get(nodeId) === 0) {
      queue.push(nodeId);
    }
  }

  // 如果没有入度为 0 的节点（环形图），选第一个作为起点
  if (queue.length === 0 && nodeIds.length > 0) {
    queue.push(nodeIds[0]);
  }

  // BFS 分层
  while (queue.length > 0) {
    const currentLevel = [...queue];
    levels.push(currentLevel);
    queue.length = 0;

    for (const nodeId of currentLevel) {
      assigned.add(nodeId);
      // 减少后续节点的入度
      for (const next of outgoing.get(nodeId) ?? []) {
        if (!assigned.has(next)) {
          const deg = inDegree.get(next) ?? 1;
          inDegree.set(next, deg - 1);
          if (deg - 1 <= 0) {
            queue.push(next);
          }
        }
      }
    }

    // 处理环形图：如果还有未分配节点但 queue 空，加入剩余节点
    if (queue.length === 0) {
      for (const nodeId of nodeIds) {
        if (!assigned.has(nodeId)) {
          queue.push(nodeId);
          break; // 只加一个，继续 BFS
        }
      }
    }
  }

  /* ---------------- 坐标分配（尺寸感知） ---------------- */

  const H_GAP = 40; // 节点间最小间距
  const V_GAP = 60; // 层间最小间距

  const sizeOf = (id: string) => sizes.get(id) ?? DEFAULT_NODE_SIZE.rectangle;

  const isHorizontal = direction === 'LR' || direction === 'RL';
  const isReverse = direction === 'RL' || direction === 'BT';

  // 主轴 = 层叠方向，交叉轴 = 层内排列方向。
  // 垂直布局（TB/BT）：主轴取节点高，交叉轴取节点宽；水平布局相反。
  const mainDim = (id: string) => (isHorizontal ? sizeOf(id).w : sizeOf(id).h);
  const crossDim = (id: string) => (isHorizontal ? sizeOf(id).h : sizeOf(id).w);
  const mainGap = isHorizontal ? H_GAP : V_GAP;
  const crossGap = isHorizontal ? V_GAP : H_GAP;

  // 层主轴尺寸（层内最大值）与交叉轴尺寸（层内累计值）
  const levelMain = levels.map((lv) => Math.max(...lv.map(mainDim)));
  const levelCross = levels.map(
    (lv) => lv.reduce((sum, id) => sum + crossDim(id), 0) + crossGap * (lv.length - 1),
  );
  const maxCross = Math.max(...levelCross);
  const totalMain = levelMain.reduce((a, b) => a + b, 0) + mainGap * (levels.length - 1);

  // 逐层分配（先按拓扑序以 TB/LR 语义计算，反向方向最后再翻转主轴）
  const raw = new Map<string, { main: number; cross: number }>();
  const crossCenter = new Map<string, number>();
  let mainCursor = 0;

  /** 已定位前驱节点的交叉轴中心均值；无已定位前驱时返回 -1（稳定排序保持 BFS 顺序） */
  const predCrossAvg = (id: string): number => {
    let sum = 0;
    let n = 0;
    for (const p of incoming.get(id) ?? []) {
      const c = crossCenter.get(p);
      if (c !== undefined) {
        sum += c;
        n++;
      }
    }
    return n > 0 ? sum / n : -1;
  };

  for (let i = 0; i < levels.length; i++) {
    const level = [...levels[i]];
    if (i > 0) {
      level.sort((a, b) => predCrossAvg(a) - predCrossAvg(b));
    }
    // 每层相对最宽层居中
    let crossCursor = (maxCross - levelCross[i]) / 2;
    for (const id of level) {
      raw.set(id, { main: mainCursor, cross: crossCursor });
      crossCenter.set(id, crossCursor + crossDim(id) / 2);
      crossCursor += crossDim(id) + crossGap;
    }
    mainCursor += levelMain[i] + mainGap;
  }

  // 方向映射 + 主轴翻转 + 正坐标校正
  let minX = Infinity;
  let minY = Infinity;
  for (const id of nodeIds) {
    const r = raw.get(id);
    if (!r) continue;
    const s = sizeOf(id);
    let x: number;
    let y: number;
    if (isHorizontal) {
      x = isReverse ? totalMain - r.main - s.w : r.main;
      y = r.cross;
    } else {
      x = r.cross;
      y = isReverse ? totalMain - r.main - s.h : r.main;
    }
    positions.set(id, { x, y });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
  }

  const offsetX = Math.max(0, 50 - minX);
  const offsetY = Math.max(0, 50 - minY);
  if (offsetX > 0 || offsetY > 0) {
    for (const [nodeId, pos] of positions) {
      positions.set(nodeId, { x: pos.x + offsetX, y: pos.y + offsetY });
    }
  }

  return positions;
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
  const positions = layoutNodes(vertices, edges, direction ?? 'TB', sizes);

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
  for (const edge of edges) {
    const sourceId = `node-${edge.start}`;
    const targetId = `node-${edge.end}`;

    // 检查源和目标节点是否存在
    if (!vertices.has(edge.start) || !vertices.has(edge.end)) {
      continue; // 跳过无效边
    }

    const style = mapEdgeTypeToStyle(edge);

    graphEdges.push({
      id: `edge-${edge.start}-${edge.end}-${Date.now().toString(36).slice(-4)}`,
      source: sourceId,
      target: targetId,
      label: edge.text ?? undefined,
      routing: style.routing,
      endArrow: style.endArrow,
      style: {
        dashed: style.dashed,
        strokeWidth: style.strokeWidth,
      },
    });
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