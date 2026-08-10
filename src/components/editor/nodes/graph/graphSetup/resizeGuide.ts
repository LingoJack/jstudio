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

import { PolylineShape, Point, Rectangle } from '@maxgraph/core';
import type { CellState, Graph } from '@maxgraph/core';
import { getSelectionColor } from '../graphTheme';

/** 对齐容差（px）-- 与移动对齐 EnhancedGuide 的 SNAP_TOLERANCE 一致 */
const SNAP_TOLERANCE = 6;

/** 引导线描边宽度 */
const GUIDE_STROKEWIDTH = 1;

/** 缩放时一条命中的对齐引导线描述 */
interface GuideHit {
  /** 'x' -> 竖线；'y' -> 横线 */
  axis: 'x' | 'y';
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
    const { left: mvLeft, right: mvRight, top: mvTop, bottom: mvBottom } =
      movableEdges(handleIndex);

    const scale = this.graph.getView().scale;
    const tol = SNAP_TOLERANCE * scale;

    const result = bounds.clone();
    const guides: GuideHit[] = [];

    // ── X 轴 ──
    // 每条轴最多一条可移动边，找到最近的一条对齐即可。
    const xHit = this.snapAxis(
      'x',
      bounds,
      mvLeft,
      mvRight,
      tol,
      (b) => b.x,
      (b) => b.x + b.width,
      (b) => b.getCenterX(),
      (s) => s.x,
      (s) => s.x + s.width,
      (s) => s.getCenterX(),
      // 应用函数：把可移动边移到 target
      (b, target, viaLeft) => {
        if (viaLeft) {
          // 左边 movable，右边固定
          const right = b.x + b.width;
          b.x = target;
          b.width = Math.max(0, right - target);
        } else {
          // 右边 movable，左边固定
          b.width = Math.max(0, target - b.x);
        }
      },
      // center 对齐：通过可移动边把 center 移到 target
      (b, target, viaLeft) => {
        if (viaLeft) {
          const right = b.x + b.width;
          const newLeft = 2 * target - right;
          b.x = newLeft;
          b.width = Math.max(0, right - newLeft);
        } else {
          b.width = Math.max(0, 2 * (target - b.x));
        }
      },
    );

    if (xHit) {
      xHit.apply(result);
      guides.push({ axis: 'x', value: xHit.value, refState: xHit.refState });
    }

    // ── Y 轴 ──
    const yHit = this.snapAxis(
      'y',
      bounds,
      mvTop,
      mvBottom,
      tol,
      (b) => b.y,
      (b) => b.y + b.height,
      (b) => b.getCenterY(),
      (s) => s.y,
      (s) => s.y + s.height,
      (s) => s.getCenterY(),
      (b, target, viaTop) => {
        if (viaTop) {
          const bottom = b.y + b.height;
          b.y = target;
          b.height = Math.max(0, bottom - target);
        } else {
          b.height = Math.max(0, target - b.y);
        }
      },
      (b, target, viaTop) => {
        if (viaTop) {
          const bottom = b.y + b.height;
          const newTop = 2 * target - bottom;
          b.y = newTop;
          b.height = Math.max(0, bottom - newTop);
        } else {
          b.height = Math.max(0, 2 * (target - b.y));
        }
      },
    );

    if (yHit) {
      yHit.apply(result);
      guides.push({ axis: 'y', value: yHit.value, refState: yHit.refState });
    }

