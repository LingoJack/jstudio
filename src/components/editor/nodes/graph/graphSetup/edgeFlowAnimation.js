import { FLOW_ANIMATION_THRESHOLD } from "../graphHelpers";
const setupEdgeFlowAnimation = (ctx) => {
  const { graph } = ctx;
  {
    const cellRenderer = graph.cellRenderer;
    const origInitializeShape = cellRenderer.initializeShape.bind(cellRenderer);
    cellRenderer.initializeShape = (state) => {
      origInitializeShape(state);
      const cell = state.cell;
      const shape = state.shape;
      if (cell && cell.isEdge() && shape?.node && !shape._jgraphDotInit) {
        shape._jgraphDotInit = true;
        shape.node.classList.add("jgraph-edge");
        const dotPath = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path"
        );
        dotPath.classList.add("jgraph-edge-dot");
        const origRedraw = shape.redraw.bind(shape);
        shape.redraw = () => {
          origRedraw();
          const pathEl = shape.node.querySelector("path");
          if (pathEl) {
            dotPath.setAttribute("d", pathEl.getAttribute("d") ?? "");
            shape.node.appendChild(dotPath);
          }
        };
      }
    };
  }
  ctx.updateFlowAnimationRef.current = () => {
    const g = ctx.graphRef.current;
    const container = ctx.containerRef.current;
    if (!g || !container) return;
    const edgeCount = g.getChildEdges(g.getDefaultParent()).length;
    container.classList.toggle("jgraph-flow-off", edgeCount > FLOW_ANIMATION_THRESHOLD);
  };
};
export {
  setupEdgeFlowAnimation
};
