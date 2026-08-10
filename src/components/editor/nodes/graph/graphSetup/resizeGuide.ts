/**
 * ResizeGuide - 缩放时的对齐引导线
 *
 * maxGraph 的 VertexHandler（resize）没有内置 guide 机制，本类补齐：
 * 拖动 8 方向缩放手柄时，检测被 resize shape 的可移动边与其它 shape
 * 的边/中心是否落在容差内，命中则吸附并画一条 accent 色实线引导线。
 *
 * 视觉与 EnhancedGuide（移动对齐）保持一致：主题 accent 色、实线、
 * 线段跨度取两 shape 的最小/最大端点。等间距对齐在 resize 场景无语义，
 * 不实现。
 */

import { PolylineShape, Point, Rectangle } from "@maxgraph/core";
import type { CellState, Graph } from "@maxgraph/core";
import { getSelectionColor } from "../graphTheme";

/** 对齐容差（px）-- 与移动对齐 EnhancedGuide 的 SNAP_TOLERANCE 一致 */
const SNAP_TOLERANCE = 6;

/** 引导线描边宽度 */
const GUIDE_STROKEWIDTH = 1;

/** 缩放时一条命中的对齐引导线描述 */
interface GuideHit {
  /** 'x' -> 竖线；'y' -> 横线 */
  axis: "x" | "y";
  /** 引导线固定坐标 */
  value: number;
  /** 参考节点 state（用于计算线段跨度） */
  refState: CellState;
}

/** snap() 返回结果 */
export interface SnapResult {
  /** 吸附后的 bounds（已应用边/中心对齐） */
  bounds: Rectangle;
  /** 要绘制的引导线 */
  guides: GuideHit[];
}

interface AxisHit {
  value: number;
  refState: CellState;
  apply: (b: Rectangle) => void;
}

/**
 * 判定手柄索引对应可移动的边。
 * 索引：0=nw 1=n 2=ne 3=w 4=e 5=sw 6=s 7=se
 * 每个手柄在每条轴上最多移动一条边。
 */
function movableEdges(handleIndex: number): {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
} {
  return {
    left: handleIndex === 0 || handleIndex === 3 || handleIndex === 5,
    right: handleIndex === 2 || handleIndex === 4 || handleIndex === 7,
    top: handleIndex === 0 || handleIndex === 1 || handleIndex === 2,
    bottom: handleIndex === 5 || handleIndex === 6 || handleIndex === 7,
  };
}

export class ResizeGuide {
  private graph: Graph;
  private states: CellState[];
  private dark: boolean;
  /** 竖直引导线（x 轴对齐） */
  private guideX: PolylineShape | null = null;
  /** 水平引导线（y 轴对齐） */
  private guideY: PolylineShape | null = null;
  /** 最近一次吸附后的 bounds（drawGuides 用它算线段跨度） */
  private appliedBounds: Rectangle | null = null;

