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
import { Point } from '@maxgraph/core';
import type {
  GraphEdge,
  GraphNode,
  GraphNodeShape,
  GraphSnapshot,
  GraphViewport,
} from './graphSnapshot';
import {
  paletteFor,
  getFontColor,
  getEdgeColor,
  SHAPE_STROKE_WIDTH,
  SHAPE_FONT_SIZE,
  SHAPE_ARC_SIZE,
} from './graphTheme';

/* ------------------------------------------------------------------ */
/* 形状 ↔ CellStyle 映射                                               */
/* ------------------------------------------------------------------ */

/** 把自研节点形状映射成 maxGraph 的基础 CellStyle（白板风格配色）。 */
export function nodeShapeToStyle(shape: GraphNodeShape, dark: boolean): CellStyle {
  const pal = paletteFor(shape, dark);
  const base: CellStyle = {
    fillColor: pal.fill,
    strokeColor: pal.stroke,
    fontColor: getFontColor(dark),
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
      return { shape: 'text', fillColor: 'none', strokeColor: 'none', fontColor: getFontColor(dark), fontSize: SHAPE_FONT_SIZE };
    case 'actor':
      // 用例图角色：使用自定义的 umlActor 形状（小人图标 + 生命线）
      // 使用 lifelinePerimeter，连接点只落在中心虚线上
      return { ...base, shape: 'umlActor', perimeter: 'lifelinePerimeter' };
    case 'swimlane-v':
      // 垂直泳道：使用 swimlane 形状，horizontal=false
      return { ...base, shape: 'swimlane', swimlaneLine: true, startSize: 30, horizontal: false };
    case 'swimlane-h':
      // 水平泳道：使用 swimlane 形状，horizontal=true
      return { ...base, shape: 'swimlane', swimlaneLine: true, startSize: 30, horizontal: true };
    case 'lifeline':
      // 时序图生命线：使用自定义的 lifeline 形状（矩形头部 + 虚线延伸）
      // 使用 lifelinePerimeter，连接点只落在中心虚线上
      return { ...base, shape: 'lifeline', perimeter: 'lifelinePerimeter' };
    case 'activation':
      // 时序图激活框：使用专用 umlActivation 形状，左右边缘均可连接消息线
      return { ...base, shape: 'umlActivation', perimeter: 'activationPerimeter' };
    case 'note':
      // 注释框：使用 rectangle + 圆角模拟折角效果
      // maxGraph 没有 note 形状，用圆角矩形代替
      return { ...base, shape: 'rectangle', rounded: true, arcSize: 5 };
    // 连线类型（作为预设连线样式）：实线 + 圆点流动，与 graphCanvasStyle 保持一致。
    case 'edge-line':
      return { strokeColor: pal.stroke, strokeWidth: 1.5, endArrow: 'classic', endSize: 8 };
    case 'edge-ortho':
      return { strokeColor: pal.stroke, strokeWidth: 1.5, edgeStyle: 'orthogonalEdgeStyle', endArrow: 'classic', endSize: 8 };
    case 'edge-dashed':
      return { strokeColor: pal.stroke, strokeWidth: 1.5, endArrow: 'classic', endSize: 8 };
    case 'edge-no-arrow':
      return { strokeColor: pal.stroke, strokeWidth: 1.5, endArrow: 'none' };
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
  if (shape === 'umlActor') return 'actor'; // 用例图角色（自定义形状）
  if (shape === 'lifeline') return 'lifeline'; // 时序图生命线（自定义形状）
  if (shape === 'umlActivation') return 'activation'; // 时序图激活框（自定义形状）
  if (shape === 'swimlane') {
    return style.horizontal === false ? 'swimlane-v' : 'swimlane-h';
  }
  if (shape === 'rectangle') {
    if (style.strokeWidth === 1) return 'activation';
    // note 用 arcSize=5 区分，rounded 用 arcSize=SHAPE_ARC_SIZE(12)
    if (style.rounded && style.arcSize === 5) return 'note';
    if (style.rounded) return 'rounded';
  }
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

/** 构建连线 CellStyle（蓝色细线 + 圆角折线 + 小箭头 + 圆点流动）。 */
function buildEdgeStyle(edge: GraphEdge, dark: boolean): CellStyle {
  const style: CellStyle = {
    edgeStyle: edge.routing === 'straight' ? undefined : 'orthogonalEdgeStyle',
    rounded: edge.routing !== 'straight',
    endArrow: edge.endArrow ?? 'classic',
    startArrow: edge.startArrow ?? 'none',
    strokeColor: getEdgeColor(dark),
    strokeWidth: SHAPE_STROKE_WIDTH,
  };
  const s = edge.style;
  if (s) {
    if (s.stroke !== undefined) style.strokeColor = s.stroke;
    if (s.strokeWidth !== undefined) style.strokeWidth = s.strokeWidth;
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
      const edgeCell = graph.insertEdge({
        parent,
        id: edge.id,
        value: edge.label ?? '',
        source,
        target,
        style: buildEdgeStyle(edge, dark),
      });
      // 应用 waypoints（时序图消息需要在特定 Y 坐标连接生命线）
      if (edge.waypoints && edge.waypoints.length > 0) {
        const geo = edgeCell.getGeometry();
        if (geo) {
          const newGeo = geo.clone();
          newGeo.points = edge.waypoints.map((wp) => new Point(wp.x, wp.y));
          graph.getDataModel().setGeometry(edgeCell, newGeo);
        }
      }
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

  // 恢复网格显隐（UI 状态，跨挂载持久化）。
  if (typeof snap.showGrid === 'boolean') {
    graph.setGridEnabled(snap.showGrid);
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

/**
 * 从一个 maxGraph 读回一份干净快照（含视口 + 网格开关）。
 * @param graph maxGraph 实例。
 * @param showGrid 当前网格显隐状态（来自组件，写入快照以持久化）。
 */
export function readSnapshotFromGraph(graph: Graph, showGrid?: boolean): GraphSnapshot {
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
    if (Object.keys(eStyle).length > 0) edge.style = eStyle;

    // 读回 waypoints（时序图消息的 Y 坐标信息）
    const geo = cell.getGeometry();
    if (geo?.points && geo.points.length > 0) {
      edge.waypoints = geo.points.map((p) => ({ x: p.x, y: p.y }));
    }

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
    showGrid,
  };
}
