/**
 * aiGraphValidator — 手写校验器，针对 AI 生成的 jgraph JSON。
 *
 * 设计哲学：**宽松校验**，与 `parseGraphSnapshot` 一致——
 *   - 缺失字段走默认值（不报错）
 *   - 非法字段被修正（shape 非法→rectangle、坐标负数→0）
 *   - 悬空 edge（source/target 引用不存在的 node）静默剥离
 *   - 节点数硬上限 50（超出截断 + 警告，防止 maxGraph 性能问题）
 *
 * 不加 ajv 依赖：项目仅 47 个 deps，校验逻辑足够简单不值得引入。
 * 校验规则与 `AI_GRAPH_SCHEMA` 字段定义对齐，但允许额外字段（AI 偶尔多吐字段）。
 */

import {
  JGRAPH_KIND,
  JGRAPH_VERSION,
  type GraphNode,
  type GraphEdge,
  type GraphNodeShape,
  type GraphSnapshot,
  type GraphNodeStyle,
  type GraphEdgeStyle,
} from '../../../components/editor/nodes/graph/graphSnapshot';
import { VALID_NODE_SHAPES } from './aiGraphSchema';

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

/** 节点数硬上限。超过会被截断（保留前 50 个），防止 maxGraph 渲染卡顿。 */
const MAX_NODES = 50;

/** 节点默认尺寸（与 flowchartConverter 的 DEFAULT_NODE_SIZE 对齐）。 */
const DEFAULT_W = 120;
const DEFAULT_H = 60;

/** 校验结果。 */
export interface ValidationResult {
  valid: boolean;
  /** 非致命问题列表（即便 valid=true 也可能有 warnings）。 */
  errors: string[];
  /** 规范化后的快照；输入严重畸形时为 null。 */
  snapshot: GraphSnapshot | null;
}

/* ------------------------------------------------------------------ */
/* 标量修正                                                            */
/* ------------------------------------------------------------------ */

/** 取有限数，否则返回 fallback。 */
function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 钳制到 [min, ∞)。 */
function clampMin(value: number, min: number): number {
  return value < min ? min : value;
}

/* ------------------------------------------------------------------ */
/* 节点 / 边规范化                                                     */
/* ------------------------------------------------------------------ */

function normalizeNode(raw: unknown, idx: number): GraphNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // id 必须是非空字符串；缺失时用 fallback（仍保留节点，但 edge 可能引用不上）
  const id = typeof r.id === 'string' && r.id.trim() ? r.id : `node-${idx + 1}`;

  // shape 必须在枚举内；非法 → rectangle
  let shape: GraphNodeShape = 'rectangle';
  if (typeof r.shape === 'string' && (VALID_NODE_SHAPES as readonly string[]).includes(r.shape)) {
    shape = r.shape as GraphNodeShape;
  }

  // 坐标 clamp ≥ 0（AI 偶尔吐负数）
  const x = clampMin(finiteOr(r.x, 0), 0);
  const y = clampMin(finiteOr(r.y, 0), 0);
  // 尺寸：要求 > 0，否则默认
  const w = Math.max(1, finiteOr(r.w, DEFAULT_W));
  const h = Math.max(1, finiteOr(r.h, DEFAULT_H));

  const label = typeof r.label === 'string' ? r.label : undefined;

  // style 仅保留已知字段
  let style: GraphNodeStyle | undefined;
  if (r.style && typeof r.style === 'object') {
    const s = r.style as Record<string, unknown>;
    style = {};
    if (typeof s.fill === 'string') style.fill = s.fill;
    if (typeof s.stroke === 'string') style.stroke = s.stroke;
    if (typeof s.fontColor === 'string') style.fontColor = s.fontColor;
    if (typeof s.strokeWidth === 'number') style.strokeWidth = s.strokeWidth;
    if (typeof s.dashed === 'boolean') style.dashed = s.dashed;
    if (Object.keys(style).length === 0) style = undefined;
  }

  return { id, shape, x, y, w, h, label, style };
}