  constructor(graph: Graph, states: CellState[], dark: boolean) {
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
  snap(bounds: Rectangle, handleIndex: number): SnapResult | null {
    const {
      left: mvLeft,
      right: mvRight,
      top: mvTop,
      bottom: mvBottom,
    } = movableEdges(handleIndex);

    const scale = this.graph.getView().scale;
    const tol = SNAP_TOLERANCE * scale;

    const result = bounds.clone();
    const guides: GuideHit[] = [];

    // ── X 轴 ──
    const xHit = this.snapX(bounds, mvLeft, mvRight, tol);
    if (xHit) {
      xHit.apply(result);
      guides.push({ axis: "x", value: xHit.value, refState: xHit.refState });
    }

    // ── Y 轴 ──
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
  private snapX(
    bounds: Rectangle,
    mvLeft: boolean,
    mvRight: boolean,
    tol: number,
  ): AxisHit | null {
    if (!mvLeft && !mvRight) return null;
    // 每轴最多一条可移动边；viaLeft=true 表示用 left 贴，否则用 right 贴
    const viaLeft = mvLeft;

    let bestDist = tol;
    let best: AxisHit | null = null;
    const consider = (
      target: number,
      refState: CellState,
      dist: number,
      apply: (b: Rectangle) => void,
    ) => {
      if (dist < bestDist) {
        bestDist = dist;
        best = { value: target, refState, apply };
      }
    };

    const movableCoord = viaLeft ? bounds.x : bounds.x + bounds.width;
    const centerCoord = bounds.getCenterX();

    for (const s of this.states) {
      if (!s) continue;
      const targets = [s.x, s.x + s.width, s.getCenterX()];
      // 边对齐：可移动边 贴 对方边/中心
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
      // center 对齐：仅当该轴只有一条可移动边时（标准 8 手柄均满足），
      // 通过该边把 center 移到 target，避免两边都可移时的歧义。
      if (mvLeft !== mvRight) {
        for (const t of targets) {
          const dist = Math.abs(centerCoord - t);
          consider(t, s, dist, (b) => {
            if (viaLeft) {
              const right = b.x + b.width;
              const newLeft = 2 * t - right;
              b.x = newLeft;
              b.width = Math.max(0, right - newLeft);
            } else {
              b.width = Math.max(0, 2 * (t - b.x));
            }
          });
        }
      }
    }
    return best;
  }

  /** Y 轴对齐检测：可移动边（top 或 bottom）与其它 state 的 top/bottom/center 对齐 */
  private snapY(
    bounds: Rectangle,
    mvTop: boolean,
    mvBottom: boolean,
    tol: number,
  ): AxisHit | null {
    if (!mvTop && !mvBottom) return null;
    const viaTop = mvTop;

    let bestDist = tol;
    let best: AxisHit | null = null;
    const consider = (
      target: number,
      refState: CellState,
      dist: number,
      apply: (b: Rectangle) => void,
    ) => {
      if (dist < bestDist) {
        bestDist = dist;
        best = { value: target, refState, apply };
      }
    };

    const movableCoord = viaTop ? bounds.y : bounds.y + bounds.height;
    const centerCoord = bounds.getCenterY();

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
      if (mvTop !== mvBottom) {
        for (const t of targets) {
          const dist = Math.abs(centerCoord - t);
          consider(t, s, dist, (b) => {
            if (viaTop) {
              const bottom = b.y + b.height;
              const newTop = 2 * t - bottom;
              b.y = newTop;
              b.height = Math.max(0, bottom - newTop);
            } else {
              b.height = Math.max(0, 2 * (t - b.y));
            }
          });
        }
      }
    }
    return best;
  }

  // ───────────────────────── 引导线绘制 ─────────────────────────

  /** 绘制引导线（先 hide 再画，避免残留） */
  drawGuides(guides: GuideHit[]): void {
    this.hide();
    const ab = this.appliedBounds;
    for (const g of guides) {
      if (g.axis === "x") {
        this.ensureGuide("x");
        const minY = Math.min(ab?.y ?? 0, g.refState.y);
        const maxY = Math.max(
          (ab?.y ?? 0) + (ab?.height ?? 0),
          g.refState.y + g.refState.height,
        );
        this.guideX!.points = [
          new Point(g.value, minY),
          new Point(g.value, maxY),
        ];
        this.guideX!.stroke = getSelectionColor(this.dark);
        this.guideX!.node.style.visibility = "visible";
        this.guideX!.redraw();
      } else {
        this.ensureGuide("y");
        const minX = Math.min(ab?.x ?? 0, g.refState.x);
        const maxX = Math.max(
          (ab?.x ?? 0) + (ab?.width ?? 0),
          g.refState.x + g.refState.width,
        );
        this.guideY!.points = [
          new Point(minX, g.value),
          new Point(maxX, g.value),
        ];
        this.guideY!.stroke = getSelectionColor(this.dark);
        this.guideY!.node.style.visibility = "visible";
        this.guideY!.redraw();
      }
    }
  }

  /** 确保引导线 shape 已创建 */
  private ensureGuide(axis: "x" | "y"): void {
    if (axis === "x" && !this.guideX) {
      const guide = new PolylineShape(
        [],
        getSelectionColor(this.dark),
        GUIDE_STROKEWIDTH,
      );
      guide.dialect = "svg";
      guide.pointerEvents = false;
      guide.init(this.graph.getView().getOverlayPane());
      this.guideX = guide;
    } else if (axis === "y" && !this.guideY) {
      const guide = new PolylineShape(
        [],
        getSelectionColor(this.dark),
        GUIDE_STROKEWIDTH,
      );
      guide.dialect = "svg";
      guide.pointerEvents = false;
      guide.init(this.graph.getView().getOverlayPane());
      this.guideY = guide;
    }
  }

  /** 隐藏所有引导线 */
  hide(): void {
    if (this.guideX) this.guideX.node.style.visibility = "hidden";
    if (this.guideY) this.guideY.node.style.visibility = "hidden";
  }

  /** 销毁引导线 shape */
  destroy(): void {
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
