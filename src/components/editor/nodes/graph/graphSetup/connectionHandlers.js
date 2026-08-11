import {
  ImageBox,
  EllipseShape,
  Rectangle,
  CellState
} from "@maxgraph/core";
import {
  createConnectionPointSVG,
  createLifelineConnectionPointSVG,
  getConnectionPointColor,
  getFontColor,
  getLabelBackgroundColor,
  ARROW_END_SIZE,
  SHAPE_FONT_SIZE,
  CONNECTION_POINT_SIZE
} from "../graphTheme";
import { styleForShape } from "../graphConstants";
import { attachSequenceInteraction } from "../sequenceInteraction";
const setupConnectionHandlers = (ctx) => {
  const { graph, container } = ctx;
  const dark = ctx.darkModeRef.current;
  const connectionHandler = graph.getPlugin("ConnectionHandler");
  if (connectionHandler?.constraintHandler) {
    const defaultPointImage = new ImageBox(
      createConnectionPointSVG(dark),
      CONNECTION_POINT_SIZE,
      CONNECTION_POINT_SIZE
    );
    const lifelinePointImage = new ImageBox(
      createLifelineConnectionPointSVG(dark),
      2,
      2
    );
    connectionHandler.constraintHandler.pointImage = defaultPointImage;
    connectionHandler.constraintHandler.highlightColor = getConnectionPointColor(dark);
    connectionHandler.constraintHandler.getImageForConstraint = (state, _constraint, _point) => {
      const shape = state.style?.shape;
      if (shape === "lifeline" || shape === "umlActor" || shape === "umlActivation") {
        return lifelinePointImage;
      }
      return defaultPointImage;
    };
    connectionHandler.constraintHandler.getTolerance = (me) => {
      const cell = me.getCell();
      if (cell) {
        const state = graph.getView().getState(cell);
        const shape = state ? state.style?.shape : void 0;
        if (shape === "lifeline" || shape === "umlActor" || shape === "umlActivation") {
          return 6;
        }
      }
      return 2;
    };
    const ch = connectionHandler.constraintHandler;
    ch.createHighlightShape = () => {
      const color = getConnectionPointColor(dark);
      const hl = new EllipseShape(
        new Rectangle(),
        color,
        color,
        0
      );
      hl.opacity = 0.25;
      return hl;
    };
  }
  if (connectionHandler) {
    connectionHandler.livePreview = true;
    connectionHandler.createEdgeState = function() {
      const edgeStyle = {
        edgeStyle: "obstacleEdgeStyle",
        strokeColor: getConnectionPointColor(dark),
        strokeWidth: 2,
        endArrow: "classic",
        endSize: ARROW_END_SIZE,
        fontSize: SHAPE_FONT_SIZE,
        fontColor: getFontColor(dark),
        labelBackgroundColor: getLabelBackgroundColor(dark)
      };
      const edge = this.graph.createEdge(
        void 0,
        void 0,
        void 0,
        void 0,
        void 0,
        edgeStyle
      );
      return new CellState(
        this.graph.view,
        edge,
        this.graph.getCellStyle(edge)
      );
    };
    connectionHandler.getEdgeColor = ((valid) => {
      return valid ? getConnectionPointColor(dark) : "#EF4444";
    });
    connectionHandler.drawPreview = function() {
      if (this.shape) {
        this.shape.stroke = this.getEdgeColor(this.error === null);
        this.shape.strokeWidth = 2;
        this.shape.isDashed = true;
        this.shape.redraw();
      }
    };
  }
  let detachSequenceInteraction = null;
  if (connectionHandler) {
    detachSequenceInteraction = attachSequenceInteraction(
      graph,
      connectionHandler,
      container,
      () => styleForShape("activation", ctx.darkModeRef.current),
      () => ctx.autoActivationRef.current
    );
  }
  return () => detachSequenceInteraction?.();
};
export {
  setupConnectionHandlers
};
