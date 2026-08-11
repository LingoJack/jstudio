import {
  JGRAPH_KIND,
  JGRAPH_VERSION
} from "../../../components/editor/nodes/graph/graphSnapshot";
import { VALID_NODE_SHAPES } from "./aiGraphSchema";
const MAX_NODES = 50;
const DEFAULT_W = 120;
const DEFAULT_H = 60;
function finiteOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function clampMin(value, min) {
  return value < min ? min : value;
}
function normalizeNode(raw, idx) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw;
  const id = typeof r.id === "string" && r.id.trim() ? r.id : `node-${idx + 1}`;
  let shape = "rectangle";
  if (typeof r.shape === "string" && VALID_NODE_SHAPES.includes(r.shape)) {
    shape = r.shape;
  }
  const x = clampMin(finiteOr(r.x, 0), 0);
  const y = clampMin(finiteOr(r.y, 0), 0);
  const w = Math.max(1, finiteOr(r.w, DEFAULT_W));
  const h = Math.max(1, finiteOr(r.h, DEFAULT_H));
  const label = typeof r.label === "string" ? r.label : void 0;
  let style;
  if (r.style && typeof r.style === "object") {
    const s = r.style;
    style = {};
    if (typeof s.fill === "string") style.fill = s.fill;
    if (typeof s.stroke === "string") style.stroke = s.stroke;
    if (typeof s.fontColor === "string") style.fontColor = s.fontColor;
    if (typeof s.strokeWidth === "number") style.strokeWidth = s.strokeWidth;
    if (typeof s.dashed === "boolean") style.dashed = s.dashed;
    if (Object.keys(style).length === 0) style = void 0;
  }
  return { id, shape, x, y, w, h, label, style };
}
function normalizeEdge(raw, idx, nodeIdSet) {
  if (!raw || typeof raw !== "object") return { edge: null, dangling: false };
  const r = raw;
  const id = typeof r.id === "string" && r.id.trim() ? r.id : `edge-${idx + 1}`;
  const source = typeof r.source === "string" ? r.source : "";
  const target = typeof r.target === "string" ? r.target : "";
  if (!source || !target || !nodeIdSet.has(source) || !nodeIdSet.has(target)) {
    return { edge: null, dangling: true };
  }
  const label = typeof r.label === "string" ? r.label : void 0;
  let routing;
  if (r.routing === "orthogonal" || r.routing === "straight") {
    routing = r.routing;
  }
  const startArrow = typeof r.startArrow === "string" ? r.startArrow : void 0;
  const endArrow = typeof r.endArrow === "string" ? r.endArrow : void 0;
  let style;
  if (r.style && typeof r.style === "object") {
    const s = r.style;
    style = {};
    if (typeof s.stroke === "string") style.stroke = s.stroke;
    if (typeof s.strokeWidth === "number") style.strokeWidth = s.strokeWidth;
    if (typeof s.dashed === "boolean") style.dashed = s.dashed;
    if (Object.keys(style).length === 0) style = void 0;
  }
  return {
    edge: { id, source, target, label, routing, startArrow, endArrow, style },
    dangling: false
  };
}
function validateAiGraph(parsed) {
  const errors = [];
  if (!parsed || typeof parsed !== "object") {
    return { valid: false, errors: ["Root must be a JSON object"], snapshot: null };
  }
  const root = parsed;
  if (root.kind !== JGRAPH_KIND) {
    root.kind = JGRAPH_KIND;
  }
  const version = typeof root.version === "number" && Number.isFinite(root.version) ? root.version : JGRAPH_VERSION;
  const rawNodes = Array.isArray(root.nodes) ? root.nodes : [];
  if (!Array.isArray(root.nodes)) {
    errors.push("`nodes` must be an array");
  }
  let nodesToProcess = rawNodes;
  if (rawNodes.length > MAX_NODES) {
    nodesToProcess = rawNodes.slice(0, MAX_NODES);
    errors.push(`Too many nodes (${rawNodes.length}); truncated to ${MAX_NODES}`);
  }
  const nodes = [];
  const nodeIdSet = /* @__PURE__ */ new Set();
  for (let i = 0; i < nodesToProcess.length; i++) {
    const node = normalizeNode(nodesToProcess[i], i);
    if (!node) {
      errors.push(`Node #${i + 1} is malformed, skipped`);
      continue;
    }
    if (nodeIdSet.has(node.id)) {
      const newId = `${node.id}-${i + 1}`;
      errors.push(`Duplicate node id "${node.id}" renamed to "${newId}"`);
      node.id = newId;
    }
    nodes.push(node);
    nodeIdSet.add(node.id);
  }
  const rawEdges = Array.isArray(root.edges) ? root.edges : [];
  if (!Array.isArray(root.edges)) {
    errors.push("`edges` must be an array");
  }
  const edges = [];
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
  let viewport;
  if (root.viewport && typeof root.viewport === "object") {
    const vp = root.viewport;
    const scale = finiteOr(vp.scale, 1);
    if (scale <= 0) {
      viewport = { scale: 1, dx: 0, dy: 0 };
    } else {
      viewport = {
        scale,
        dx: finiteOr(vp.dx, 0),
        dy: finiteOr(vp.dy, 0)
      };
    }
  }
  let showGrid;
  if (typeof root.showGrid === "boolean") showGrid = root.showGrid;
  const snapshot = {
    kind: JGRAPH_KIND,
    version,
    nodes,
    edges,
    viewport,
    showGrid
  };
  return {
    valid: true,
    errors,
    snapshot
  };
}
export {
  validateAiGraph
};