    if (guides.length === 0) return null;
    return { bounds: result, guides };
  }

  /**
   * 单轴对齐检测通用逻辑。
   *
   * @param axis         'x' | 'y'
   * @param bounds       当前 bounds
   * @param viaFirst     是否可通过"首边"（left/top）调整
   * @param viaSecond    是否可通过"次边"（right/bottom）调整
   * @param tol          容差（已乘 scale）
   * @param bFirst       取 bounds 首边坐标
   * @param bSecond      取 bounds 次边坐标
   * @param bCenter      取 bounds 中心坐标
   * @param sFirst       取 state 首边坐标
   * @param sSecond      取 state 次边坐标
   * @param sCenter      取 state 中心坐标
   * @param applyEdge    把可移动边移到 target（viaFirst=true 用首边，否则次边）
   * @param applyCenter  通过可移动边把 center 移到 target
   */
  private snapAxis(
    axis: 'x' | 'y',
    bounds: Rectangle,
    viaFirst: boolean,
    viaSecond: boolean,
    tol: number,
    bFirst: (b: Rectangle) => number,
    bSecond: (b: Rectangle) => number,
    bCenter: (b: Rectangle) => number,
    sFirst: (s: CellState) => number,
    sSecond: (s: CellState) => number,
    sCenter: (s: CellState) => number,
    applyEdge: (b: Rectangle, target: number, viaFirst: boolean) => void,
    applyCenter: (b: Rectangle, target: number, viaFirst: boolean) => void,
  ): { value: number; refState: CellState; apply: (b: Rectangle) => void } | null {
    if (!viaFirst && !viaSecond) return null;

    let bestDist = tol;
    let best: {
      value: number;
      refState: CellState;
      apply: (b: Rectangle) => void;
    } | null = null;

    const tryHit = (
      candidate: number, // 候选 target 坐标
      refState: CellState,
      dist: number,
      apply: (b: Rectangle) => void,
    ) => {
      if (dist < bestDist) {
        bestDist = dist;
        best = { value: candidate, refState, apply };
      }
    };

    // 可移动边固定为 first 或 second（每轴最多一条可移动边），
    // viaFirst / viaSecond 互斥地决定用哪条边去贴。
    const viaLeftOrTop = viaFirst; // 该轴可移动的是首边（left/top）

    for (let i = 0; i < this.states.length; i++) {
      const s = this.states[i];
      if (!s) continue;

      // 边对齐：可移动边 贴 对方的 first/second/center
      const movableCoord = viaLeftOrTop ? bFirst(bounds) : bSecond(bounds);
      for (const target of [sFirst(s), sSecond(s), sCenter(s)]) {
        const dist = Math.abs(movableCoord - target);
        tryHit(
          target,
          s,
          dist,
          (b) => applyEdge(b, target, viaLeftOrTop),
        );
      }

      // center 对齐：被 resize shape 的 center 贴对方 center/边
      // 仅当该轴只有一条可移动边时（角点手柄两轴各一条边，仍满足），
      // 通过该可移动边把 center 移到 target。两边都可移（理论上不存在
      // 于标准 8 手柄）时跳过避免歧义。
      if (viaFirst !== viaSecond) {
        const cx = bCenter(bounds);
        for (const target of [sCenter(s), sFirst(s), sSecond(s)]) {
          const dist = Math.abs(cx - target);
          tryHit(
            target,
            s,
            dist,
            (b) => applyCenter(b, target, viaLeftOrTop),
          );
        }
      }
    }

    return best;
  }

  // ───────────────────────── 引导线绘制 ─────────────────────────

  /** 绘制引导线（先 hide 再画，避免残留） */
  drawGuides(guides: GuideHit[]): void {
    this.hide();
    for (const g of guides) {
      if (g.axis === 'x') {
        this.ensureGuide('x');
        const minY = Math.min(
          this.currentBoundsY(),
          g.refState.y,
        );
        const maxY = Math.max(
          this.currentBoundsY() + this.currentBoundsH(),
          g.refState.y + g.refState.height,
        );
        this.guideX!.points = [
          new Point(g.value, minY),
          new Point(g.value, maxY),
        ];
        this.guideX!.stroke = getSelectionColor(this.dark);
        this.guideX!.node.style.visibility = 'visible';
        this.guideX!.redraw();
      } else {
        this.ensureGuide('y');
        const minX = Math.min(this.currentBoundsX(), g.refState.x);
        const maxX = Math.max(
          this.currentBoundsX() + this.currentBoundsW(),
          g.refState.x + g.refState.width,
        );
        this.guideY!.points = [
          new Point(minX, g.value),
          new Point(maxX, g.value),
        ];
        this.guideY!.stroke = getSelectionColor(this.dark);
        this.guideY!.node.style.visibility = 'visible';
        this.guideY!.redraw();
      }
    }
  }

  /**
   * VertexHandler 在调用 snap 后会把吸附结果写回 this.bounds，但 drawGuides
   * 需要拿"吸附后的 bounds"来算线段跨度。这里通过模块级引用回传：
   * vertexHandlers 在 snap 后调用 setAppliedBounds 记录最新 bounds。
   */
  private _appliedBounds: Rectangle | null = null;
  setAppliedBounds(b: Rectangle): void {
    this._appliedBounds = b;
  }
  private currentBoundsX(): number {
    return this._appliedBounds?.x ?? 0;
  }
  private currentBoundsY(): number {
    return this._appliedBounds?.y ?? 0;
  }
  private currentBoundsW(): number {
    return this._appliedBounds?.width ?? 0;
  }
  private currentBoundsH(): number {
    return this._appliedBounds?.height ?? 0;
  }

  /** 确保引导线 shape 已创建 */
  private ensureGuide(axis: 'x' | 'y'): void {
    if (axis === 'x' && !this.guideX) {
      const guide = new PolylineShape([], getSelectionColor(this.dark), GUIDE_STROKEWIDTH);
      guide.dialect = 'svg';
      guide.pointerEvents = false;
      guide.init(this.graph.getView().getOverlayPane());
      this.guideX = guide;
    } else if (axis === 'y' && !this.guideY) {
      const guide = new PolylineShape([], getSelectionColor(this.dark), GUIDE_STROKEWIDTH);
      guide.dialect = 'svg';
      guide.pointerEvents = false;
      guide.init(this.graph.getView().getOverlayPane());
      this.guideY = guide;
    }
  }

  /** 隐藏所有引导线 */
  hide(): void {
    if (this.guideX) this.guideX.node.style.visibility = 'hidden';
    if (this.guideY) this.guideY.node.style.visibility = 'hidden';
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
    this._appliedBounds = null;
  }
}
