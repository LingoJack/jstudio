import { ZOOM_MIN, ZOOM_MAX } from "../graphConstants";
const setupWheelZoom = (ctx) => {
  const { graph, container } = ctx;
  const onWheel = (e) => {
    const g = ctx.graphRef.current;
    if (!g) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const view2 = g.getView();
      const oldScale = view2.scale;
      const factor = Math.exp(-e.deltaY * 5e-3);
      const newScale = Math.min(Math.max(oldScale * factor, ZOOM_MIN), ZOOM_MAX);
      if (newScale === oldScale) return;
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const ratio = 1 / newScale - 1 / oldScale;
      view2.scaleAndTranslate(
        newScale,
        view2.translate.x + cx * ratio,
        view2.translate.y + cy * ratio
      );
      return;
    }
    e.preventDefault();
    const view = g.getView();
    const scale = view.scale;
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.shiftKey && dx === 0) {
      dx = e.deltaY;
      dy = 0;
    }
    view.setTranslate(
      view.translate.x - dx / scale,
      view.translate.y - dy / scale
    );
  };
  container.addEventListener("wheel", onWheel, { passive: false, capture: true });
  let firstResize = true;
  let resizeTimer = null;
  const resizeObs = new ResizeObserver(() => {
    graph.sizeDidChange();
    if (firstResize) {
      firstResize = false;
      return;
    }
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      const hasCells = graph.getChildVertices(graph.getDefaultParent()).length > 0;
      if (hasCells) {
        graph.getPlugin("fit")?.fitCenter({ margin: 24 });
      }
    }, 150);
  });
  resizeObs.observe(container);
  return () => {
    resizeObs.disconnect();
    if (resizeTimer) clearTimeout(resizeTimer);
    container.removeEventListener("wheel", onWheel, true);
  };
};
export {
  setupWheelZoom
};
