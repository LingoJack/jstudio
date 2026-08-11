import { ConnectionConstraint, Point } from "@maxgraph/core";
import {
  paletteFor,
  getFontColor,
  getEdgeColor,
  getLabelBackgroundColor,
  SHAPE_STROKE_WIDTH,
  SHAPE_FONT_SIZE,
  ARROW_END_SIZE
} from "../graphTheme";
import { CONNECTION_POINTS } from "../graphConstants";
import { HEAD_HEIGHT } from "../customShapes";
const setupDefaultStyles = (ctx) => {
  const { graph } = ctx;
  const dark = ctx.darkModeRef.current;
  const defaultPal = paletteFor("rectangle", dark);
  const vertexDefault = graph.getStylesheet().getDefaultVertexStyle();
  vertexDefault.fillColor = defaultPal.fill;
  vertexDefault.strokeColor = defaultPal.stroke;
  vertexDefault.fontColor = getFontColor(dark);
  vertexDefault.strokeWidth = SHAPE_STROKE_WIDTH;
  vertexDefault.fontSize = SHAPE_FONT_SIZE;
  const edgeDefault = graph.getStylesheet().getDefaultEdgeStyle();
  edgeDefault.edgeStyle = "obstacleEdgeStyle";
  edgeDefault.rounded = true;
  edgeDefault.endArrow = "classic";
  edgeDefault.endSize = ARROW_END_SIZE;
  edgeDefault.strokeColor = getEdgeColor(dark);
  edgeDefault.strokeWidth = SHAPE_STROKE_WIDTH;
  edgeDefault.fontSize = SHAPE_FONT_SIZE;
  edgeDefault.fontColor = getFontColor(dark);
  edgeDefault.labelBackgroundColor = getLabelBackgroundColor(dark);
  graph.getAllConnectionConstraints = (terminal) => {
    if (!terminal?.cell?.isVertex()) return null;
    const cellStyle = graph.getCellStyle(terminal.cell);
    const shapeStyle = cellStyle?.shape;
    if (shapeStyle === "lifeline" || shapeStyle === "umlActor") {
      const nodeHeight = terminal.height ?? 150;
      const constraints = [];
      constraints.push(new ConnectionConstraint(new Point(0.5, 0), true));
      const headMidY = HEAD_HEIGHT / 2 / nodeHeight;
      constraints.push(new ConnectionConstraint(new Point(0, headMidY), true));
      constraints.push(new ConnectionConstraint(new Point(1, headMidY), true));
      constraints.push(new ConnectionConstraint(new Point(0.5, HEAD_HEIGHT / nodeHeight), true));
      const SPACING = 10;
      const startY = HEAD_HEIGHT + 8;
      const endY = nodeHeight - 8;
      for (let absY = startY; absY <= endY; absY += SPACING) {
        constraints.push(new ConnectionConstraint(new Point(0.5, absY / nodeHeight), true));
      }
      return constraints;
    }
    if (shapeStyle === "umlActivation") {
      const nodeHeight = terminal.height ?? 40;
      const constraints = [];
      const SPACING = 8;
      for (let absY = 0; absY <= nodeHeight; absY += SPACING) {
        const ry = absY / nodeHeight;
        constraints.push(new ConnectionConstraint(new Point(0, ry), true));
        constraints.push(new ConnectionConstraint(new Point(1, ry), true));
      }
      constraints.push(new ConnectionConstraint(new Point(0.5, 0), true));
      constraints.push(new ConnectionConstraint(new Point(0.5, 1), true));
      return constraints;
    }
    return CONNECTION_POINTS.map(
      ([x, y]) => new ConnectionConstraint(new Point(x, y), true)
    );
  };
};
export {
  setupDefaultStyles
};
