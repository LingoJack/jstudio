import mermaid from "mermaid";
let initialized = false;
function ensureMermaidInitialized() {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    suppressErrorRendering: true,
    // 禁用安全模式以支持更多语法
    securityLevel: "loose"
  });
  initialized = true;
}
async function parseMermaidCode(code) {
  ensureMermaidInitialized();
  try {
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(code);
    const diagramType = diagram.type;
    const db = diagram.db;
    if (diagramType === "flowchart" || diagramType === "graph" || diagramType === "flowchart-v2") {
      const verticesMap = db.getVertices?.() ?? /* @__PURE__ */ new Map();
      const edges = db.getEdges?.() ?? [];
      const subgraphs = db.getSubgraphs?.() ?? [];
      const direction = db.getDirection?.() ?? "TB";
      return {
        type: "flowchart",
        data: {
          vertices: verticesMap,
          edges,
          subgraphs,
          direction
        }
      };
    }
    if (diagramType === "sequenceDiagram" || diagramType === "sequence") {
      const actorsMap = db.getActors?.() ?? /* @__PURE__ */ new Map();
      const messages = db.getMessages?.() ?? [];
      const notes = [];
      return {
        type: "sequence",
        data: {
          actors: actorsMap,
          messages,
          notes
        }
      };
    }
    return {
      type: "unsupported",
      data: null,
      error: `\u4E0D\u652F\u6301\u7684\u56FE\u8868\u7C7B\u578B: ${diagramType}`
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return {
      type: "unsupported",
      data: null,
      error: `\u89E3\u6790\u5931\u8D25: ${errorMessage}`
    };
  }
}
async function isValidMermaidCode(code) {
  const result = await parseMermaidCode(code);
  return result.type !== "unsupported" && !result.error;
}
export {
  isValidMermaidCode,
  parseMermaidCode
};
