import { CellState } from "@maxgraph/core";
import {
  styleForShape,
  DEFAULT_SIZE,
  SHAPE_LABEL,
  GRID_SIZE,
  MIN_DRAW_SIZE
} from "../graphConstants";
import { SHAPE_ARC_SIZE, MINDMAP_ARC_SIZE } from "../graphTheme";
import { logger } from "../../../../../lib/core/logger";
const setupDragDraw = (ctx) => {
  const { graph, container } = ctx;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const preview = document.createElementNS(SVG_NS, "svg");
  preview.classList.add("jgraph-draw-preview");
  preview.style.display = "none";
  container.appendChild(preview);
  let previewShapeEl = null;
  const ensurePreviewShape = (shape) => {
    if (previewShapeEl && previewShapeEl.dataset.shape === shape) return;
    preview.innerHTML = "";
    let el;
    switch (shape) {
      case "ellipse":
        el = document.createElementNS(SVG_NS, "ellipse");
        break;
      case "diamond":
        el = document.createElementNS(SVG_NS, "polygon");
        break;
      case "rounded":
      case "topic":
      case "rectangle":
      case "text":
      default:
        el = document.createElementNS(SVG_NS, "rect");
        break;
    }
    el.classList.add("jgraph-draw-preview-shape");
    if (shape === "text") {
      el.classList.add("is-text-region");
    }
    preview.appendChild(el);
    previewShapeEl = el;
    previewShapeEl.dataset.shape = shape;
  };
  const applyPreviewSize = (w, h, shape) => {
    const el = previewShapeEl;
    if (!el) return;
    switch (shape) {
      case "ellipse": {
        const e = el;
        e.setAttribute("cx", String(w / 2));
        e.setAttribute("cy", String(h / 2));
        e.setAttribute("rx", String(Math.max(0, w / 2)));
        e.setAttribute("ry", String(Math.max(0, h / 2)));
        break;
      }
      case "diamond": {
        const p = el;
        const pts = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;
        p.setAttribute("points", pts);
        break;
      }
      case "rounded": {
        const r = el;
        r.setAttribute("width", String(w));
        r.setAttribute("height", String(h));
        const arc = Math.min(SHAPE_ARC_SIZE, Math.min(w, h) / 3);
        r.setAttribute("rx", String(arc));
        r.setAttribute("ry", String(arc));
        break;
      }
      case "topic": {
        const r = el;
        r.setAttribute("width", String(w));
        r.setAttribute("height", String(h));
        const arc = Math.min(MINDMAP_ARC_SIZE, Math.min(w, h) / 3);
        r.setAttribute("rx", String(arc));
        r.setAttribute("ry", String(arc));
        break;
      }
      case "rectangle":
      case "text":
      default: {
        const r = el;
        r.setAttribute("width", String(w));
        r.setAttribute("height", String(h));
        break;
      }
    }
  };
  let drawing = false;
  let startClient = { x: 0, y: 0 };
  let startGraph = { x: 0, y: 0 };
  const clientToContainer = (e) => {
    const rect = container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const snap = (v) => Math.round(v / GRID_SIZE) * GRID_SIZE;
  const onMouseDown = (e) => {
    const shape = ctx.pendingShapeRef.current;
    if (!shape) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    drawing = true;
    startClient = clientToContainer(e);
    const p = graph.getPointForEvent(e, false);
    startGraph = { x: p.x, y: p.y };
    ensurePreviewShape(shape);
    applyPreviewSize(0, 0, shape);
    preview.style.left = `${startClient.x}px`;
    preview.style.top = `${startClient.y}px`;
    preview.style.width = "0px";
    preview.style.height = "0px";
    preview.style.display = "block";
  };
  const onMouseMove = (e) => {
    if (!drawing) return;
    const shape = ctx.pendingShapeRef.current;
    if (!shape) return;
    const cur = clientToContainer(e);
    const x = Math.min(cur.x, startClient.x);
    const y = Math.min(cur.y, startClient.y);
    const w = Math.abs(cur.x - startClient.x);
    const h = Math.abs(cur.y - startClient.y);
    preview.style.left = `${x}px`;
    preview.style.top = `${y}px`;
    preview.style.width = `${w}px`;
    preview.style.height = `${h}px`;
    applyPreviewSize(w, h, shape);
  };
  const finishDraw = (e) => {
    if (!drawing) return;
    drawing = false;
    ctx.rootRef.current?.focus({ preventScroll: true });
    preview.style.display = "none";
    const shape = ctx.pendingShapeRef.current;
    if (!shape) return;
    const endPoint = graph.getPointForEvent(e, false);
    const rawW = Math.abs(endPoint.x - startGraph.x);
    const rawH = Math.abs(endPoint.y - startGraph.y);
    if (shape.startsWith("edge-")) {
      const connectionHandler = graph.getPlugin("ConnectionHandler");
      if (connectionHandler) {
        const edgeStyle = styleForShape(shape, ctx.darkModeRef.current);
        connectionHandler.createEdgeState = function() {
          const edge = this.graph.createEdge(void 0, void 0, void 0, void 0, void 0, edgeStyle);
          return new CellState(this.graph.view, edge, this.graph.getCellStyle(edge));
        };
      }
      ctx.setPending(null);
      return;
    }
    let x;
    let y;
    let w;
    let h;
    if (rawW < MIN_DRAW_SIZE && rawH < MIN_DRAW_SIZE) {
      const size = DEFAULT_SIZE[shape];
      w = size.w;
      h = size.h;
      x = snap(startGraph.x - w / 2);
      y = snap(startGraph.y - h / 2);
    } else {
      x = snap(Math.min(startGraph.x, endPoint.x));
      y = snap(Math.min(startGraph.y, endPoint.y));
      w = Math.max(GRID_SIZE, snap(rawW));
      h = Math.max(GRID_SIZE, snap(rawH));
    }
    const parent = graph.getDefaultParent();
    const id = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    graph.batchUpdate(() => {
      const cell = graph.insertVertex({
        parent,
        id,
        value: SHAPE_LABEL[shape],
        position: [x, y],
        size: [w, h],
        style: styleForShape(shape, ctx.darkModeRef.current)
      });
      graph.setSelectionCell(cell);
    });
    ctx.setPending(null);
  };
  container.addEventListener("mousedown", onMouseDown, true);
  container.addEventListener("mousemove", onMouseMove, true);
  container.addEventListener("mouseup", finishDraw, true);
  const onMouseUpDiag = (e) => {
    if (ctx.pendingShapeRef.current) return;
    const g = ctx.graphRef.current;
    if (!g) return;
    const sel = g.getSelectionCells();
    logger.debug("GraphCanvas", "mouseup | metaKey|ctrlKey: " + (e.metaKey || e.ctrlKey) + " | selCount: " + sel.length + " | isCloneEvent: " + g.isCloneEvent(e));
  };
  container.addEventListener("mouseup", onMouseUpDiag, true);
  return () => {
    container.removeEventListener("mousedown", onMouseDown, true);
    container.removeEventListener("mousemove", onMouseMove, true);
    container.removeEventListener("mouseup", finishDraw, true);
    container.removeEventListener("mouseup", onMouseUpDiag, true);
    preview.remove();
  };
};
export {
  setupDragDraw
};
