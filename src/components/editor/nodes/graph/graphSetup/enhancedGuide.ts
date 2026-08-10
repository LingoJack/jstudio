/**
 * EnhancedGuide - 增强版对齐引擎
 *
 * 在 maxGraph 内置 Guide 基础上增加：
 * 1. 提升标准对齐灵敏度（容差 2px -> 6px）
 * 2. 水平等间距（平分间隔）对齐
 * 3. 垂直等间距对齐
 * 4. 视觉区分：标准对齐=主题色，等间距=琥珀色
 *
 * 等间距引导线样式：
 * - 水平等间距 -> 两条水平短线段标注两侧 gap（|---|  |---|）
 * - 垂直等间距 -> 两条竖直短线段标注上下 gap
 */

import { Guide, Point, PolylineShape } from '@maxgraph/core';
import type { CellState, Rectangle } from '@maxgraph/core';
import { getSelectionColor } from '../graphTheme';

/** 标准对齐容差（px）-- 原 maxGraph 默认 2px，提升到 6px 更灵敏 */
const SNAP_TOLERANCE = 6;

/** 等间距对齐容差（px）-- 略大于标准容差，给"智能吸附"更多触发空间 */
const SPACING_TOLERANCE = 8;

/** 等间距引导线颜色（琥珀色，与标准对齐线形成视觉区分） */
const SPACING_GUIDE_COLOR = '#F59E0B';

/** 引导线描边宽度 */
const GUIDE_STROKEWIDTH = 1;

/** 垂直方向重叠容差（px），用于水平等间距的"同行"筛选 */
const OVERLAP_TOLERANCE = 20;

// ───────────────────────── 辅助函数 ─────────────────────────

/**
 * 判断两个矩形在垂直方向是否有重叠（用于水平等间距筛选）。
 * 只有大致同一行的节点才有"等间距"意义。
 */
function verticalOverlap(a: Rectangle, b: Rectangle, tol: number): boolean {
  return !(a.y + a.height + tol < b.y || b.y + b.height + tol < a.y);
}

/**
 * 判断两个矩形在水平方向是否有重叠（用于垂直等间距筛选）。
 * 只有大致同一列的节点才有"等间距"意义。
 */
function horizontalOverlap(a: Rectangle, b: Rectangle, tol: number): boolean {
  return !(a.x + a.width + tol < b.x || b.x + b.width + tol < a.x);
}

// ───────────────────────── 等间距匹配结果 ─────────────────────────

/** 等间距场景类型 */
type SpacingScenario = 1 | 2 | 3;

interface SpacingMatch {
  /** 吸附后的 delta（相对于 bounds 原始位置） */
  delta: number;
  /** 参与的两个参考节点 */
  refs: { a: CellState; b: CellState };
  /** 匹配距离（越小越优先） */
  dist: number;
  /** 匹配场景（1=中间, 2=右侧/下方, 3=左侧/上方） */
  scenario: SpacingScenario;
}

// ───────────────────────── EnhancedGuide ─────────────────────────

export class EnhancedGuide extends Guide {
  private dark: boolean;
  /** 水平等间距引导线：两条水平短线段（标注两侧 gap） */
  private guideSpacingX1: PolylineShape | null = null;
  private guideSpacingX2: PolylineShape | null = null;
  /** 垂直等间距引导线：两条竖直短线段（标注上下 gap） */
  private guideSpacingY1: PolylineShape | null = null;
  private guideSpacingY2: PolylineShape | null = null;

  constructor(graph: ConstructorParameters<typeof Guide>[0], states: CellState[], dark: boolean) {
    super(graph, states);
    this.tolerance = SNAP_TOLERANCE;
    this.dark = dark;
  }

