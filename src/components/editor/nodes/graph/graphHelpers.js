import {
  getFontColor,
  getLabelBackgroundColor,
  SHAPE_FONT_SIZE,
  ARROW_END_SIZE,
  mindmapEdgeStrokeColor,
  mindmapEdgeStrokeWidth
} from "./graphTheme";
import { MINDMAP_EDGE_STYLE } from "./mindmapLayout";
const FLOW_ANIMATION_THRESHOLD = 20;
const BORDER_TOLERANCE_PX = 8;
function isOnBorder(state, x, y, tol) {
  let px = x;
  let py = y;
  const rotation = state.style?.rotation;
  if (rotation) {
    const alpha = rotation * Math.PI / 180;
    const cos = Math.cos(-alpha);
    const sin = Math.sin(-alpha);
    const cx = state.getCenterX();
    const cy = state.getCenterY();
    const dx = x - cx;
    const dy = y - cy;
    px = dx * cos - dy * sin + cx;
    py = dx * sin + dy * cos + cy;
  }
  const inOuter = px >= state.x - tol && px <= state.x + state.width + tol && py >= state.y - tol && py <= state.y + state.height + tol;
  if (!inOuter) return false;
  const inInner = px > state.x + tol && px < state.x + state.width - tol && py > state.y + tol && py < state.y + state.height - tol;
  return !inInner;
}
function mindmapEdgeStyle(dark, scheme, depth, branchIndex = 0) {
  return {
    edgeStyle: MINDMAP_EDGE_STYLE,
    curved: true,
    endArrow: "none",
    startArrow: "none",
    endSize: ARROW_END_SIZE,
    strokeColor: mindmapEdgeStrokeColor(scheme, dark, depth, branchIndex),
    strokeWidth: mindmapEdgeStrokeWidth(scheme, depth),
    fontSize: SHAPE_FONT_SIZE,
    fontColor: getFontColor(dark),
    labelBackgroundColor: getLabelBackgroundColor(dark),
    mmBranch: branchIndex,
    mmDepth: depth
  };
}
function nextCellId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
export {
  BORDER_TOLERANCE_PX,
  FLOW_ANIMATION_THRESHOLD,
  isOnBorder,
  mindmapEdgeStyle,
  nextCellId
};
