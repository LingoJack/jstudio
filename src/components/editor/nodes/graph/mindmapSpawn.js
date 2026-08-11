import { DEFAULT_SIZE, styleForShape } from "./graphConstants";
import { MINDMAP_GAP_X, MINDMAP_GAP_Y, reflowMindmap } from "./mindmapLayout";
import { mindmapEdgeStyle, nextCellId } from "./graphHelpers";
import { mindmapStyleForDepth, DEFAULT_MINDMAP_SCHEME } from "./graphTheme";
function topicDepth(graph, cell) {
  const parent = graph.getDefaultParent();
  let cur = cell;
  const visited = /* @__PURE__ */ new Set();
  let depth = 0;
  while (cur && !visited.has(cur.getId() ?? "")) {
    visited.add(cur.getId() ?? "");
    const inEdges = graph.getIncomingEdges(cur, parent);
    const src = inEdges.map((e) => e.getTerminal(true)).find((c) => {
      if (!c || c === cur) return false;
      const style = graph.getCurrentCellStyle(c);
      return style?.isTopic === 1 || style?.isTopic === "1";
    });
    if (!src) break;
    cur = src;
    depth++;
  }
  return depth;
}
function branchIndexOf(cell) {
  const style = cell.getStyle();
  if (!style) return 0;
  return typeof style.mmBranch === "number" ? style.mmBranch : 0;
}
function nextBranchIndex(graph, parentCell) {
  const parent = graph.getDefaultParent();
  const outEdges = graph.getOutgoingEdges(parentCell, parent);
  let count = 0;
  for (const edge of outEdges) {
    const target = edge.getTerminal(false);
    if (!target || !target.isVertex()) continue;
    const style = graph.getCurrentCellStyle(target);
    if (style?.isTopic === 1 || style?.isTopic === "1") count++;
  }
  return count;
}
function topicStyleForDepth(depth, dark, scheme, branchIndex) {
  return {
    ...styleForShape("topic", dark, scheme),
    ...mindmapStyleForDepth(depth, dark, scheme, branchIndex),
    mmScheme: scheme,
    mmBranch: branchIndex,
    mmDepth: depth
  };
}
function spawnMindmapChild(graph, parentCell, dark, side = "right", scheme = DEFAULT_MINDMAP_SCHEME) {
  const parentGeo = parentCell.getGeometry();
  if (!parentGeo) return;
  const parent = graph.getDefaultParent();
  const size = DEFAULT_SIZE["topic"];
  const childDepth = topicDepth(graph, parentCell) + 1;
  const branchIndex = childDepth === 1 ? nextBranchIndex(graph, parentCell) : branchIndexOf(parentCell);
  const newX = side === "right" ? parentGeo.x + parentGeo.width + MINDMAP_GAP_X : parentGeo.x - MINDMAP_GAP_X - size.w;
  const newY = parentGeo.y;
  graph.batchUpdate(() => {
    const childCell = graph.insertVertex({
      parent,
      id: nextCellId("n"),
      value: "\u5B50\u4E3B\u9898",
      position: [newX, newY],
      size: [size.w, size.h],
      style: topicStyleForDepth(childDepth, dark, scheme, branchIndex)
    });
    graph.insertEdge({
      parent,
      id: nextCellId("e"),
      value: "",
      source: parentCell,
      target: childCell,
      style: mindmapEdgeStyle(dark, scheme, childDepth, branchIndex)
    });
    reflowMindmap(graph, childCell);
    graph.setSelectionCell(childCell);
  });
  requestAnimationFrame(() => {
    const cell = graph.getSelectionCell();
    if (cell) graph.startEditingAtCell(cell);
  });
}
function spawnMindmapSibling(graph, currentCell, dark, scheme = DEFAULT_MINDMAP_SCHEME) {
  const curGeo = currentCell.getGeometry();
  if (!curGeo) return;
  const parent = graph.getDefaultParent();
  const size = DEFAULT_SIZE["topic"];
  const inEdges = graph.getIncomingEdges(currentCell, parent);
  const parentNode = inEdges.length > 0 ? inEdges[0].getTerminal(true) : null;
  const newX = curGeo.x;
  const newY = curGeo.y + curGeo.height + MINDMAP_GAP_Y;
  const siblingDepth = topicDepth(graph, currentCell);
  const branchIndex = siblingDepth === 1 && parentNode ? nextBranchIndex(graph, parentNode) : branchIndexOf(currentCell);
  graph.batchUpdate(() => {
    const siblingCell = graph.insertVertex({
      parent,
      id: nextCellId("n"),
      value: "\u5206\u652F\u4E3B\u9898",
      position: [newX, newY],
      size: [size.w, size.h],
      style: topicStyleForDepth(siblingDepth, dark, scheme, branchIndex)
    });
    if (parentNode) {
      graph.insertEdge({
        parent,
        id: nextCellId("e"),
        value: "",
        source: parentNode,
        target: siblingCell,
        style: mindmapEdgeStyle(dark, scheme, siblingDepth, branchIndex)
      });
      reflowMindmap(graph, siblingCell);
    }
    graph.setSelectionCell(siblingCell);
  });
  requestAnimationFrame(() => {
    const cell = graph.getSelectionCell();
    if (cell) graph.startEditingAtCell(cell);
  });
}
export {
  spawnMindmapChild,
  spawnMindmapSibling
};