  /** 标准对齐线跟随主题 accent 色 */
  override getGuideColor(_state: CellState, _horizontal: boolean): string {
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
  override move(
    bounds: Rectangle | null | undefined,
    delta: Point,
    gridEnabled = false,
    _clone = false,
  ): Point {
    if ((!this.horizontal && !this.vertical) || !bounds) return delta;

    const scale = this.graph.getView().scale;
    const stdTol = this.getGuideTolerance(gridEnabled) * scale;
    const spTol = SPACING_TOLERANCE * scale;
    const overlapTol = OVERLAP_TOLERANCE * scale;

    // 拖动后的当前包围盒（b = bounds + delta）
    const b = bounds.clone();
    b.x += delta.x;
    b.y += delta.y;

    const left = b.x;
    const right = b.x + b.width;
    const cx = b.getCenterX();
    const top = b.y;
    const bottom = b.y + b.height;
    const cy = b.getCenterY();

    // ════════ 阶段 A：标准对齐 ════════
    //
    // 使用可变对象包装：TypeScript 不会跟踪闭包内对 let 变量的赋值，
    // 但会正确跟踪对象属性的变更。

    const std = {
      dx: delta.x,
      dy: delta.y,
      ttX: stdTol,
      ttY: stdTol,
      stateX: null as CellState | null,
      valueX: null as number | null,
      stateY: null as CellState | null,
      valueY: null as number | null,
    };

    // snapX: 检查拖动框的左/中/右是否接近给定 x 值
    const snapX = (x: number, state: CellState, centerAlign: boolean) => {
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

    // snapY: 检查拖动框的上/中/下是否接近给定 y 值
    const snapY = (y: number, state: CellState, centerAlign: boolean) => {
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

    // ════════ 阶段 B：等间距检测 ════════

    let spMatchX: SpacingMatch | null = null;
    let spMatchY: SpacingMatch | null = null;

    if (this.horizontal) {
      spMatchX = this.detectHorizontalSpacing(bounds, b, spTol, overlapTol);
    }
    if (this.vertical) {
      spMatchY = this.detectVerticalSpacing(bounds, b, spTol, overlapTol);
    }

    // ════════ 阶段 C：择优 ════════

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

    // 非吸附轴应用网格吸附
    this.graph.snapDelta(delta, bounds, !gridEnabled, overrideX, overrideY);

    // 虚拟 state 的像素取整
    const stateForDeltaX = useSpacingX ? null : std.stateX;
    const stateForDeltaY = useSpacingY ? null : std.stateY;
    delta = this.getDelta(bounds, stateForDeltaX, delta.x, stateForDeltaY, delta.y);

    // ════════ 阶段 D：绘制引导线 ════════

    const c = this.graph.container;
    const panDx = this.graph.getPanDx();
    const panDy = this.graph.getPanDy();

    // 先隐藏所有引导线
    this.hideAllGuides();

    // ── X 轴引导线 ──
    if (useSpacingX && spMatchX) {
      // 等间距：绘制两条水平短线段标注两侧 gap
      // 拖动节点的左右边（overlay 坐标系）
      const cLeft = bounds.x + delta.x - panDx;
      const cRight = cLeft + bounds.width;
      // Y 取拖动节点垂直中心
      const cy2 = bounds.y + delta.y - panDy + bounds.height / 2;

      const { a, b: refB } = spMatchX.refs;
      const aRight = a.x + a.width;
      const bLeft = refB.x;

      // 根据场景计算两条 gap 线段的端点
      let seg1: [number, number] | null = null; // [x1, x2]
      let seg2: [number, number] | null = null;

      if (spMatchX.scenario === 1) {
        // C 在 A、B 之间：gap1 = A.right -> C.left, gap2 = C.right -> B.left
        seg1 = [aRight, cLeft];
        seg2 = [cRight, bLeft];
      } else if (spMatchX.scenario === 2) {
        // C 在 A、B 右侧：gap1 = A.right -> B.left, gap2 = B.right -> C.left
        seg2 = [refB.x + refB.width, cLeft];
        seg1 = [aRight, bLeft];
      } else {
        // C 在 A、B 左侧：gap1 = C.right -> A.left, gap2 = A.right -> B.left
        seg1 = [cRight, a.x];
        seg2 = [aRight, bLeft];
      }

      this.drawSpacingLine('x1', seg1, cy2);
      this.drawSpacingLine('x2', seg2, cy2);
    } else if (stdOverrideX && std.valueX !== null) {
      // 标准引导线：主题色竖线
      this.ensureGuide('x');
      let minY: number | null = null;
      let maxY: number | null = null;
      if (std.stateX) {
        minY = Math.min(bounds.y + delta.y - panDy, std.stateX.y);
        maxY = Math.max(bounds.y + bounds.height + delta.y - panDy, std.stateX.y + std.stateX.height);
      }
      if (minY !== null && maxY !== null) {
        this.guideX!.points = [new Point(std.valueX, minY), new Point(std.valueX, maxY)];
      } else {
        this.guideX!.points = [
          new Point(std.valueX, -panDy),
          new Point(std.valueX, c.scrollHeight - 3 - panDy),
        ];
      }
      this.guideX!.stroke = this.getGuideColor(std.stateX!, true);
      this.guideX!.node.style.visibility = 'visible';
      this.guideX!.redraw();
    }

    // ── Y 轴引导线 ──
    if (useSpacingY && spMatchY) {
      // 等间距：绘制两条竖直短线段标注上下 gap
      const cTop = bounds.y + delta.y - panDy;
      const cBottom = cTop + bounds.height;
      // X 取拖动节点水平中心
      const cx2 = bounds.x + delta.x - panDx + bounds.width / 2;

      const { a, b: refB } = spMatchY.refs;
      const aBottom = a.y + a.height;
      const bTop = refB.y;

      let seg1: [number, number] | null = null; // [y1, y2]
      let seg2: [number, number] | null = null;

      if (spMatchY.scenario === 1) {
        // C 在 A、B 之间：gap1 = A.bottom -> C.top, gap2 = C.bottom -> B.top
        seg1 = [aBottom, cTop];
        seg2 = [cBottom, bTop];
      } else if (spMatchY.scenario === 2) {
        // C 在 A、B 下方：gap1 = A.bottom -> B.top, gap2 = B.bottom -> C.top
        seg1 = [aBottom, bTop];
        seg2 = [refB.y + refB.height, cTop];
      } else {
        // C 在 A、B 上方：gap1 = C.bottom -> A.top, gap2 = A.bottom -> B.top
        seg1 = [cBottom, a.y];
        seg2 = [aBottom, bTop];
      }

      this.drawSpacingLine('y1', seg1, cx2);
      this.drawSpacingLine('y2', seg2, cx2);
    } else if (stdOverrideY && std.valueY !== null) {
      // 标准引导线：主题色横线
      this.ensureGuide('y');
      let minX: number | null = null;
      let maxX: number | null = null;
      if (std.stateY) {
        minX = Math.min(bounds.x + delta.x - panDx, std.stateY.x);
        maxX = Math.max(bounds.x + bounds.width + delta.x - panDx, std.stateY.x + std.stateY.width);
      }
      if (minX !== null && maxX !== null) {
        this.guideY!.points = [new Point(minX, std.valueY), new Point(maxX, std.valueY)];
      } else {
        this.guideY!.points = [
          new Point(-panDx, std.valueY),
          new Point(c.scrollWidth - 3 - panDx, std.valueY),
        ];
      }
      this.guideY!.stroke = this.getGuideColor(std.stateY!, false);
      this.guideY!.node.style.visibility = 'visible';
      this.guideY!.redraw();
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
  private detectHorizontalSpacing(
    bounds: Rectangle,
    b: Rectangle,
    spTol: number,
    overlapTol: number,
  ): SpacingMatch | null {
    let best: SpacingMatch | null = null;
    let bestDist = spTol;

    for (let i = 0; i < this.states.length; i++) {
      const A = this.states[i];
      if (!A || this.isStateIgnored(A)) continue;

      for (let j = 0; j < this.states.length; j++) {
        if (i === j) continue;
        const B = this.states[j];
        if (!B || this.isStateIgnored(B)) continue;

        // A 必须在 B 左侧，且有正间隙
        const aRight = A.x + A.width;
        const bLeft = B.x;
        if (bLeft <= aRight) continue;
        const gapAB = bLeft - aRight;

        // 垂直重叠筛选：大致同一行才有等间距意义
        if (!verticalOverlap(b, A, overlapTol) || !verticalOverlap(b, B, overlapTol)) continue;

        // 场景1：C 在 A、B 之间 -- 平分间隙
        const target1 = aRight + (gapAB - b.width) / 2;
        const dist1 = Math.abs(b.x - target1);
        if (dist1 < bestDist) {
          bestDist = dist1;
          best = { delta: target1 - bounds.x, refs: { a: A, b: B }, dist: dist1, scenario: 1 };
        }

        // 场景2：C 在 B 右侧 -- gap(B->C) == gap(A->B)
        const target2 = B.x + B.width + gapAB;
        const dist2 = Math.abs(b.x - target2);
        if (dist2 < bestDist) {
          bestDist = dist2;
          best = { delta: target2 - bounds.x, refs: { a: A, b: B }, dist: dist2, scenario: 2 };
        }

        // 场景3：C 在 A 左侧 -- gap(C->A) == gap(A->B)
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
  private detectVerticalSpacing(
    bounds: Rectangle,
    b: Rectangle,
    spTol: number,
    overlapTol: number,
  ): SpacingMatch | null {
    let best: SpacingMatch | null = null;
    let bestDist = spTol;

    for (let i = 0; i < this.states.length; i++) {
      const A = this.states[i];
      if (!A || this.isStateIgnored(A)) continue;

      for (let j = 0; j < this.states.length; j++) {
        if (i === j) continue;
        const B = this.states[j];
        if (!B || this.isStateIgnored(B)) continue;

        // A 必须在 B 上方，且有正间隙
        const aBottom = A.y + A.height;
        const bTop = B.y;
        if (bTop <= aBottom) continue;
        const gapAB = bTop - aBottom;

        // 水平重叠筛选：大致同一列才有等间距意义
        if (!horizontalOverlap(b, A, overlapTol) || !horizontalOverlap(b, B, overlapTol)) continue;

        // 场景1：C 在 A、B 之间 -- 平分间隙
        const target1 = aBottom + (gapAB - b.height) / 2;
        const dist1 = Math.abs(b.y - target1);
        if (dist1 < bestDist) {
          bestDist = dist1;
          best = { delta: target1 - bounds.y, refs: { a: A, b: B }, dist: dist1, scenario: 1 };
        }

        // 场景2：C 在 B 下方 -- gap(B->C) == gap(A->B)
        const target2 = B.y + B.height + gapAB;
        const dist2 = Math.abs(b.y - target2);
        if (dist2 < bestDist) {
          bestDist = dist2;
          best = { delta: target2 - bounds.y, refs: { a: A, b: B }, dist: dist2, scenario: 2 };
        }

        // 场景3：C 在 A 上方 -- gap(C->A) == gap(A->B)
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
   * 绘制等间距标注线段。
   *
   * @param slot  'x1'|'x2' -> 水平线段（y 固定，x 从 v1 到 v2）
   *              'y1'|'y2' -> 竖直线段（x 固定，y 从 v1 到 v2）
   * @param seg   [v1, v2] 线段端点坐标
   * @param fixed 垂直/水平固定坐标
   */
  private drawSpacingLine(
    slot: 'x1' | 'x2' | 'y1' | 'y2',
    seg: [number, number] | null,
    fixed: number,
  ): void {
    if (!seg) return;
    const [v1, v2] = seg;
    if (Math.abs(v2 - v1) < 1) return; // 间距太小不画

    const shape = this.ensureSpacingGuide(slot);
    if (slot === 'x1' || slot === 'x2') {
      // 水平线段
      shape.points = [new Point(v1, fixed), new Point(v2, fixed)];
    } else {
      // 竖直线段
      shape.points = [new Point(fixed, v1), new Point(fixed, v2)];
    }
    shape.stroke = SPACING_GUIDE_COLOR;
    shape.node.style.visibility = 'visible';
    shape.redraw();
  }

  // ───────────────────────── 引导线管理 ─────────────────────────

  /** 确保标准引导线 shape 已创建 */
  private ensureGuide(axis: 'x' | 'y'): void {
    if (axis === 'x' && !this.guideX) {
      this.guideX = this.createGuideShape(true);
      this.guideX.dialect = 'svg';
      this.guideX.pointerEvents = false;
      this.guideX.init(this.graph.getView().getOverlayPane());
    } else if (axis === 'y' && !this.guideY) {
      this.guideY = this.createGuideShape(false);
      this.guideY.dialect = 'svg';
      this.guideY.pointerEvents = false;
      this.guideY.init(this.graph.getView().getOverlayPane());
    }
  }

  /** 确保等间距引导线 shape 已创建并返回 */
  private ensureSpacingGuide(slot: 'x1' | 'x2' | 'y1' | 'y2'): PolylineShape {
    const prop = `guideSpacing${slot.toUpperCase()}` as
      | 'guideSpacingX1' | 'guideSpacingX2'
      | 'guideSpacingY1' | 'guideSpacingY2';
    if (!this[prop]) {
      const guide = this.createSpacingGuideShape();
      guide.dialect = 'svg';
      guide.pointerEvents = false;
      guide.init(this.graph.getView().getOverlayPane());
      this[prop] = guide;
    }
    return this[prop]!;
  }

  /** 创建等间距引导线 shape（琥珀色虚线） */
  private createSpacingGuideShape(): PolylineShape {
    const guide = new PolylineShape([], SPACING_GUIDE_COLOR, GUIDE_STROKEWIDTH);
    guide.isDashed = true;
    return guide;
  }

  /** 隐藏所有引导线（标准 + 等间距） */
  private hideAllGuides(): void {
    if (this.guideX) this.guideX.node.style.visibility = 'hidden';
    if (this.guideY) this.guideY.node.style.visibility = 'hidden';
    if (this.guideSpacingX1) this.guideSpacingX1.node.style.visibility = 'hidden';
    if (this.guideSpacingX2) this.guideSpacingX2.node.style.visibility = 'hidden';
    if (this.guideSpacingY1) this.guideSpacingY1.node.style.visibility = 'hidden';
    if (this.guideSpacingY2) this.guideSpacingY2.node.style.visibility = 'hidden';
  }

  override setVisible(visible: boolean): void {
    super.setVisible(visible);
    const v = visible ? 'visible' : 'hidden';
    if (this.guideSpacingX1) this.guideSpacingX1.node.style.visibility = v;
    if (this.guideSpacingX2) this.guideSpacingX2.node.style.visibility = v;
    if (this.guideSpacingY1) this.guideSpacingY1.node.style.visibility = v;
    if (this.guideSpacingY2) this.guideSpacingY2.node.style.visibility = v;
  }

  override destroy(): void {
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
