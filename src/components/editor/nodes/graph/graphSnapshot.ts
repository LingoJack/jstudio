/**
 * graphSnapshot — 自研画板（maxGraph 内核）的快照数据格式定义与格式识别。
 *
 * 设计目标：
 *   1. 自研内核与旧 Excalidraw 内核共用同一根字符串通道（`snapshot: string`），
 *      因此本格式必须能从字符串里被**可靠识别**，且与 Excalidraw 格式互不混淆。
 *   2. 自研格式以 `kind: 'jgraph'` 作为判别标记（magic key），并带 `version`。
 *   3. 数据结构是纯粹的 node + edge 图模型，渲染层（maxGraph）可由它无歧义重建，
 *      序列化层也只依赖这些字段，与具体引擎实现解耦——将来即便换引擎也不必改格式。
 *
 * 兼容策略（见 detectSnapshotKind）：
 *   - 空字符串            → 'empty'（新建空画板，交给自研内核）
 *   - { kind:'jgraph' }   → 'jgraph'（自研格式）
 *   - 其它能解析的 JSON   → 'excalidraw'（历史遗留快照，继续用 Excalidraw 渲染）
 */

/** 自研格式的判别标记。出现在快照根对象的 `kind` 字段。 */
export const JGRAPH_KIND = 'jgraph' as const;

/** 当前自研快照格式版本。结构发生破坏性变化时递增。 */
export const JGRAPH_VERSION = 1 as const;

/* ------------------------------------------------------------------ */
/* 数据模型                                                            */
/* ------------------------------------------------------------------ */

/** 节点（图元）形状。对应 maxGraph 的 shape / 自定义模具。 */
export type GraphNodeShape =
  | 'rectangle' // 矩形（流程：处理）
  | 'rounded' // 圆角矩形（流程：起止）
  | 'ellipse' // 椭圆 / 圆
  | 'diamond' // 菱形（流程：判定）
  | 'text'; // 纯文本标签（无边框）

/** 一个节点。 */
export interface GraphNode {
  /** 稳定 id（自研内核内唯一）。 */
  id: string;
  shape: GraphNodeShape;
  /** 画布坐标（左上角）与尺寸。 */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 显示文本。 */
  label?: string;
  /** 可选样式覆盖（填充/描边/字色等）。留空时由内核按 shape 给默认。 */
  style?: GraphNodeStyle;
}

/** 节点样式覆盖。所有字段可选。 */
export interface GraphNodeStyle {
  fill?: string;
  stroke?: string;
  fontColor?: string;
  strokeWidth?: number;
  dashed?: boolean;
}

/** 一条连线。 */
export interface GraphEdge {
  id: string;
  /** 源 / 目标节点 id。 */
  source: string;
  target: string;
  label?: string;
  /** 连线走线风格。默认正交（orthogonal）。 */
  routing?: 'orthogonal' | 'straight';
  /** 箭头端样式。默认 source 无、target 经典箭头。 */
  startArrow?: string;
  endArrow?: string;
  style?: GraphEdgeStyle;
}

/** 连线样式覆盖。 */
export interface GraphEdgeStyle {
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
}

/** 视口（缩放 / 平移），用于跨挂载恢复用户视角。 */
export interface GraphViewport {
  scale: number;
  /** translate（maxGraph view.translate），单位为画布坐标。 */
  dx: number;
  dy: number;
}

/** 自研画板完整快照。 */
export interface GraphSnapshot {
  kind: typeof JGRAPH_KIND;
  version: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewport?: GraphViewport;
  /** 网格显隐（UI 状态，跨挂载恢复）。缺省视为 true。 */
  showGrid?: boolean;
}

/* ------------------------------------------------------------------ */
/* 格式识别                                                            */
/* ------------------------------------------------------------------ */

/** 一段 snapshot 字符串的来源种类。 */
export type SnapshotKind = 'empty' | 'jgraph' | 'excalidraw' | 'unknown';

/**
 * 判别一段 snapshot 字符串属于哪种内核格式。
 *
 * - 空 / 空白           → 'empty'
 * - 含 kind:'jgraph'    → 'jgraph'
 * - 含 Excalidraw 特征  → 'excalidraw'（elements 数组，或 type:'excalidraw'）
 * - 其它                → 'unknown'（无法识别，调用方按需降级处理）
 */
export function detectSnapshotKind(snapshot: string | null | undefined): SnapshotKind {
  if (!snapshot || !snapshot.trim()) return 'empty';
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshot);
  } catch {
    return 'unknown';
  }
  if (!parsed || typeof parsed !== 'object') return 'unknown';
  const obj = parsed as Record<string, unknown>;

  if (obj.kind === JGRAPH_KIND) return 'jgraph';

  // Excalidraw 快照特征：本项目历史快照形如 { elements: [...], viewport: {...} }，
  // 官方导出文件形如 { type:'excalidraw', elements:[...] }。两者都以 elements 数组为准。
  if (Array.isArray(obj.elements) || obj.type === 'excalidraw') {
    return 'excalidraw';
  }

  return 'unknown';
}

/** 安全解析一段自研快照；非自研格式或解析失败时返回空图。 */
export function parseGraphSnapshot(snapshot: string | null | undefined): GraphSnapshot {
  const empty: GraphSnapshot = {
    kind: JGRAPH_KIND,
    version: JGRAPH_VERSION,
    nodes: [],
    edges: [],
  };
  if (detectSnapshotKind(snapshot) !== 'jgraph') return empty;
  try {
    const parsed = JSON.parse(snapshot as string) as Partial<GraphSnapshot>;
    return {
      kind: JGRAPH_KIND,
      version: typeof parsed.version === 'number' ? parsed.version : JGRAPH_VERSION,
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      viewport: parsed.viewport,
      showGrid: typeof parsed.showGrid === 'boolean' ? parsed.showGrid : undefined,
    };
  } catch {
    return empty;
  }
}

/** 序列化一份自研快照为字符串（带 kind/version 标记）。 */
export function serializeGraphSnapshot(
  nodes: GraphNode[],
  edges: GraphEdge[],
  viewport?: GraphViewport,
  showGrid?: boolean,
): string {
  const snap: GraphSnapshot = {
    kind: JGRAPH_KIND,
    version: JGRAPH_VERSION,
    nodes,
    edges,
    viewport,
    showGrid,
  };
  return JSON.stringify(snap);
}
