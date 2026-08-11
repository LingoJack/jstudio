import { styleToNodeShape } from "./graphModel";
import { spawnMindmapChild, spawnMindmapSibling } from "./mindmapSpawn";
function handleShapeTabEnter(graph, key, shiftKey, dark, mindmapScheme) {
  const sel = graph.getSelectionCells();
  if (sel.length !== 1 || !sel[0].isVertex()) return false;
  const shape = styleToNodeShape(graph.getCurrentCellStyle(sel[0]));
  if (shape === "topic") {
    return handleMindmapTopic(graph, sel[0], key, shiftKey, dark, mindmapScheme);
  }
  return handlePlainShape(graph, sel[0], key, shiftKey);
}
function handleMindmapTopic(graph, cell, key, shiftKey, dark, scheme) {
  if (key === "Enter" && graph.isEditing()) {
    return false;
  }
  if (graph.isEditing()) {
    graph.stopEditing(false);
  }
  if (key === "Tab") {
    spawnMindmapChild(graph, cell, dark, shiftKey ? "left" : "right", scheme);
  } else {
    spawnMindmapSibling(graph, cell, dark, scheme);
  }
  return true;
}
function handlePlainShape(graph, cell, key, shiftKey) {
  if (key === "Enter") {
    if (graph.isEditing()) return false;
    if (!graph.isCellEditable(cell)) return false;
    graph.startEditingAtCell(cell);
    return true;
  }
  cycleVertexSelection(graph, cell, shiftKey ? "prev" : "next");
  return true;
}
function cycleVertexSelection(graph, current, dir) {
  const vertices = graph.getChildVertices(graph.getDefaultParent());
  if (vertices.length === 0) return;
  const idx = vertices.indexOf(current);
  if (idx === -1) {
    graph.setSelectionCell(vertices[0]);
    return;
  }
  const len = vertices.length;
  const nextIdx = dir === "next" ? (idx + 1) % len : (idx - 1 + len) % len;
  graph.setSelectionCell(vertices[nextIdx]);
}
export {
  handleShapeTabEnter
};
