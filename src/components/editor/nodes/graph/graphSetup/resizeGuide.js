import { PolylineShape, Point } from "@maxgraph/core";
import { getSelectionColor } from "../graphTheme";
const SNAP_TOLERANCE = 6;
const GUIDE_STROKEWIDTH = 1;
function movableEdges(handleIndex) {
  return {
    left: handleIndex === 0 || handleIndex === 3 || handleIndex === 5,
    right: handleIndex === 2 || handleIndex === 4 || handleIndex === 7,
    top: handleIndex === 0 || handleIndex === 1 || handleIndex === 2,
    bottom: handleIndex === 5 || handleIndex === 6 || handleIndex === 7
  };
}
class ResizeGuide {
  graph;
  states;
  dark;
  /** 竖直引导线（x 轴对齐） */
  guideX = null;
  /** 水平引导线（y 轴对齐） */
  guideY = null;
  /** 最近一次吸附后的 bounds（drawGuides 用它算线段跨度） */
  appliedBounds = null;
  constructor(graph, states, dark) {
    this.graph = graph;
    this.states = states;
    this.dark = dark;
  }
  /**
   * 对给定 bounds 做对齐吸附。
   *
   * @param bounds       原始 resize 后的 bounds（来自 VertexHandler.resizeVertex）
   * @param handleIndex  当前拖动的手柄索引（0..7）
   * @returns            吸附结果；无任何命中返回 null
   */
  snap(bounds, handleIndex) {
    const {
      left: mvLeft,
      right: mvRight,
      top: mvTop,
      bottom: mvBottom
    } = movableEdges(handleIndex);
    const scale = this.graph.getView().scale;
    const tol = SNAP_TOLERANCE * scale;
    const result = bounds.clone();
    const guides = [];
    const xHit = this.snapX(bounds, mvLeft, mvRight, tol);
    if (xHit) {
      xHit.apply(result);
      guides.push({ axis: "x", value: xHit.value, refState: xHit.refState });
    }
    const yHit = this.snapY(bounds, mvTop, mvBottom, tol);
    if (yHit) {
      yHit.apply(result);
      guides.push({ axis: "y", value: yHit.value, refState: yHit.refState });
    }
    if (guides.length === 0) return null;
    this.appliedBounds = result;
    return { bounds: result, guides };
  }
  /** X 轴对齐检测：可移动边（left 或 right）与其它 state 的 left/right/center 对齐 */
  snapX(bounds, mvLeft, mvRight, tol) {
    if (!mvLeft && !mvRight) return null;
    const viaLeft = mvLeft;
    let bestDist = tol;
    let best = null;
    const consider = (target, refState, dist, apply) => {
      if (dist < bestDist) {
        bestDist = dist;
        best = { value: target, refState, apply };
      }
    };
    const movableCoord = viaLeft ? bounds.x : bounds.x + bounds.width;
    for (const s of this.states) {
      if (!s) continue;
      const targets = [s.x, s.x + s.width, s.getCenterX()];
      for (const t of targets) {
        const dist = Math.abs(movableCoord - t);
        consider(t, s, dist, (b) => {
          if (viaLeft) {
            const right = b.x + b.width;
            b.x = t;
            b.width = Math.max(0, right - t);
          } else {
            b.width = Math.max(0, t - b.x);
          }
        });
      }
    }
    return best;
  }
  /** Y 轴对齐检测：可移动边（top 或 bottom）与其它 state 的 top/bottom/center 对齐 */
  snapY(bounds, mvTop, mvBottom, tol) {
    if (!mvTop && !mvBottom) return null;
    const viaTop = mvTop;
    let bestDist = tol;
    let best = null;
    const consider = (target, refState, dist, apply) => {
      if (dist < bestDist) {
        bestDist = dist;
        best = { value: target, refState, apply };
      }
    };
    const movableCoord = viaTop ? bounds.y : bounds.y + bounds.height;
    for (const s of this.states) {
      if (!s) continue;
      const targets = [s.y, s.y + s.height, s.getCenterY()];
      for (const t of targets) {
        const dist = Math.abs(movableCoord - t);
        consider(t, s, dist, (b) => {
          if (viaTop) {
            const bottom = b.y + b.height;
            b.y = t;
            b.height = Math.max(0, bottom - t);
          } else {
            b.height = Math.max(0, t - b.y);
          }
        });
      }
    }
    return best;
  }
  // ───────────────────────── 引导线绘制 ─────────────────────────
  /** 绘制引导线（先 hide 再画，避免残留） */
  drawGuides(guides) {
    this.hide();
    const ab = this.appliedBounds;
    for (const g of guides) {
      if (g.axis === "x") {
        this.ensureGuide("x");
        const minY = Math.min(ab?.y ?? 0, g.refState.y);
        const maxY = Math.max(
          (ab?.y ?? 0) + (ab?.height ?? 0),
          g.refState.y + g.refState.height
        );
        this.guideX.points = [
          new Point(g.value, minY),
          new Point(g.value, maxY)
        ];
        this.guideX.stroke = getSelectionColor(this.dark);
        this.guideX.node.style.visibility = "visible";
        this.guideX.redraw();
      } else {
        this.ensureGuide("y");
        const minX = Math.min(ab?.x ?? 0, g.refState.x);
        const maxX = Math.max(
          (ab?.x ?? 0) + (ab?.width ?? 0),
          g.refState.x + g.refState.width
        );
        this.guideY.points = [
          new Point(minX, g.value),
          new Point(maxX, g.value)
        ];
        this.guideY.stroke = getSelectionColor(this.dark);
        this.guideY.node.style.visibility = "visible";
        this.guideY.redraw();
      }
    }
  }
  /** 确保引导线 shape 已创建 */
  ensureGuide(axis) {
    if (axis === "x" && !this.guideX) {
      const guide = new PolylineShape(
        [],
        getSelectionColor(this.dark),
        GUIDE_STROKEWIDTH
      );
      guide.dialect = "svg";
      guide.pointerEvents = false;
      guide.init(this.graph.getView().getOverlayPane());
      this.guideX = guide;
    } else if (axis === "y" && !this.guideY) {
      const guide = new PolylineShape(
        [],
        getSelectionColor(this.dark),
        GUIDE_STROKEWIDTH
      );
      guide.dialect = "svg";
      guide.pointerEvents = false;
      guide.init(this.graph.getView().getOverlayPane());
      this.guideY = guide;
    }
  }
  /** 隐藏所有引导线 */
  hide() {
    if (this.guideX) this.guideX.node.style.visibility = "hidden";
    if (this.guideY) this.guideY.node.style.visibility = "hidden";
  }
  /** 销毁引导线 shape */
  destroy() {
    if (this.guideX) {
      this.guideX.destroy();
      this.guideX = null;
    }
    if (this.guideY) {
      this.guideY.destroy();
      this.guideY = null;
    }
    this.appliedBounds = null;
  }
}
export {
  ResizeGuide
};
