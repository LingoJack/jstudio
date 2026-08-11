import { Point } from "@maxgraph/core";
import {
  paletteFor,
  getFontColor,
  getEdgeColor,
  getLabelBackgroundColor,
  SHAPE_STROKE_WIDTH,
  SHAPE_FONT_SIZE,
  SHAPE_ARC_SIZE,
  ARROW_END_SIZE,
  mindmapStyleForDepth,
  MINDMAP_ARC_SIZE,
  DEFAULT_MINDMAP_SCHEME
} from "./graphTheme";
function nodeShapeToStyle(shape, dark, scheme = DEFAULT_MINDMAP_SCHEME) {
  const pal = paletteFor(shape, dark);
  const base = {
    fillColor: pal.fill,
    strokeColor: pal.stroke,
    fontColor: getFontColor(dark),
    strokeWidth: SHAPE_STROKE_WIDTH,
    fontSize: SHAPE_FONT_SIZE,
    // 无填充 (fillColor='none') 时内部可穿透点击，仅边框可选中/拖动；
    // 有填充色时此设置自动失效（paintBackground 检查 fill !== NONE）。
    pointerEvents: false
  };
  switch (shape) {
    case "rounded":
      return { ...base, shape: "rectangle", rounded: true, absoluteArcSize: true, arcSize: SHAPE_ARC_SIZE };
    case "ellipse":
      return { ...base, shape: "ellipse" };
    case "diamond":
      return { ...base, shape: "rhombus" };
    case "text":
      return { shape: "text", fillColor: "none", strokeColor: "none", fontColor: getFontColor(dark), fontSize: SHAPE_FONT_SIZE };
    case "actor":
      return { ...base, shape: "umlActor", perimeter: "lifelinePerimeter" };
    case "swimlane-v":
      return { ...base, shape: "swimlane", swimlaneLine: true, startSize: 30, horizontal: false };
    case "swimlane-h":
      return { ...base, shape: "swimlane", swimlaneLine: true, startSize: 30, horizontal: true };
    case "lifeline":
      return { ...base, shape: "lifeline", perimeter: "lifelinePerimeter" };
    case "activation":
      return { ...base, shape: "umlActivation", perimeter: "activationPerimeter" };
    case "note":
      return { ...base, shape: "note" };
    case "database":
      return { ...base, shape: "database" };
    case "topic":
      return {
        shape: "rectangle",
        rounded: true,
        absoluteArcSize: true,
        arcSize: MINDMAP_ARC_SIZE,
        ...mindmapStyleForDepth(0, dark, scheme, 0),
        isTopic: 1,
        mmScheme: scheme,
        mmBranch: 0,
        mmDepth: 0
      };
    // 连线类型（作为预设连线样式）：全部引用 ARROW_END_SIZE 保证箭头大小一致。
    case "edge-line":
      return {
        strokeColor: pal.stroke,
        strokeWidth: SHAPE_STROKE_WIDTH,
        endArrow: "classic",
        endSize: ARROW_END_SIZE
      };
    case "edge-ortho":
      return {
        strokeColor: pal.stroke,
        strokeWidth: SHAPE_STROKE_WIDTH,
        edgeStyle: "obstacleEdgeStyle",
        endArrow: "classic",
        endSize: ARROW_END_SIZE
      };
    case "edge-dashed":
      return {
        strokeColor: pal.stroke,
        strokeWidth: SHAPE_STROKE_WIDTH,
        endArrow: "openThin",
        endSize: ARROW_END_SIZE,
        dashed: true
      };
    case "edge-no-arrow":
      return {
        strokeColor: pal.stroke,
        strokeWidth: SHAPE_STROKE_WIDTH,
        endArrow: "none"
      };
    case "rectangle":
    default:
      return { ...base, shape: "rectangle" };
  }
}
function styleToNodeShape(style) {
  if (!style) return "rectangle";
  const shape = style.shape;
  if (shape === "ellipse") return "ellipse";
  if (shape === "rhombus") return "diamond";
  if (shape === "text") return "text";
  if (shape === "umlActor") return "actor";
  if (shape === "lifeline") return "lifeline";
  if (shape === "umlActivation") return "activation";
  if (shape === "note") return "note";
  if (shape === "database") return "database";
  if (shape === "swimlane") {
    return style.horizontal === false ? "swimlane-v" : "swimlane-h";
  }
  if (shape === "rectangle") {
    if (style.rounded) {
      const isTopic = style.isTopic;
      if (isTopic) return "topic";
      return "rounded";
    }
  }
  return "rectangle";
}
function buildNodeStyle(node, dark, scheme) {
  const base = nodeShapeToStyle(node.shape, dark, scheme);
  const s = node.style;
  if (s) {
    if (s.fill !== void 0) base.fillColor = s.fill;
    if (s.stroke !== void 0) base.strokeColor = s.stroke;
    if (s.fontColor !== void 0) base.fontColor = s.fontColor;
    if (s.strokeWidth !== void 0) base.strokeWidth = s.strokeWidth;
    if (s.dashed !== void 0) base.dashed = s.dashed;
    if (s.fontSize !== void 0) base.fontSize = s.fontSize;
    if (s.fontStyle !== void 0) base.fontStyle = s.fontStyle;
    const baseRecord = base;
    if (s.mmScheme !== void 0) baseRecord.mmScheme = s.mmScheme;
    if (s.mmBranch !== void 0) baseRecord.mmBranch = s.mmBranch;
    if (s.mmDepth !== void 0) baseRecord.mmDepth = s.mmDepth;
  }
  applyLabelAlign(base, node.labelAlign);
  return base;
}
function applyLabelAlign(style, labelAlign) {
  if (labelAlign === "left" || labelAlign === "right") {
    style.align = labelAlign;
  } else if (labelAlign === "center") {
    style.align = "center";
  }
}
function readLabelAlign(style) {
  const a = style.align;
  if (a === "left" || a === "right") return a;
  if (a === "center") return "center";
  return void 0;
}
function buildEdgeStyle(edge, dark) {
  const style = {
    // 注意：不能用 undefined 表示"无路由"——Stylesheet.getCellStyle 合并时
    // 会跳过 undefined 值，全局默认 obstacleEdgeStyle 会漏进来，
    // 直线边被重新路由成折线。'none' 会在合并时删除该键，直线才是真直线。
    edgeStyle: edge.routing === "straight" ? "none" : edge.routing === "mindmap" ? "mindmapCurveEdgeStyle" : "obstacleEdgeStyle",
    rounded: edge.routing === "orthogonal" || edge.routing === void 0,
    curved: edge.routing === "mindmap",
    endArrow: edge.endArrow ?? "classic",
    startArrow: edge.startArrow ?? "none",
    endSize: ARROW_END_SIZE,
    strokeColor: getEdgeColor(dark),
    strokeWidth: SHAPE_STROKE_WIDTH,
    // 边标签：字号 / 字色 / 背景色（与画布底色一致，遮挡标签下方连线，
    // 解决双击边写文字时文字与线重叠、不明显的问题）。
    fontSize: SHAPE_FONT_SIZE,
    fontColor: getFontColor(dark),
    labelBackgroundColor: getLabelBackgroundColor(dark)
  };
  const s = edge.style;
  if (s) {
    if (s.stroke !== void 0) style.strokeColor = s.stroke;
    if (s.strokeWidth !== void 0) style.strokeWidth = s.strokeWidth;
    if (s.dashed !== void 0) style.dashed = s.dashed;
    const styleRecord2 = style;
    if (s.mmBranch !== void 0) styleRecord2.mmBranch = s.mmBranch;
    if (s.mmDepth !== void 0) styleRecord2.mmDepth = s.mmDepth;
  }
  if (edge.exit) {
    style.exitX = edge.exit.x;
    style.exitY = edge.exit.y;
  }
  if (edge.entry) {
    style.entryX = edge.entry.x;
    style.entryY = edge.entry.y;
  }
  const styleRecord = style;
  if (edge.exitAbsY !== void 0) styleRecord.exitAbsY = edge.exitAbsY;
  if (edge.entryAbsY !== void 0) styleRecord.entryAbsY = edge.entryAbsY;
  applyLabelAlign(style, edge.labelAlign);
  return style;
}
function applySnapshotToGraph(graph, snap, dark = false, scheme = DEFAULT_MINDMAP_SCHEME) {
  const parent = graph.getDefaultParent();
  const model = graph.getDataModel();
  graph.batchUpdate(() => {
    const existing = graph.getChildCells(parent, true, true);
    if (existing.length > 0) graph.removeCells(existing);
    const idToCell = /* @__PURE__ */ new Map();
    for (const node of snap.nodes) {
      const cell = graph.insertVertex({
        parent,
        id: node.id,
        value: node.label ?? "",
        position: [node.x, node.y],
        size: [node.w, node.h],
        style: buildNodeStyle(node, dark, scheme)
      });
      idToCell.set(node.id, cell);
    }
    for (const edge of snap.edges) {
      const source = idToCell.get(edge.source);
      const target = idToCell.get(edge.target);
      if (!source || !target) continue;
      const edgeCell = graph.insertEdge({
        parent,
        id: edge.id,
        value: edge.label ?? "",
        source,
        target,
        style: buildEdgeStyle(edge, dark)
      });
      if (edge.waypoints && edge.waypoints.length > 0) {
        const geo = edgeCell.getGeometry();
        if (geo) {
          const newGeo = geo.clone();
          newGeo.points = edge.waypoints.filter(
            (wp) => wp != null && Number.isFinite(wp.x) && Number.isFinite(wp.y)
          ).map((wp) => new Point(wp.x, wp.y));
          graph.getDataModel().setGeometry(edgeCell, newGeo);
        }
      }
    }
  });
  if (snap.viewport) {
    const { scale, dx, dy } = snap.viewport;
    if (Number.isFinite(scale) && scale > 0 && Number.isFinite(dx) && Number.isFinite(dy)) {
      try {
        graph.getView().scaleAndTranslate(scale, dx, dy);
      } catch {
      }
    }
  }
  if (typeof snap.showGrid === "boolean") {
    graph.setGridEnabled(snap.showGrid);
  }
  void model;
}
function colorStr(v) {
  return typeof v === "string" ? v : void 0;
}
function readSnapshotFromGraph(graph, showGrid, autoActivation) {
  const parent = graph.getDefaultParent();
  const vertices = graph.getChildVertices(parent);
  const edges = graph.getChildEdges(parent);
  const nodes = [];
  for (const cell of vertices) {
    const geo = cell.getGeometry();
    if (!geo) continue;
    const style = cell.getStyle() ?? {};
    const node = {
      id: String(cell.getId() ?? ""),
      shape: styleToNodeShape(style),
      x: geo.x,
      y: geo.y,
      w: geo.width,
      h: geo.height,
      label: typeof cell.getValue() === "string" ? cell.getValue() : ""
    };
    const nStyle = {};
    if (colorStr(style.fillColor)) nStyle.fill = colorStr(style.fillColor);
    if (colorStr(style.strokeColor)) nStyle.stroke = colorStr(style.strokeColor);
    if (colorStr(style.fontColor)) nStyle.fontColor = colorStr(style.fontColor);
    if (typeof style.strokeWidth === "number") nStyle.strokeWidth = style.strokeWidth;
    if (typeof style.dashed === "boolean") nStyle.dashed = style.dashed;
    if (typeof style.fontSize === "number") nStyle.fontSize = style.fontSize;
    if (typeof style.fontStyle === "number") nStyle.fontStyle = style.fontStyle;
    const nodeStyleRecord = style;
    if (nodeStyleRecord.mmScheme === "neon" || nodeStyleRecord.mmScheme === "mono") {
      nStyle.mmScheme = nodeStyleRecord.mmScheme;
    }
    if (typeof nodeStyleRecord.mmBranch === "number") nStyle.mmBranch = nodeStyleRecord.mmBranch;
    if (typeof nodeStyleRecord.mmDepth === "number") nStyle.mmDepth = nodeStyleRecord.mmDepth;
    if (Object.keys(nStyle).length > 0) node.style = nStyle;
    const la = readLabelAlign(style);
    if (la) node.labelAlign = la;
    nodes.push(node);
  }
  const outEdges = [];
  for (const cell of edges) {
    const source = cell.getTerminal(true);
    const target = cell.getTerminal(false);
    if (!source || !target) continue;
    const style = cell.getStyle() ?? {};
    const edge = {
      id: String(cell.getId() ?? ""),
      source: String(source.getId() ?? ""),
      target: String(target.getId() ?? ""),
      label: typeof cell.getValue() === "string" ? cell.getValue() : "",
      // 'none' 表示显式"无路由"（见 buildEdgeStyle），视为 straight；
      // 'mindmapCurveEdgeStyle' 为思维导图贝塞尔曲线（mindmapLayout.ts）。
      routing: style.edgeStyle === "mindmapCurveEdgeStyle" ? "mindmap" : style.edgeStyle && style.edgeStyle !== "none" ? "orthogonal" : "straight"
    };
    if (typeof style.endArrow === "string") edge.endArrow = style.endArrow;
    if (typeof style.startArrow === "string") edge.startArrow = style.startArrow;
    const eStyle = {};
    if (colorStr(style.strokeColor)) eStyle.stroke = colorStr(style.strokeColor);
    if (typeof style.strokeWidth === "number") eStyle.strokeWidth = style.strokeWidth;
    if (typeof style.dashed === "boolean") eStyle.dashed = style.dashed;
    const edgeStyleRecord = style;
    if (typeof edgeStyleRecord.mmBranch === "number") eStyle.mmBranch = edgeStyleRecord.mmBranch;
    if (typeof edgeStyleRecord.mmDepth === "number") eStyle.mmDepth = edgeStyleRecord.mmDepth;
    if (Object.keys(eStyle).length > 0) edge.style = eStyle;
    const la = readLabelAlign(style);
    if (la) edge.labelAlign = la;
    if (typeof style.exitX === "number" && typeof style.exitY === "number") {
      edge.exit = { x: style.exitX, y: style.exitY };
    }
    if (typeof style.entryX === "number" && typeof style.entryY === "number") {
      edge.entry = { x: style.entryX, y: style.entryY };
    }
    const styleRecord = style;
    if (typeof styleRecord.exitAbsY === "number") edge.exitAbsY = styleRecord.exitAbsY;
    if (typeof styleRecord.entryAbsY === "number") edge.entryAbsY = styleRecord.entryAbsY;
    const geo = cell.getGeometry();
    if (geo?.points && geo.points.length > 0) {
      edge.waypoints = geo.points.filter(
        (p) => p != null && Number.isFinite(p.x) && Number.isFinite(p.y)
      ).map((p) => ({ x: p.x, y: p.y }));
    }
    outEdges.push(edge);
  }
  const view = graph.getView();
  const viewport = {
    scale: view.scale,
    dx: view.translate.x,
    dy: view.translate.y
  };
  return {
    kind: "jgraph",
    version: 1,
    nodes,
    edges: outEdges,
    viewport,
    showGrid,
    autoActivation
  };
}
export {
  applySnapshotToGraph,
  nodeShapeToStyle,
  readSnapshotFromGraph,
  styleToNodeShape
};
