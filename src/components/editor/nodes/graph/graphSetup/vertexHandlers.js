import {
  HandleConfig,
  VertexHandlerConfig,
  EdgeHandlerConfig,
  VertexHandler,
  EdgeHandler,
  EllipseShape,
  RectangleShape,
  RhombusShape,
  Rectangle,
  InternalEvent
} from "@maxgraph/core";
import {
  getHandleFillColor,
  getHandleStrokeColor,
  getSelectionColor,
  HANDLE_SIZE,
  SELECTION_STROKE_WIDTH,
  SELECTION_DASHED
} from "../graphTheme";
import { MINDMAP_EDGE_STYLE } from "../mindmapLayout";
import { ResizeGuide } from "./resizeGuide";
let resizeGuideInstalled = false;
let edgeHandleOverrideInstalled = false;
const setupVertexHandlers = (ctx) => {
  const { graph } = ctx;
  const dark = ctx.darkModeRef.current;
  HandleConfig.size = HANDLE_SIZE;
  HandleConfig.fillColor = getHandleFillColor(dark);
  HandleConfig.strokeColor = getHandleStrokeColor(dark);
  VertexHandlerConfig.selectionColor = getSelectionColor(dark);
  VertexHandlerConfig.selectionStrokeWidth = SELECTION_STROKE_WIDTH;
  VertexHandlerConfig.selectionDashed = SELECTION_DASHED;
  EdgeHandlerConfig.selectionColor = getSelectionColor(dark);
  EdgeHandlerConfig.selectionStrokeWidth = SELECTION_STROKE_WIDTH;
  EdgeHandlerConfig.selectionDashed = SELECTION_DASHED;
  EdgeHandlerConfig.handleShape = "circle";
  EdgeHandlerConfig.connectFillColor = getHandleFillColor(dark);
  VertexHandler.prototype.createSizerShape = function(bounds, index, fillColor = HandleConfig.fillColor) {
    const strokeColor = HandleConfig.strokeColor;
    if (index === InternalEvent.ROTATION_HANDLE) {
      return new EllipseShape(bounds, fillColor, strokeColor, 1.25);
    }
    return new EllipseShape(
      bounds,
      fillColor,
      strokeColor,
      1.25
    );
  };
  VertexHandler.prototype.createSelectionShape = function(bounds) {
    const shapeStyle = this.state?.style?.shape;
    const color = this.getSelectionColor();
    const strokeWidth = this.getSelectionStrokeWidth();
    const dashed = this.isSelectionDashed();
    let shape;
    if (shapeStyle === "rhombus") {
      shape = new RhombusShape(
        Rectangle.fromRectangle(bounds),
        "none",
        color,
        strokeWidth
      );
    } else if (shapeStyle === "ellipse") {
      shape = new EllipseShape(
        Rectangle.fromRectangle(bounds),
        "none",
        color,
        strokeWidth
      );
    } else {
      shape = new RectangleShape(
        Rectangle.fromRectangle(bounds),
        "none",
        color,
        strokeWidth
      );
    }
    shape.isDashed = dashed;
    return shape;
  };
  installResizeGuide(graph, dark);
  installEdgeHandleFilter();
};
function installResizeGuide(graph, dark) {
  if (resizeGuideInstalled) return;
  resizeGuideInstalled = true;
  const Proto = VertexHandler.prototype;
  const originalResizeVertex = Proto.resizeVertex;
  const originalReset = Proto.reset;
  Proto.resizeVertex = function(me) {
    originalResizeVertex.call(this, me);
    if (this.index == null || this.index < 0 || this.index > 7 || !this.bounds || !this.state) {
      return;
    }
    if (!this._resizeGuide) {
      const sh = graph.getPlugin("SelectionHandler");
      const allStates = sh ? sh.getGuideStates() : [];
      const guideStates = allStates.filter(
        (s) => s.cell !== this.state.cell
      );
      this._resizeGuide = new ResizeGuide(graph, guideStates, dark);
    }
    const guide = this._resizeGuide;
    const snapped = guide.snap(this.bounds, this.index);
    if (!snapped) {
      guide.hide();
      return;
    }
    this.bounds = snapped.bounds;
    syncUnscaledBounds(this);
    if (this.livePreviewActive) {
      this.updateLivePreview(me);
    } else if (this.preview != null) {
      this.drawPreview();
    }
    guide.drawGuides(snapped.guides);
  };
  Proto.reset = function() {
    originalReset.call(this);
    if (this._resizeGuide) {
      this._resizeGuide.destroy();
      this._resizeGuide = null;
    }
  };
}
function syncUnscaledBounds(handler) {
  if (!handler.unscaledBounds || !handler.bounds) return;
  const scale = handler.graph.view.scale;
  const tr = handler.graph.view.translate;
  const ps = handler.parentState;
  const originX = ps ? ps.x : tr.x * scale;
  const originY = ps ? ps.y : tr.y * scale;
  handler.unscaledBounds.x = (handler.bounds.x - originX) / scale;
  handler.unscaledBounds.y = (handler.bounds.y - originY) / scale;
  handler.unscaledBounds.width = handler.bounds.width / scale;
  handler.unscaledBounds.height = handler.bounds.height / scale;
}
function installEdgeHandleFilter() {
  if (edgeHandleOverrideInstalled) return;
  edgeHandleOverrideInstalled = true;
  const original = EdgeHandler.prototype.isHandleVisible;
  EdgeHandler.prototype.isHandleVisible = function(index) {
    if (this.state?.style?.edgeStyle === MINDMAP_EDGE_STYLE) {
      return index === 0 || index === this.abspoints.length - 1;
    }
    return original.call(this, index);
  };
}
export {
  setupVertexHandlers
};
