import {
  Shape,
  ShapeRegistry,
  PerimeterRegistry,
  EdgeMarkerRegistry,
  Point,
  Rectangle
} from "@maxgraph/core";
const HEAD_HEIGHT = 50;
const ACTOR_LABEL_HEIGHT = 20;
const LifelinePerimeter = (bounds, _vertex, next, _orthogonal = false) => {
  const cx = bounds.getCenterX();
  const headH = HEAD_HEIGHT;
  const lineTop = bounds.y + headH;
  const lineBottom = bounds.y + bounds.height;
  if (next.y < lineTop) {
    const headLeft = bounds.x;
    const headRight = bounds.x + bounds.width;
    const headTop = bounds.y;
    const headBottom = lineTop;
    const clampX = (v) => Math.max(headLeft, Math.min(headRight, v));
    const clampY = (v) => Math.max(headTop, Math.min(headBottom, v));
    const dTop = Math.abs(next.y - headTop);
    const dBottom = Math.abs(next.y - headBottom);
    const dLeft = Math.abs(next.x - headLeft);
    const dRight = Math.abs(next.x - headRight);
    const minDist = Math.min(dTop, dBottom, dLeft, dRight);
    if (minDist === dTop) return new Point(clampX(next.x), headTop);
    if (minDist === dBottom) return new Point(clampX(next.x), headBottom);
    if (minDist === dLeft) return new Point(headLeft, clampY(next.y));
    return new Point(headRight, clampY(next.y));
  }
  let y = next.y;
  if (y < lineTop) {
    y = lineTop;
  } else if (y > lineBottom) {
    y = lineBottom;
  }
  return new Point(cx, y);
};
const ActivationPerimeter = (bounds, _vertex, next, _orthogonal = false) => {
  const tolerance = 2;
  const clampX = (v) => Math.max(bounds.x, Math.min(bounds.x + bounds.width, v));
  const clampY = (v) => Math.max(bounds.y, Math.min(bounds.y + bounds.height, v));
  const nearLeft = Math.abs(next.x - bounds.x) <= tolerance;
  const nearRight = Math.abs(next.x - (bounds.x + bounds.width)) <= tolerance;
  const nearTop = Math.abs(next.y - bounds.y) <= tolerance;
  const nearBottom = Math.abs(next.y - (bounds.y + bounds.height)) <= tolerance;
  if (nearLeft) return new Point(bounds.x, clampY(next.y));
  if (nearRight) return new Point(bounds.x + bounds.width, clampY(next.y));
  if (nearTop) return new Point(clampX(next.x), bounds.y);
  if (nearBottom) return new Point(clampX(next.x), bounds.y + bounds.height);
  const x = next.x < bounds.getCenterX() ? bounds.x : bounds.x + bounds.width;
  return new Point(x, clampY(next.y));
};
class UMLActorShape extends Shape {
  /** 有文字时文字条占用的顶部高度（无文字时不占位，保持旧图元视觉不变）。
   *
   * 注意：必须依据 cell 的 label 值判断，而非 this.state.text 是否存在。
   * graph.refresh() 会先销毁全部 CellState（含 text）再重建，重建时
   * CellRenderer 先 redrawShape（画小人）后 redrawLabel（创建 text），
   * 若依赖 state.text，小人会以"无文字"布局绘制，与顶部文字条重叠，
   * 直到下一次图形重绘（编辑/缩放触发）才恢复。
   */
  labelOffset() {
    const state = this.state;
    if (!state) return 0;
    const value = state.view.graph.getLabel(state.cell);
    return value != null && value.length > 0 ? ACTOR_LABEL_HEIGHT : 0;
  }
  /** 文字限制在图形顶部的文字条内（默认实现会让文字悬在整条虚线的中点）。
   *  rect 为缩放后的屏幕坐标，ACTOR_LABEL_HEIGHT 需乘以缩放系数（同 LifelineShape）。
   */
  getLabelBounds(rect) {
    const scale = this.state?.view.scale ?? 1;
    return new Rectangle(rect.x, rect.y, rect.width, ACTOR_LABEL_HEIGHT * scale);
  }
  paintBackground(c, x, y, w, h) {
    const headH = HEAD_HEIGHT;
    const scale = headH / 20;
    const iconW = 16 * scale;
    const ox = x + (w - iconW) / 2;
    const oy = y + this.labelOffset();
    c.setLineCap("round");
    c.setLineJoin("round");
    const headR = 3 * scale;
    c.ellipse(ox + 8 * scale - headR, oy + 3.5 * scale - headR, headR * 2, headR * 2);
    c.fillAndStroke();
    c.begin();
    c.moveTo(ox + 8 * scale, oy + 7 * scale);
    c.lineTo(ox + 8 * scale, oy + 11 * scale);
    c.stroke();
    c.begin();
    c.moveTo(ox + 8 * scale, oy + 8 * scale);
    c.lineTo(ox + 3 * scale, oy + 10 * scale);
    c.stroke();
    c.begin();
    c.moveTo(ox + 8 * scale, oy + 8 * scale);
    c.lineTo(ox + 13 * scale, oy + 10 * scale);
    c.stroke();
    c.begin();
    c.moveTo(ox + 8 * scale, oy + 11 * scale);
    c.lineTo(ox + 4 * scale, oy + 17 * scale);
    c.stroke();
    c.begin();
    c.moveTo(ox + 8 * scale, oy + 11 * scale);
    c.lineTo(ox + 12 * scale, oy + 17 * scale);
    c.stroke();
    c.setLineCap("flat");
    c.setLineJoin("miter");
    c.setDashed(true);
    c.begin();
    c.moveTo(ox + 8 * scale, oy + headH);
    c.lineTo(ox + 8 * scale, y + h);
    c.stroke();
    c.setDashed(false);
  }
}
class LifelineShape extends Shape {
  /**
   * 文字限制在头部矩形框内（默认实现会让文字悬在整条生命线的中点）。
   *
   * 注意：maxGraph 传入的 rect 是缩放后的屏幕坐标（见 CellRenderer.getLabelBounds /
   * CellEditorHandler.getEditorBounds），因此 HEAD_HEIGHT 必须乘以当前缩放系数，
   * 否则缩放 ≠ 1 时标签/编辑框会比头部框高，垂直居中后文字落到头部框底部。
   */
  getLabelBounds(rect) {
    const scale = this.state?.view.scale ?? 1;
    return new Rectangle(rect.x, rect.y, rect.width, HEAD_HEIGHT * scale);
  }
  paintBackground(c, x, y, w, h) {
    const headH = HEAD_HEIGHT;
    const arc = 8;
    c.roundrect(x, y, w, headH, arc, arc);
    c.fillAndStroke();
    c.setDashed(true);
    const lineX = x + w / 2;
    const lineTop = y + headH;
    const lineBottom = y + h;
    c.begin();
    c.moveTo(lineX, lineTop);
    c.lineTo(lineX, lineBottom);
    c.stroke();
    c.setDashed(false);
  }
}
class ActivationShape extends Shape {
  paintBackground(c, x, y, w, h) {
    c.rect(x, y, w, h);
    c.fillAndStroke();
  }
}
class NoteShape extends Shape {
  paintBackground(c, x, y, w, h) {
    const foldW = Math.max(8, w * 0.15);
    const foldH = Math.max(8, h * 0.12);
    c.begin();
    c.moveTo(x, y);
    c.lineTo(x + w - foldW, y);
    c.lineTo(x + w, y + foldH);
    c.lineTo(x + w, y + h);
    c.lineTo(x, y + h);
    c.lineTo(x, y);
    c.close();
    c.fillAndStroke();
    c.begin();
    c.moveTo(x + w - foldW, y);
    c.lineTo(x + w - foldW, y + foldH);
    c.lineTo(x + w, y + foldH);
    c.stroke();
  }
}
class DatabaseShape extends Shape {
  paintBackground(c, x, y, w, h) {
    const capH = Math.max(6, Math.min(w * 0.2, h * 0.15));
    const topMid = y + capH;
    const botMid = y + h - capH;
    c.begin();
    c.moveTo(x, topMid);
    c.curveTo(x, y, x + w, y, x + w, topMid);
    c.lineTo(x + w, botMid);
    c.curveTo(x + w, y + h, x, y + h, x, botMid);
    c.lineTo(x, topMid);
    c.close();
    c.fillAndStroke();
    c.begin();
    c.moveTo(x, topMid);
    c.curveTo(x, topMid + capH, x + w, topMid + capH, x + w, topMid);
    c.stroke();
  }
}
const openArrowFactory = (canvas, _shape, _type, pe, unitX, unitY, size, _source, sw, _filled) => {
  const endOffsetX = unitX * sw * 1.118;
  const endOffsetY = unitY * sw * 1.118;
  unitX *= size + sw;
  unitY *= size + sw;
  const tip = pe.clone();
  tip.x -= endOffsetX;
  tip.y -= endOffsetY;
  pe.x += -endOffsetX * 2;
  pe.y += -endOffsetY * 2;
  const baseX = tip.x - unitX;
  const baseY = tip.y - unitY;
  const halfW = (size + sw) * 0.7;
  const perpX = -unitY / (size + sw);
  const perpY = unitX / (size + sw);
  return () => {
    canvas.begin();
    canvas.moveTo(baseX + perpX * halfW, baseY + perpY * halfW);
    canvas.lineTo(tip.x, tip.y);
    canvas.lineTo(baseX - perpX * halfW, baseY - perpY * halfW);
    canvas.stroke();
  };
};
const ovalFactory = (canvas, _shape, _type, pe, unitX, unitY, size, _source, _sw, filled) => {
  const r = size * 0.5;
  const cx = pe.x - unitX * r;
  const cy = pe.y - unitY * r;
  pe.x -= unitX * r * 2;
  pe.y -= unitY * r * 2;
  return () => {
    canvas.ellipse(cx - r, cy - r, r * 2, r * 2);
    canvas.stroke();
  };
};
const diamondFactory = (canvas, _shape, _type, pe, unitX, unitY, size, _source, sw, filled) => {
  const endOffsetX = unitX * sw * 0.7071;
  const endOffsetY = unitY * sw * 0.7071;
  unitX *= size + sw;
  unitY *= size + sw;
  const tip = pe.clone();
  tip.x -= endOffsetX;
  tip.y -= endOffsetY;
  pe.x += -unitX - endOffsetX;
  pe.y += -unitY - endOffsetY;
  const perpX = -unitY / (size + sw);
  const perpY = unitX / (size + sw);
  const halfW = (size + sw) * 0.6;
  const tailX = tip.x - unitX;
  const tailY = tip.y - unitY;
  return () => {
    canvas.begin();
    canvas.moveTo(tip.x, tip.y);
    canvas.lineTo(tip.x - unitX * 0.5 + perpX * halfW, tip.y - unitY * 0.5 + perpY * halfW);
    canvas.lineTo(tailX, tailY);
    canvas.lineTo(tip.x - unitX * 0.5 - perpX * halfW, tip.y - unitY * 0.5 - perpY * halfW);
    canvas.close();
    canvas.stroke();
  };
};
function registerCustomShapes() {
  ShapeRegistry.add("umlActor", UMLActorShape);
  ShapeRegistry.add("lifeline", LifelineShape);
  ShapeRegistry.add("umlActivation", ActivationShape);
  ShapeRegistry.add("note", NoteShape);
  ShapeRegistry.add("database", DatabaseShape);
  PerimeterRegistry.add("lifelinePerimeter", LifelinePerimeter);
  PerimeterRegistry.add("activationPerimeter", ActivationPerimeter);
  EdgeMarkerRegistry.add("classic", openArrowFactory);
  EdgeMarkerRegistry.add("classicThin", openArrowFactory);
  EdgeMarkerRegistry.add("open", openArrowFactory);
  EdgeMarkerRegistry.add("openThin", openArrowFactory);
  EdgeMarkerRegistry.add("oval", ovalFactory);
  EdgeMarkerRegistry.add("diamond", diamondFactory);
  EdgeMarkerRegistry.add("diamondThin", diamondFactory);
}
export {
  ActivationPerimeter,
  ActivationShape,
  DatabaseShape,
  HEAD_HEIGHT,
  LifelinePerimeter,
  LifelineShape,
  NoteShape,
  UMLActorShape,
  registerCustomShapes
};