function normalizeEdge(
  raw: unknown,
  idx: number,
  nodeIdSet: Set<string>,
): { edge: GraphEdge | null; dangling: boolean } {
  if (!raw || typeof raw !== 'object') return { edge: null, dangling: false };
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' && r.id.trim() ? r.id : `edge-${idx + 1}`;
  const source = typeof r.source === 'string' ? r.source : '';
  const target = typeof r.target === 'string' ? r.target : '';

  // 悬空 edge：source/target 不命中任何节点 → 剥离
  if (!source || !target || !nodeIdSet.has(source) || !nodeIdSet.has(target)) {
    return { edge: null, dangling: true };
  }

  const label = typeof r.label === 'string' ? r.label : undefined;

  let routing: GraphEdge['routing'] | undefined;
  if (r.routing === 'orthogonal' || r.routing === 'straight') {
    routing = r.routing;
  }

  const startArrow = typeof r.startArrow === 'string' ? r.startArrow : undefined;
  const endArrow = typeof r.endArrow === 'string' ? r.endArrow : undefined;

  let style: GraphEdgeStyle | undefined;
  if (r.style && typeof r.style === 'object') {
    const s = r.style as Record<string, unknown>;
    style = {};
    if (typeof s.stroke === 'string') style.stroke = s.stroke;
    if (typeof s.strokeWidth === 'number') style.strokeWidth = s.strokeWidth;
    if (typeof s.dashed === 'boolean') style.dashed = s.dashed;
    if (Object.keys(style).length === 0) style = undefined;
  }

  return {
    edge: { id, source, target, label, routing, startArrow, endArrow, style },
    dangling: false,
  };
}

/* ------------------------------------------------------------------ */
/* 入口                                                                */
/* ------------------------------------------------------------------ */

/**
 * 校验并规范化 AI 生成的 jgraph JSON。
 *
 * @param parsed `JSON.parse` 后的对象（类型未知）
 * @returns 校验结果。`valid=true` 时 `snapshot` 必非 null。
 */
export function validateAiGraph(parsed: unknown): ValidationResult {
  const errors: string[] = [];

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, errors: ['Root must be a JSON object'], snapshot: null };
  }
  const root = parsed as Record<string, unknown>;

  // kind / version：强制对齐（AI 偶尔漏写或写错）
  if (root.kind !== JGRAPH_KIND) {
    // 不报错，静默修正
    root.kind = JGRAPH_KIND;
  }
  const version =
    typeof root.version === 'number' && Number.isFinite(root.version)
      ? root.version
      : JGRAPH_VERSION;

  // nodes：必须是数组
  const rawNodes = Array.isArray(root.nodes) ? root.nodes : [];
  if (!Array.isArray(root.nodes)) {
    errors.push('`nodes` must be an array');
  }

  // 节点数硬上限
  let nodesToProcess = rawNodes;
  if (rawNodes.length > MAX_NODES) {
    nodesToProcess = rawNodes.slice(0, MAX_NODES);
    errors.push(`Too many nodes (${rawNodes.length}); truncated to ${MAX_NODES}`);
  }

  const nodes: GraphNode[] = [];
  const nodeIdSet = new Set<string>();
  for (let i = 0; i < nodesToProcess.length; i++) {
    const node = normalizeNode(nodesToProcess[i], i);
    if (!node) {
      errors.push(`Node #${i + 1} is malformed, skipped`);
      continue;
    }
    // id 去重：后到者重命名
    if (nodeIdSet.has(node.id)) {
      const newId = `${node.id}-${i + 1}`;
      errors.push(`Duplicate node id "${node.id}" renamed to "${newId}"`);
      node.id = newId;
    }
    nodes.push(node);
    nodeIdSet.add(node.id);
  }

  // edges：必须是数组
  const rawEdges = Array.isArray(root.edges) ? root.edges : [];
  if (!Array.isArray(root.edges)) {
    errors.push('`edges` must be an array');
  }

  const edges: GraphEdge[] = [];
  let danglingCount = 0;
  for (let i = 0; i < rawEdges.length; i++) {
    const { edge, dangling } = normalizeEdge(rawEdges[i], i, nodeIdSet);
    if (dangling) {
      danglingCount++;
      continue;
    }
    if (!edge) {
      errors.push(`Edge #${i + 1} is malformed, skipped`);
      continue;
    }
    edges.push(edge);
  }
  if (danglingCount > 0) {
    errors.push(`${danglingCount} dangling edge(s) dropped (source/target not found)`);
  }

  // viewport：可选，保留原样
  let viewport: GraphSnapshot['viewport'];
  if (root.viewport && typeof root.viewport === 'object') {
    const vp = root.viewport as Record<string, unknown>;
    const scale = finiteOr(vp.scale, 1);
    if (scale <= 0) {
      viewport = { scale: 1, dx: 0, dy: 0 };
    } else {
      viewport = {
        scale,
        dx: finiteOr(vp.dx, 0),
        dy: finiteOr(vp.dy, 0),
      };
    }
  }

  // showGrid：可选
  let showGrid: boolean | undefined;
  if (typeof root.showGrid === 'boolean') showGrid = root.showGrid;

  const snapshot: GraphSnapshot = {
    kind: JGRAPH_KIND,
    version,
    nodes,
    edges,
    viewport,
    showGrid,
  };

  // 截断 / 0 节点 都不算 fatal——仍返回 snapshot，让上游决定是否继续
  // fatal 只在根对象非 object 时
  return {
    valid: true,
    errors,
    snapshot,
  };
}
