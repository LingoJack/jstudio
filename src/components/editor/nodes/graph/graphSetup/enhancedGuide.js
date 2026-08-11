import { Guide, Point, PolylineShape } from "@maxgraph/core";
import { getSelectionColor } from "../graphTheme";
const SNAP_TOLERANCE = 6;
const SPACING_TOLERANCE = 8;
const SPACING_GUIDE_COLOR = "#F59E0B";
const GUIDE_STROKEWIDTH = 1;
const TICK_SIZE = 4;
const OVERLAP_TOLERANCE = 20;
function verticalOverlap(a, b, tol) {
  return !(a.y + a.height + tol < b.y || b.y + b.height + tol < a.y);
}
function horizontalOverlap(a, b, tol) {
  return !(a.x + a.width + tol < b.x || b.x + b.width + tol < a.x);
}
class EnhancedGuide extends Guide {
  dark;
  /** 水平等间距引导线：两条水平短线段（标注两侧 gap） */
  guideSpacingX1 = null;
  guideSpacingX2 = null;
  /** 垂直等间距引导线：两条竖直短线段（标注上下 gap） */
  guideSpacingY1 = null;
  guideSpacingY2 = null;
  constructor(graph, states, dark) {
    super(graph, states);
    this.tolerance = SNAP_TOLERANCE;
    this.dark = dark;
  }
  /** 标准对齐线跟随主题 accent 色 */
  getGuideColor(_state, _horizontal) {
    return getSelectionColor(this.dark);
  }
  /**
   * 重写 move()：标准对齐 + 等间距检测，择优吸附。
   *
   * 阶段 A：标准对齐（左/中/右、上/中/下），容差提升至 6px
   * 阶段 B：等间距检测（三种场景 × 水平/垂直）
   * 阶段 C：择优 -- 等间距 ≤ 标准时优先等间距
   * 阶段 D：绘制引导线（标准=主题色竖/横线，等间距=琥珀色间距标注线）
   */
  move(bounds, delta, gridEnabled = false, _clone = false) {
    if (!this.horizontal && !this.vertical || !bounds) return delta;
    const scale = this.graph.getView().scale;
    const stdTol = this.getGuideTolerance(gridEnabled) * scale;
    const spTol = SPACING_TOLERANCE * scale;
    const overlapTol = OVERLAP_TOLERANCE * scale;
    const b = bounds.clone();
    b.x += delta.x;
    b.y += delta.y;
    const left = b.x;
    const right = b.x + b.width;
    const cx = b.getCenterX();
    const top = b.y;
    const bottom = b.y + b.height;
    const cy = b.getCenterY();
    const std = {
      dx: delta.x,
      dy: delta.y,
      ttX: stdTol,
      ttY: stdTol,
      stateX: null,
      valueX: null,
      stateY: null,
      valueY: null
    };
    const snapX = (x, state, centerAlign) => {
      if (centerAlign) {
        if (Math.abs(x - cx) < std.ttX) {
          std.dx = x - bounds.getCenterX();
          std.ttX = Math.abs(x - cx);
          std.stateX = state;
          std.valueX = x;
        }
      } else {
        if (Math.abs(x - left) < std.ttX) {
          std.dx = x - bounds.x;
          std.ttX = Math.abs(x - left);
          std.stateX = state;
          std.valueX = x;
        } else if (Math.abs(x - right) < std.ttX) {
          std.dx = x - bounds.x - bounds.width;
          std.ttX = Math.abs(x - right);
          std.stateX = state;
          std.valueX = x;
        }
      }
    };
    const snapY = (y, state, centerAlign) => {
      if (centerAlign) {
        if (Math.abs(y - cy) < std.ttY) {
          std.dy = y - bounds.getCenterY();
          std.ttY = Math.abs(y - cy);
          std.stateY = state;
          std.valueY = y;
        }
      } else {
        if (Math.abs(y - top) < std.ttY) {
          std.dy = y - bounds.y;
          std.ttY = Math.abs(y - top);
          std.stateY = state;
          std.valueY = y;
        } else if (Math.abs(y - bottom) < std.ttY) {
          std.dy = y - bounds.y - bounds.height;
          std.ttY = Math.abs(y - bottom);
          std.stateY = state;
          std.valueY = y;
        }
      }
    };
    for (let i = 0; i < this.states.length; i++) {
      const state = this.states[i];
      if (!state || this.isStateIgnored(state)) continue;
      if (this.horizontal) {
        snapX(state.getCenterX(), state, true);
        snapX(state.x, state, false);
        snapX(state.x + state.width, state, false);
        if (!state.cell) snapX(state.getCenterX(), state, false);
      }
      if (this.vertical) {
        snapY(state.getCenterY(), state, true);
        snapY(state.y, state, false);
        snapY(state.y + state.height, state, false);
        if (!state.cell) snapY(state.getCenterY(), state, false);
      }
    }
    const stdOverrideX = std.stateX !== null;
    const stdOverrideY = std.stateY !== null;
    let spMatchX = null;
    let spMatchY = null;
    if (this.horizontal) {
      spMatchX = this.detectHorizontalSpacing(bounds, b, spTol, overlapTol);
    }
    if (this.vertical) {
      spMatchY = this.detectVerticalSpacing(bounds, b, spTol, overlapTol);
    }
    const useSpacingX = spMatchX !== null && spMatchX.dist <= std.ttX;
    const useSpacingY = spMatchY !== null && spMatchY.dist <= std.ttY;
    if (useSpacingX && spMatchX) {
      delta.x = spMatchX.delta;
    } else if (stdOverrideX) {
      delta.x = std.dx;
    }
    if (useSpacingY && spMatchY) {
      delta.y = spMatchY.delta;
    } else if (stdOverrideY) {
      delta.y = std.dy;
    }
    const overrideX = useSpacingX || stdOverrideX;
    const overrideY = useSpacingY || stdOverrideY;
    this.graph.snapDelta(delta, bounds, !gridEnabled, overrideX, overrideY);
    const stateForDeltaX = useSpacingX ? null : std.stateX;
    const stateForDeltaY = useSpacingY ? null : std.stateY;
    delta = this.getDelta(bounds, stateForDeltaX, delta.x, stateForDeltaY, delta.y);
    const c = this.graph.container;
    const panDx = this.graph.getPanDx();
    const panDy = this.graph.getPanDy();
    this.hideAllGuides();
    if (useSpacingX && spMatchX) {
      const cLeft = bounds.x + delta.x - panDx;
      const cRight = cLeft + bounds.width;
      const cy2 = bounds.y + delta.y - panDy + bounds.height / 2;
      const { a, b: refB } = spMatchX.refs;
      const aRight = a.x + a.width;
      const bLeft = refB.x;
      let seg1 = null;
      let seg2 = null;
      if (spMatchX.scenario === 1) {
        seg1 = [aRight, cLeft];
        seg2 = [cRight, bLeft];
      } else if (spMatchX.scenario === 2) {
        seg2 = [refB.x + refB.width, cLeft];
        seg1 = [aRight, bLeft];
      } else {
        seg1 = [cRight, a.x];
        seg2 = [aRight, bLeft];
      }
      this.drawSpacingLine("x1", seg1, cy2);
      this.drawSpacingLine("x2", seg2, cy2);
    } else if (stdOverrideX && std.valueX !== null) {
      this.ensureGuide("x");
      let minY = null;
      let maxY = null;
      if (std.stateX) {
        minY = Math.min(bounds.y + delta.y - panDy, std.stateX.y);
        maxY = Math.max(bounds.y + bounds.height + delta.y - panDy, std.stateX.y + std.stateX.height);
      }
      if (minY !== null && maxY !== null) {
        this.guideX.points = [new Point(std.valueX, minY), new Point(std.valueX, maxY)];
      } else {
        this.guideX.points = [
          new Point(std.valueX, -panDy),
          new Point(std.valueX, c.scrollHeight - 3 - panDy)
        ];
      }
      this.guideX.stroke = this.getGuideColor(std.stateX, true);
      this.guideX.node.style.visibility = "visible";
      this.guideX.redraw();
    }
    if (useSpacingY && spMatchY) {
      const cTop = bounds.y + delta.y - panDy;
      const cBottom = cTop + bounds.height;
      const cx2 = bounds.x + delta.x - panDx + bounds.width / 2;
      const { a, b: refB } = spMatchY.refs;
      const aBottom = a.y + a.height;
      const bTop = refB.y;
      let seg1 = null;
      let seg2 = null;
      if (spMatchY.scenario === 1) {
        seg1 = [aBottom, cTop];
        seg2 = [cBottom, bTop];
      } else if (spMatchY.scenario === 2) {
        seg1 = [aBottom, bTop];
        seg2 = [refB.y + refB.height, cTop];
      } else {
        seg1 = [cBottom, a.y];
        seg2 = [aBottom, bTop];
      }
      this.drawSpacingLine("y1", seg1, cx2);
      this.drawSpacingLine("y2", seg2, cx2);
    } else if (stdOverrideY && std.valueY !== null) {
      this.ensureGuide("y");
      let minX = null;
      let maxX = null;
      if (std.stateY) {
        minX = Math.min(bounds.x + delta.x - panDx, std.stateY.x);
        maxX = Math.max(bounds.x + bounds.width + delta.x - panDx, std.stateY.x + std.stateY.width);
      }
      if (minX !== null && maxX !== null) {
        this.guideY.points = [new Point(minX, std.valueY), new Point(maxX, std.valueY)];
      } else {
        this.guideY.points = [
          new Point(-panDx, std.valueY),
          new Point(c.scrollWidth - 3 - panDx, std.valueY)
        ];
      }
      this.guideY.stroke = this.getGuideColor(std.stateY, false);
      this.guideY.node.style.visibility = "visible";
      this.guideY.redraw();
    }
    return delta;
  }
  // ───────────────────────── 等间距检测 ─────────────────────────
  /**
   * 水平等间距检测。
   *
   * 三种场景（A、B 为参考节点，C 为拖动节点）：
   *
   *   场景1 C 在 A、B 之间：gap(A->C) == gap(C->B)
   *   场景2 C 在 A、B 右侧：gap(A->B) == gap(B->C)
   *   场景3 C 在 A、B 左侧：gap(C->A) == gap(A->B)
   *
   * @param bounds  拖动前的原始包围盒
   * @param b       拖动后的当前包围盒（bounds + delta）
   * @param spTol   等间距吸附容差（已乘 scale）
   * @param overlapTol 垂直重叠筛选容差（已乘 scale）
   */
  detectHorizontalSpacing(bounds, b, spTol, overlapTol) {
    let best = null;
    let bestDist = spTol;
    for (let i = 0; i < this.states.length; i++) {
      const A = this.states[i];
      if (!A || this.isStateIgnored(A)) continue;
      for (let j = 0; j < this.states.length; j++) {
        if (i === j) continue;
        const B = this.states[j];
        if (!B || this.isStateIgnored(B)) continue;
        const aRight = A.x + A.width;
        const bLeft = B.x;
        if (bLeft <= aRight) continue;
        const gapAB = bLeft - aRight;
        if (!verticalOverlap(b, A, overlapTol) || !verticalOverlap(b, B, overlapTol)) continue;
        const target1 = aRight + (gapAB - b.width) / 2;
        const dist1 = Math.abs(b.x - target1);
        if (dist1 < bestDist) {
          bestDist = dist1;
          best = { delta: target1 - bounds.x, refs: { a: A, b: B }, dist: dist1, scenario: 1 };
        }
        const target2 = B.x + B.width + gapAB;
        const dist2 = Math.abs(b.x - target2);
        if (dist2 < bestDist) {
          bestDist = dist2;
          best = { delta: target2 - bounds.x, refs: { a: A, b: B }, dist: dist2, scenario: 2 };
        }
        const target3 = A.x - gapAB - b.width;
        const dist3 = Math.abs(b.x - target3);
        if (dist3 < bestDist) {
          bestDist = dist3;
          best = { delta: target3 - bounds.x, refs: { a: A, b: B }, dist: dist3, scenario: 3 };
        }
      }
    }
    return best;
  }
  /**
   * 垂直等间距检测。
   *
   * 三种场景（A、B 为参考节点，C 为拖动节点）：
   *
   *   场景1 C 在 A、B 之间：gap(A->C) == gap(C->B)
   *   场景2 C 在 A、B 下方：gap(A->B) == gap(B->C)
   *   场景3 C 在 A、B 上方：gap(C->A) == gap(A->B)
   */
  detectVerticalSpacing(bounds, b, spTol, overlapTol) {
    let best = null;
    let bestDist = spTol;
    for (let i = 0; i < this.states.length; i++) {
      const A = this.states[i];
      if (!A || this.isStateIgnored(A)) continue;
      for (let j = 0; j < this.states.length; j++) {
        if (i === j) continue;
        const B = this.states[j];
        if (!B || this.isStateIgnored(B)) continue;
        const aBottom = A.y + A.height;
        const bTop = B.y;
        if (bTop <= aBottom) continue;
        const gapAB = bTop - aBottom;
        if (!horizontalOverlap(b, A, overlapTol) || !horizontalOverlap(b, B, overlapTol)) continue;
        const target1 = aBottom + (gapAB - b.height) / 2;
        const dist1 = Math.abs(b.y - target1);
        if (dist1 < bestDist) {
          bestDist = dist1;
          best = { delta: target1 - bounds.y, refs: { a: A, b: B }, dist: dist1, scenario: 1 };
        }
        const target2 = B.y + B.height + gapAB;
        const dist2 = Math.abs(b.y - target2);
        if (dist2 < bestDist) {
          bestDist = dist2;
          best = { delta: target2 - bounds.y, refs: { a: A, b: B }, dist: dist2, scenario: 2 };
        }
        const target3 = A.y - gapAB - b.height;
        const dist3 = Math.abs(b.y - target3);
        if (dist3 < bestDist) {
          bestDist = dist3;
          best = { delta: target3 - bounds.y, refs: { a: A, b: B }, dist: dist3, scenario: 3 };
        }
      }
    }
    return best;
  }
  // ───────────────────────── 引导线绘制 ─────────────────────────
  /**
   * 绘制等间距标注线段（|---| 样式）。
   *
   * 水平 gap（slot x1/x2）：在 y=fixed 处画水平线，两端各加竖直 tick 标记
   *   |--------|
   *
   * 竖直 gap（slot y1/y2）：在 x=fixed 处画竖直线，两端各加水平 tick 标记
   *   ─
   *   |
   *   ─
   *
   * @param slot  'x1'|'x2' -> 水平标注线
   *              'y1'|'y2' -> 竖直标注线
   * @param seg   [v1, v2] 线段端点坐标
   * @param fixed 垂直/水平固定坐标
   */
  drawSpacingLine(slot, seg, fixed) {
    if (!seg) return;
    const [v1, v2] = seg;
    if (Math.abs(v2 - v1) < 1) return;
    const shape = this.ensureSpacingGuide(slot);
    const tick = TICK_SIZE * this.graph.getView().scale;
    if (slot === "x1" || slot === "x2") {
      shape.points = [
        new Point(v1, fixed - tick),
        // 左 | 上端
        new Point(v1, fixed + tick),
        // 左 | 下端
        new Point(v1, fixed),
        // 回到左中心（重绘左 | 下半段）
        new Point(v2, fixed),
        // 水平 --- 到右中心
        new Point(v2, fixed - tick),
        // 右 | 上端
        new Point(v2, fixed + tick)
        // 右 | 下端
      ];
    } else {
      shape.points = [
        new Point(fixed - tick, v1),
        // 上 ─ 左端
        new Point(fixed + tick, v1),
        // 上 ─ 右端
        new Point(fixed, v1),
        // 回到上中心（重绘上 ─ 右半段）
        new Point(fixed, v2),
        // 竖直 | 到下中心
        new Point(fixed - tick, v2),
        // 下 ─ 左端
        new Point(fixed + tick, v2)
        // 下 ─ 右端
      ];
    }
    shape.stroke = SPACING_GUIDE_COLOR;
    shape.node.style.visibility = "visible";
    shape.redraw();
  }
  // ───────────────────────── 引导线管理 ─────────────────────────
  /** 确保标准引导线 shape 已创建 */
  ensureGuide(axis) {
    if (axis === "x" && !this.guideX) {
      this.guideX = this.createGuideShape(true);
      this.guideX.dialect = "svg";
      this.guideX.pointerEvents = false;
      this.guideX.init(this.graph.getView().getOverlayPane());
    } else if (axis === "y" && !this.guideY) {
      this.guideY = this.createGuideShape(false);
      this.guideY.dialect = "svg";
      this.guideY.pointerEvents = false;
      this.guideY.init(this.graph.getView().getOverlayPane());
    }
  }
  /** 确保等间距引导线 shape 已创建并返回 */
  ensureSpacingGuide(slot) {
    const prop = `guideSpacing${slot.toUpperCase()}`;
    if (!this[prop]) {
      const guide = this.createSpacingGuideShape();
      guide.dialect = "svg";
      guide.pointerEvents = false;
      guide.init(this.graph.getView().getOverlayPane());
      this[prop] = guide;
    }
    return this[prop];
  }
  /** 创建等间距引导线 shape（琥珀色实线，|---| 样式） */
  createSpacingGuideShape() {
    const guide = new PolylineShape([], SPACING_GUIDE_COLOR, GUIDE_STROKEWIDTH);
    guide.isDashed = false;
    return guide;
  }
  /** 隐藏所有引导线（标准 + 等间距） */
  hideAllGuides() {
    if (this.guideX) this.guideX.node.style.visibility = "hidden";
    if (this.guideY) this.guideY.node.style.visibility = "hidden";
    if (this.guideSpacingX1) this.guideSpacingX1.node.style.visibility = "hidden";
    if (this.guideSpacingX2) this.guideSpacingX2.node.style.visibility = "hidden";
    if (this.guideSpacingY1) this.guideSpacingY1.node.style.visibility = "hidden";
    if (this.guideSpacingY2) this.guideSpacingY2.node.style.visibility = "hidden";
  }
  setVisible(visible) {
    super.setVisible(visible);
    const v = visible ? "visible" : "hidden";
    if (this.guideSpacingX1) this.guideSpacingX1.node.style.visibility = v;
    if (this.guideSpacingX2) this.guideSpacingX2.node.style.visibility = v;
    if (this.guideSpacingY1) this.guideSpacingY1.node.style.visibility = v;
    if (this.guideSpacingY2) this.guideSpacingY2.node.style.visibility = v;
  }
  destroy() {
    super.destroy();
    for (const shape of [this.guideSpacingX1, this.guideSpacingX2, this.guideSpacingY1, this.guideSpacingY2]) {
      if (shape) shape.destroy();
    }
    this.guideSpacingX1 = null;
    this.guideSpacingX2 = null;
    this.guideSpacingY1 = null;
    this.guideSpacingY2 = null;
  }
}
export {
  EnhancedGuide
};
