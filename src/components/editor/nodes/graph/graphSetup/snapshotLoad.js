import { parseGraphSnapshot } from "../graphSnapshot";
import { applySnapshotToGraph } from "../graphModel";
const setupSnapshotLoad = (ctx) => {
  const { graph } = ctx;
  const parsedInit = parseGraphSnapshot(ctx.initialSnapshotRef.current);
  ctx.applyingRef.current = true;
  try {
    graph.batchUpdate(() => {
      applySnapshotToGraph(graph, parsedInit, ctx.darkModeRef.current);
    });
  } finally {
    ctx.applyingRef.current = false;
  }
  if (typeof parsedInit.showGrid === "boolean") {
    ctx.setShowGrid(parsedInit.showGrid);
    ctx.showGridRef.current = parsedInit.showGrid;
  }
  if (typeof parsedInit.autoActivation === "boolean") {
    ctx.setAutoActivation(parsedInit.autoActivation);
    ctx.autoActivationRef.current = parsedInit.autoActivation;
  }
  ctx.undoManagerRef.current.clear();
  ctx.updateFlowAnimationRef.current();
};
export {
  setupSnapshotLoad
};
