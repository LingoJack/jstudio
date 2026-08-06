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
  ARROW_END_SIZE,
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
    // 无填充 (fillColor='none') 时内部可穿透点击，仅边框可选中/拖动；
    // 有填充色时此设置自动失效（paintBackground 检查 fill !== NONE）。
    pointerEvents: false,
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
      // 注释框：使用自定义的 note 形状（右上角折角的便利贴风格）。
      // 早期实现曾用 `rectangle + rounded + arcSize:5` 冒充折角，导致保存后
      // 再打开变成圆角矩形；现已改为专用 NoteShape（见 customShapes.ts）。
      return { ...base, shape: 'note' };
    case 'database':
      // 数据库：使用自定义的 database 形状（圆柱体，见 customShapes.ts）。
      return { ...base, shape: 'database' };
    // 连线类型（作为预设连线样式）：全部引用 ARROW_END_SIZE 保证箭头大小一致。
    case 'edge-line':
      return {
        strokeColor: pal.stroke,
        strokeWidth: SHAPE_STROKE_WIDTH,
        endArrow: 'classic',
        endSize: ARROW_END_SIZE,
      };
    case 'edge-ortho':
      return {
        strokeColor: pal.stroke,
        strokeWidth: SHAPE_STROKE_WIDTH,
        edgeStyle: 'obstacleEdgeStyle',
        endArrow: 'classic',
        endSize: ARROW_END_SIZE,
      };
    case 'edge-dashed':
      // 虚线 + 开放 V 形箭头（openThin），符合 UML 返回消息/异步响应惯例。
      // 早期实现漏写 `dashed:true`，导致工具栏"虚线连线"落点后实为实线。
      return {
        strokeColor: pal.stroke,
        strokeWidth: SHAPE_STROKE_WIDTH,
        endArrow: 'openThin',
        endSize: ARROW_END_SIZE,
        dashed: true,
      };
    case 'edge-no-arrow':
      return {
        strokeColor: pal.stroke,
        strokeWidth: SHAPE_STROKE_WIDTH,
        endArrow: 'none',
      };
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
  if (shape === 'note') return 'note'; // 注释框（自定义 NoteShape）
  if (shape === 'database') return 'database'; // 数据库（自定义 DatabaseShape）
  if (shape === 'swimlane') {
    return style.horizontal === false ? 'swimlane-v' : 'swimlane-h';
  }
  if (shape === 'rectangle') {
    // 圆角矩形：rounded=true + arcSize=SHAPE_ARC_SIZE(12) 即为 'rounded'
    if (style.rounded) return 'rounded';
  }
  return 'rectangle';
}

/** 合并节点的可选样式覆盖到基础 CellStyle 上。 */
function buildNodeStyle(node: GraphNode, dark: boolean): CellStyle {
  const base = nodeShapeToStyle(node.shape, dark);
  const s = node.style;
  if (s) {
    if (s.fill !== undefined) base.fillColor = s.fill;
    if (s.stroke !== undefined) base.strokeColor = s.stroke;
    if (s.fontColor !== undefined) base.fontColor = s.fontColor;
    if (s.strokeWidth !== undefined) base.strokeWidth = s.strokeWidth;
    if (s.dashed !== undefined) base.dashed = s.dashed;
    if (s.fontSize !== undefined) base.fontSize = s.fontSize;
  }
  applyLabelAlign(base, node.labelAlign);
  return base;
}

/** 把节点 / 连线的 labelAlign 写入 CellStyle.align。 */
function applyLabelAlign(style: CellStyle, labelAlign: string | undefined): void {
  if (labelAlign === 'left' || labelAlign === 'right') {
    style.align = labelAlign;
  } else if (labelAlign === 'center') {
    style.align = 'center';
  }
}

/** 从 CellStyle.align 读回 labelAlign（仅 left/right 非默认时返回）。 */
function readLabelAlign(style: CellStyle): 'left' | 'center' | 'right' | undefined {
  const a = style.align;
  if (a === 'left' || a === 'right') return a;
  if (a === 'center') return 'center';
  return undefined;
}

/**
 * 构建连线 CellStyle。
 *
 * 关键：`edge.style.dashed` 必须透传--否则 sequence 返回消息、note 关联虚线、
 * AI 生成的所有 `style:{dashed:true}` 边都会渲染为实线（旧版本存在此 bug）。
 *
 * `endSize` 从 ARROW_END_SIZE 引用；此前未设 -> maxGraph 默认 30 -> 巨型箭头。
 */
