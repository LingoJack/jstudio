/**
 * graphModel — 自研快照（GraphSnapshot）与 maxGraph 运行时模型之间的双向转换。
 *
 * 职责单一：只做"数据 ↔ 图"的搬运与样式映射，不涉及 React、不涉及交互。
 *   - applySnapshotToGraph：把一份快照灌进一个已创建的 Graph 实例。
 *   - readSnapshotFromGraph：从 Graph 实例读回一份干净快照（用于持久化）。
 *   - 形状 / 连线风格 ↔ maxGraph CellStyle 的映射集中在本文件。
 *
 * 约定：每个自研节点 / 连线的 id 直接用作 maxGraph Cell 的 id，使序列化可逆。
 */

import type { Cell, CellStyle, Graph } from '@maxgraph/core';
import type {
  GraphEdge,
  GraphNode,
  GraphNodeShape,
  GraphSnapshot,
  GraphViewport,
} from './graphSnapshot';
import {
  paletteFor,
  FONT_LIGHT,
  FONT_DARK,
  EDGE_LIGHT,
  EDGE_DARK,
  SHAPE_STROKE_WIDTH,
  SHAPE_FONT_SIZE,
  SHAPE_ARC_SIZE,
} from './graphTheme';

/* ------------------------------------------------------------------ */
/* 形状 ↔ CellStyle 映射                                               */
/* ------------------------------------------------------------------ */

/** 把自研节点形状映射成 maxGraph 的基础 CellStyle（含飞书按形状区分的淡彩配色）。 */
export function nodeShapeToStyle(shape: GraphNodeShape, dark: boolean): CellStyle {
  const pal = paletteFor(shape, dark);
  const base: CellStyle = {
    fillColor: pal.fill,
    strokeColor: pal.stroke,
    fontColor: dark ? FONT_DARK : FONT_LIGHT,
    strokeWidth: SHAPE_STROKE_WIDTH,
    fontSize: SHAPE_FONT_SIZE,
  };
  switch (shape) {
    case 'rounded':
      return { ...base, shape: 'rectangle', rounded: true, absoluteArcSize: true, arcSize: SHAPE_ARC_SIZE };
    case 'ellipse':
      return { ...base, shape: 'ellipse' };
    case 'diamond':
      return { ...base, shape: 'rhombus' };
    case 'text':
      return { shape: 'text', fillColor: 'none', strokeColor: 'none', fontColor: dark ? FONT_DARK : FONT_LIGHT, fontSize: SHAPE_FONT_SIZE };
    case 'rectangle':
    default:
      return { ...base, shape: 'rectangle' };
  }
}

/** 从 maxGraph CellStyle 反推回自研节点形状（读回快照时用）。 */
export function styleToNodeShape(style: CellStyle | undefined): GraphNodeShape {
  if (!style) return 'rectangle';
  const shape = style.shape;
  if (shape === 'ellipse') return 'ellipse';
  if (shape === 'rhombus') return 'diamond';
  if (shape === 'text') return 'text';
  if (shape === 'rectangle' && style.rounded) return 'rounded';
  return 'rectangle';
}

/** 合并节点的可选样式覆盖到基础 CellStyle 上。 */
function buildNodeStyle(node: GraphNode, dark: boolean): CellStyle {
  const base = nodeShapeToStyle(node.shape, dark);
  const s = node.style;
  if (!s) return base;
  if (s.fill !== undefined) base.fillColor = s.fill;
  if (s.stroke !== undefined) base.strokeColor = s.stroke;
  if (s.fontColor !== undefined) base.fontColor = s.fontColor;
  if (s.strokeWidth !== undefined) base.strokeWidth = s.strokeWidth;
  if (s.dashed !== undefined) base.dashed = s.dashed;
  return base;
}

/** 构建连线 CellStyle（飞书中性灰细线 + 圆角折线 + 小箭头）。 */
function buildEdgeStyle(edge: GraphEdge, dark: boolean): CellStyle {
  const style: CellStyle = {
    edgeStyle: edge.routing === 'straight' ? undefined : 'orthogonalEdgeStyle',
    rounded: edge.routing !== 'straight',
    endArrow: edge.endArrow ?? 'classic',
    startArrow: edge.startArrow ?? 'none',
    strokeColor: dark ? EDGE_DARK : EDGE_LIGHT,
    strokeWidth: SHAPE_STROKE_WIDTH,
  };
  const s = edge.style;
  if (s) {
    if (s.stroke !== undefined) style.strokeColor = s.stroke;
    if (s.strokeWidth !== undefined) style.strokeWidth = s.strokeWidth;
    if (s.dashed !== undefined) style.dashed = s.dashed;
  }
  return style;
}

/* ------------------------------------------------------------------ */
/* 快照 → 图                                                           */
/* ------------------------------------------------------------------ */

