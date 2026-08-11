const JGRAPH_KIND = "jgraph";
const JGRAPH_VERSION = 1;
function detectSnapshotKind(snapshot) {
  if (!snapshot || !snapshot.trim()) return "empty";
  let parsed;
  try {
    parsed = JSON.parse(snapshot);
  } catch {
    return "unknown";
  }
  if (!parsed || typeof parsed !== "object") return "unknown";
  const obj = parsed;
  if (obj.kind === JGRAPH_KIND) return "jgraph";
  return "unknown";
}
function parseGraphSnapshot(snapshot) {
  const empty = {
    kind: JGRAPH_KIND,
    version: JGRAPH_VERSION,
    nodes: [],
    edges: []
  };
  if (detectSnapshotKind(snapshot) !== "jgraph") return empty;
  try {
    const parsed = JSON.parse(snapshot);
    return {
      kind: JGRAPH_KIND,
      version: typeof parsed.version === "number" ? parsed.version : JGRAPH_VERSION,
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      viewport: parsed.viewport,
      showGrid: typeof parsed.showGrid === "boolean" ? parsed.showGrid : void 0,
      autoActivation: typeof parsed.autoActivation === "boolean" ? parsed.autoActivation : void 0
    };
  } catch {
    return empty;
  }
}
function serializeGraphSnapshot(nodes, edges, viewport, showGrid, autoActivation) {
  const snap = {
    kind: JGRAPH_KIND,
    version: JGRAPH_VERSION,
    nodes,
    edges,
    viewport,
    showGrid,
    autoActivation
  };
  return JSON.stringify(snap);
}
export {
  JGRAPH_KIND,
  JGRAPH_VERSION,
  detectSnapshotKind,
  parseGraphSnapshot,
  serializeGraphSnapshot
};
