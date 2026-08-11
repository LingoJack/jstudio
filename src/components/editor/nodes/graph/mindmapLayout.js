import {
  EdgeStyleRegistry,
  Point
} from "@maxgraph/core";
import { styleToNodeShape } from "./graphModel";
const MINDMAP_GAP_X = 60;
const MINDMAP_GAP_Y = 16;
const MINDMAP_EDGE_STYLE = "mindmapCurveEdgeStyle";
function isTopicCell(graph, cell) {
  return cell.isVertex() && styleToNodeShape(graph.getCurrentCellStyle(cell)) === "topic";
}
function topicChildren(graph, cell) {
  const outEdges = graph.getOutgoingEdges(cell, graph.getDefaultParent());
  const children = [];
  for (const edge of outEdges) {
    const target = edge.getTerminal(false);
    if (target && target !== cell && isTopicCell(graph, target)) {
      children.push(target);
    }
  }
  children.sort(
    (a, b) => (a.getGeometry()?.y ?? 0) - (b.getGeometry()?.y ?? 0)
  );
  return children;
}
function findTopicRoot(graph, cell) {
  const parent = graph.getDefaultParent();
  let cur = cell;
  const visited = /* @__PURE__ */ new Set();
  while (!visited.has(cur.getId() ?? "")) {
    visited.add(cur.getId() ?? "");
    const inEdges = graph.getIncomingEdges(cur, parent);
    const src = inEdges.map((e) => e.getTerminal(true)).find((c) => !!c && c !== cur && isTopicCell(graph, c));
    if (!src) break;
    cur = src;
  }
  return cur;
}
function reflowMindmap(graph, fromCell) {
  if (!isTopicCell(graph, fromCell)) return;
  const root = findTopicRoot(graph, fromCell);
  const rootGeo = root.getGeometry();
  if (!rootGeo) return;
  const subtreeH = /* @__PURE__ */ new Map();
  const childrenCache = /* @__PURE__ */ new Map();
  const measure = (cell) => {
    const geo = cell.getGeometry();
    if (!geo) return 0;
    if (subtreeH.has(cell)) return subtreeH.get(cell);
    subtreeH.set(cell, geo.height);
    const kids = topicChildren(graph, cell);
    childrenCache.set(cell, kids);
    let h = geo.height;
    if (kids.length > 0) {
      const total = kids.reduce((s, k) => s + measure(k), 0) + MINDMAP_GAP_Y * (kids.length - 1);
      h = Math.max(h, total);
    }
    subtreeH.set(cell, h);
    return h;
  };
  measure(root);
  const updates = [];
  const assign = (cell, x, top, side) => {
    const geo = cell.getGeometry();
    const h = subtreeH.get(cell);
    if (!geo || h === void 0) return;
    updates.push({ cell, x, y: top + (h - geo.height) / 2 });
    const kids = childrenCache.get(cell) ?? [];
    if (kids.length === 0) return;
    const kidsH = kids.reduce((s, k) => s + (subtreeH.get(k) ?? 0), 0) + MINDMAP_GAP_Y * (kids.length - 1);
    let cursor = top + (h - kidsH) / 2;
    for (const kid of kids) {
      const kidGeo = kid.getGeometry();
      const childX = side === "right" ? x + geo.width + MINDMAP_GAP_X : x - MINDMAP_GAP_X - (kidGeo?.width ?? geo.width);
      assign(kid, childX, cursor, side);
      cursor += (subtreeH.get(kid) ?? 0) + MINDMAP_GAP_Y;
    }
  };
  const rootCenterY = rootGeo.y + rootGeo.height / 2;
  const rootKids = childrenCache.get(root) ?? [];
  const rightKids = rootKids.filter(
    (k) => (k.getGeometry()?.x ?? 0) >= rootGeo.x
  );
  const leftKids = rootKids.filter(
    (k) => (k.getGeometry()?.x ?? 0) < rootGeo.x
  );
  if (rightKids.length > 0) {
    const rightH = rightKids.reduce((s, k) => s + (subtreeH.get(k) ?? 0), 0) + MINDMAP_GAP_Y * (rightKids.length - 1);
    let cursor = rootCenterY - rightH / 2;
    const childX = rootGeo.x + rootGeo.width + MINDMAP_GAP_X;
    for (const kid of rightKids) {
      assign(kid, childX, cursor, "right");
      cursor += (subtreeH.get(kid) ?? 0) + MINDMAP_GAP_Y;
    }
  }
  if (leftKids.length > 0) {
    const leftH = leftKids.reduce((s, k) => s + (subtreeH.get(k) ?? 0), 0) + MINDMAP_GAP_Y * (leftKids.length - 1);
    let cursor = rootCenterY - leftH / 2;
    for (const kid of leftKids) {
      const kidWidth = kid.getGeometry()?.width ?? rootGeo.width;
      const childX = rootGeo.x - MINDMAP_GAP_X - kidWidth;
      assign(kid, childX, cursor, "left");
      cursor += (subtreeH.get(kid) ?? 0) + MINDMAP_GAP_Y;
    }
  }
  updates.push({ cell: root, x: rootGeo.x, y: rootGeo.y });
  const model = graph.getDataModel();
  for (const u of updates) {
    const geo = u.cell.getGeometry();
    if (!geo) continue;
    if (Math.abs(geo.x - u.x) < 0.5 && Math.abs(geo.y - u.y) < 0.5) continue;
    const next = geo.clone();
    next.x = Math.round(u.x);
    next.y = Math.round(u.y);
    model.setGeometry(u.cell, next);
  }
}
function mindmapCurveEdgeStyle(state, source, target, points, result) {
  if (!source || !target || points && points.length > 0) {
    const fallback = EdgeStyleRegistry.get("obstacleEdgeStyle");
    if (fallback) fallback(state, source, target, points, result);
    return;
  }
  const sourceCenterX = source.x + source.width / 2;
  const targetCenterX = target.x + target.width / 2;
  const isRight = targetCenterX >= sourceCenterX;
  const sx = isRight ? source.x + source.width : source.x;
  const sy = source.y + source.height / 2;
  const tx = isRight ? target.x : target.x + target.width;
  const ty = target.y + target.height / 2;
  const dx = tx - sx;
  const dir = dx >= 0 ? 1 : -1;
  const d = Math.max(Math.abs(dx) / 2, 30 * state.view.scale);
  const c1x = sx + dir * d;
  const c2x = tx - dir * d;
  const SAMPLES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  for (const t of SAMPLES) {
    const mt = 1 - t;
    const bx = mt * mt * mt * sx + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * tx;
    const by = mt * mt * mt * sy + 3 * mt * mt * t * sy + 3 * mt * t * t * ty + t * t * t * ty;
    result.push(new Point(bx, by));
  }
}
function registerMindmapEdgeStyle() {
  EdgeStyleRegistry.add(MINDMAP_EDGE_STYLE, mindmapCurveEdgeStyle, {
    handlerKind: "default",
    isOrthogonal: false
  });
}
export {
  MINDMAP_EDGE_STYLE,
  MINDMAP_GAP_X,
  MINDMAP_GAP_Y,
  findTopicRoot,
  reflowMindmap,
  registerMindmapEdgeStyle
};