function buildEdgeStyle(edge: GraphEdge, dark: boolean): CellStyle {
  const style: CellStyle = {
    // 注意：不能用 undefined 表示"无路由"——Stylesheet.getCellStyle 合并时
    // 会跳过 undefined 值，全局默认 obstacleEdgeStyle 会漏进来，
    // 直线边被重新路由成折线。'none' 会在合并时删除该键，直线才是真直线。
    edgeStyle: edge.routing === 'straight' ? 'none' : 'obstacleEdgeStyle',
    rounded: edge.routing !== 'straight',
    endArrow: edge.endArrow ?? 'classic',
    startArrow: edge.startArrow ?? 'none',
    endSize: ARROW_END_SIZE,
    strokeColor: getEdgeColor(dark),
    strokeWidth: SHAPE_STROKE_WIDTH,
  };
  const s = edge.style;
  if (s) {
    if (s.stroke !== undefined) style.strokeColor = s.stroke;
    if (s.strokeWidth !== undefined) style.strokeWidth = s.strokeWidth;
    if (s.dashed !== undefined) style.dashed = s.dashed;
  }
  // 恢复端点连接约束（时序图消息的固定端点位置）。
  // 缺省时 maxGraph 会用 perimeter 重算端点，水平消息会被吸到图形中点。
  if (edge.exit) {
    style.exitX = edge.exit.x;
    style.exitY = edge.exit.y;
  }
  if (edge.entry) {
    style.entryX = edge.entry.x;
    style.entryY = edge.entry.y;
  }
  // exitAbsY / entryAbsY 是项目自定义属性（非 maxGraph CellStyle 标准字段），
  // sequenceInteraction 用它存绝对 Y 供 activation resize 同步，需透传持久化。
  const styleRecord = style as Record<string, unknown>;
  if (edge.exitAbsY !== undefined) styleRecord.exitAbsY = edge.exitAbsY;
  if (edge.entryAbsY !== undefined) styleRecord.entryAbsY = edge.entryAbsY;
  applyLabelAlign(style, edge.labelAlign);
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
 * 从一个 maxGraph 读回一份干净快照（含视口 + 网格开关 + 自动活动块开关）。
 * @param graph maxGraph 实例。
 * @param showGrid 当前网格显隐状态（来自组件，写入快照以持久化）。
 * @param autoActivation 时序图自动活动块开关（来自组件，写入快照以持久化）。
 */
export function readSnapshotFromGraph(graph: Graph, showGrid?: boolean, autoActivation?: boolean): GraphSnapshot {
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
    if (typeof style.fontSize === 'number') nStyle.fontSize = style.fontSize;
    if (Object.keys(nStyle).length > 0) node.style = nStyle;
    const la = readLabelAlign(style);
    if (la) node.labelAlign = la;
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
      // 'none' 表示显式"无路由"（见 buildEdgeStyle），视为 straight。
      routing: style.edgeStyle && style.edgeStyle !== 'none' ? 'orthogonal' : 'straight',
    };
    if (typeof style.endArrow === 'string') edge.endArrow = style.endArrow;
    if (typeof style.startArrow === 'string') edge.startArrow = style.startArrow;
    const eStyle: GraphEdge['style'] = {};
    if (colorStr(style.strokeColor)) eStyle.stroke = colorStr(style.strokeColor);
    if (typeof style.strokeWidth === 'number') eStyle.strokeWidth = style.strokeWidth;
    if (typeof style.dashed === 'boolean') eStyle.dashed = style.dashed;
    if (Object.keys(eStyle).length > 0) edge.style = eStyle;
    const la = readLabelAlign(style);
    if (la) edge.labelAlign = la;

    // 读回端点连接约束（时序图消息的固定端点位置，见 buildEdgeStyle）
    if (typeof style.exitX === 'number' && typeof style.exitY === 'number') {
      edge.exit = { x: style.exitX, y: style.exitY };
    }
    if (typeof style.entryX === 'number' && typeof style.entryY === 'number') {
      edge.entry = { x: style.entryX, y: style.entryY };
    }
    // 读回自定义属性 exitAbsY / entryAbsY（非 CellStyle 标准字段，见 buildEdgeStyle）
    const styleRecord = style as Record<string, unknown>;
    if (typeof styleRecord.exitAbsY === 'number') edge.exitAbsY = styleRecord.exitAbsY;
    if (typeof styleRecord.entryAbsY === 'number') edge.entryAbsY = styleRecord.entryAbsY;

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
    autoActivation,
  };
}