/**
 * 把一份快照灌入 graph（清空后重建）。在 batchUpdate 内执行，单步可撤销。
 * @param dark 是否暗色模式（决定飞书配色的深浅变体）。
 */
export function applySnapshotToGraph(graph: Graph, snap: GraphSnapshot, dark = false): void {
  const parent = graph.getDefaultParent();
  const model = graph.getDataModel();

  graph.batchUpdate(() => {
    // 清空现有内容（保留默认 parent）。
    const existing = graph.getChildCells(parent, true, true);
    if (existing.length > 0) graph.removeCells(existing);

    const idToCell = new Map<string, Cell>();

    for (const node of snap.nodes) {
      const cell = graph.insertVertex({
        parent,
        id: node.id,
        value: node.label ?? '',
        position: [node.x, node.y],
        size: [node.w, node.h],
        style: buildNodeStyle(node, dark),
      });
      idToCell.set(node.id, cell);
    }

    for (const edge of snap.edges) {
      const source = idToCell.get(edge.source);
      const target = idToCell.get(edge.target);
      if (!source || !target) continue; // 跳过悬空连线
      graph.insertEdge({
        parent,
        id: edge.id,
        value: edge.label ?? '',
        source,
        target,
        style: buildEdgeStyle(edge, dark),
      });
    }
  });

  // 恢复视口（缩放 / 平移）。仅当三个值都是有限数时才应用，
  // 否则 NaN/undefined 会污染 GraphView 导致 "Invalid x supplied"。
  if (snap.viewport) {
    const { scale, dx, dy } = snap.viewport;
    if (
      Number.isFinite(scale) &&
      scale > 0 &&
      Number.isFinite(dx) &&
      Number.isFinite(dy)
    ) {
      try {
        graph.getView().scaleAndTranslate(scale, dx, dy);
      } catch {
        /* ignore */
      }
    }
  }

  void model; // 预留：将来若需直接操作 model。
}

/* ------------------------------------------------------------------ */
/* 图 → 快照                                                           */
/* ------------------------------------------------------------------ */

/** 从一个 maxGraph 颜色值安全取出字符串（忽略特殊值 'none' 之外的非字符串）。 */
function colorStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** 从 graph 读回一份干净快照（含视口）。 */
export function readSnapshotFromGraph(graph: Graph): GraphSnapshot {
  const parent = graph.getDefaultParent();
  const vertices = graph.getChildVertices(parent);
  const edges = graph.getChildEdges(parent);

  const nodes: GraphNode[] = [];
  for (const cell of vertices) {
    const geo = cell.getGeometry();
    if (!geo) continue;
    const style = (cell.getStyle() as CellStyle) ?? {};
    const node: GraphNode = {
      id: String(cell.getId() ?? ''),
      shape: styleToNodeShape(style),
      x: geo.x,
      y: geo.y,
      w: geo.width,
      h: geo.height,
      label: typeof cell.getValue() === 'string' ? (cell.getValue() as string) : '',
    };
    const nStyle: GraphNode['style'] = {};
    if (colorStr(style.fillColor)) nStyle.fill = colorStr(style.fillColor);
    if (colorStr(style.strokeColor)) nStyle.stroke = colorStr(style.strokeColor);
    if (colorStr(style.fontColor)) nStyle.fontColor = colorStr(style.fontColor);
    if (typeof style.strokeWidth === 'number') nStyle.strokeWidth = style.strokeWidth;
    if (typeof style.dashed === 'boolean') nStyle.dashed = style.dashed;
    if (Object.keys(nStyle).length > 0) node.style = nStyle;
    nodes.push(node);
  }

  const outEdges: GraphEdge[] = [];
  for (const cell of edges) {
    const source = cell.getTerminal(true);
    const target = cell.getTerminal(false);
    if (!source || !target) continue;
    const style = (cell.getStyle() as CellStyle) ?? {};
    const edge: GraphEdge = {
      id: String(cell.getId() ?? ''),
      source: String(source.getId() ?? ''),
      target: String(target.getId() ?? ''),
      label: typeof cell.getValue() === 'string' ? (cell.getValue() as string) : '',
      routing: style.edgeStyle ? 'orthogonal' : 'straight',
    };
    const eStyle: GraphEdge['style'] = {};
    if (colorStr(style.strokeColor)) eStyle.stroke = colorStr(style.strokeColor);
    if (typeof style.strokeWidth === 'number') eStyle.strokeWidth = style.strokeWidth;
    if (typeof style.dashed === 'boolean') eStyle.dashed = style.dashed;
    if (Object.keys(eStyle).length > 0) edge.style = eStyle;
    outEdges.push(edge);
  }

  const view = graph.getView();
  const viewport: GraphViewport = {
    scale: view.scale,
    dx: view.translate.x,
    dy: view.translate.y,
  };

  return {
    kind: 'jgraph',
    version: 1,
    nodes,
    edges: outEdges,
    viewport,
  };
}
