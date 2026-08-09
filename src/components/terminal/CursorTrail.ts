import type { Terminal, IDisposable } from '@xterm/xterm';
import type { TerminalCursorStyle } from '../../types/settings';
import {
  BaseCursorTrail,
  type RenderOptions,
} from '../ui/cursor/BaseCursorTrail';

/**
 * CursorTrail — terminal cursor trail (xterm), built on BaseCursorTrail.
 *
 * Terminal-specific responsibilities:
 *   - Reading cursor position from xterm's buffer (cursorX / cursorY).
 *   - Measuring the grid (cellW, cellH, gridLeft, gridTop) from xterm DOM.
 *   - Cross-pane attach() with a "poke" fly animation.
 *   - Shaping the trail quad by cursor style (block / underline / bar).
 *
 * Rendering model: the trail runs in FILL mode — the solid quad (shaped per
 * cursor style) IS the cursor.  xterm's own native cursor is hidden by the
 * parent (cursorHidden = true) so the two never stack into a "double
 * underline".  This mirrors EditorCursorTrail and keeps the editor and
 * terminal cursors visually identical.
 *
 * All GL pipeline, kitty physics, and rendering are inherited from
 * BaseCursorTrail — no duplication.
 */

/** Thickness ratios — define the trail quad shape for non-block cursors. */
const UNDERLINE_THICKNESS_RATIO = 0.15;
const BAR_THICKNESS_RATIO = 0.12;

// ── Blink animation timing (ms) — kept in sync with EditorCursorTrail. ──
/** Stay fully solid for this long after the cursor moves/appears. */
const BLINK_SOLID_MS = 400;
/** Full blink cycle (fade out + back in) once blinking begins. */
const BLINK_PERIOD_MS = 700;
/** Reduced frame rate once the cursor is stationary and only blink remains. */
const THROTTLE_FPS = 20;

export default class CursorTrail extends BaseCursorTrail {
  /** The terminal currently being tracked. */
  private term: Terminal | null = null;
  /** The DOM container of the tracked terminal (for measuring grid). */
  private termContainer: HTMLElement | null = null;
  /** xterm onCursorMove subscription for the tracked term (wakes the loop). */
  private cursorMoveSub: IDisposable | null = null;

  /** Current cursor style — drives the trail quad shape. */
  private cursorStyle: TerminalCursorStyle = 'underline';

  private lastCursorX = -1;
  private lastCursorY = -1;
  private needsRender = false;

  /** When the cursor last moved/appeared (ms epoch) — drives blink phase. */
  private cursorVisibleStartTime = 0;

  // ── Grid metrics (re-measured each frame) ──
  private cellW = 8;
  private cellH = 16;
  private gridLeft = 0;
  private gridTop = 0;

  // Poke state (cross-pane fly animation)
  private _poked = false;
  private _pokeFromX: number | null = null;
  private _pokeFromY: number | null = null;

  /**
   * @param canvas       An overlay canvas that covers the entire pane area
   *                     (all panes).  This class does NOT own the canvas —
   *                     the caller creates and positions it.
   * @param color        Initial trail color.
   * @param cursorStyle  Initial cursor style — drives the trail quad shape.
   */
  constructor(
    canvas: HTMLCanvasElement,
    color: string,
    cursorStyle: TerminalCursorStyle = 'underline',
  ) {
    super(canvas, color);
    this.cursorStyle = cursorStyle;
  }

  // ── Public API ──

  /**
   * Point the trail at a new terminal.  Called when the active pane
   * changes.  The trail will immediately start tracking this terminal's
   * cursor.
   *
   * @param fromScreenX / fromScreenY  Optional origin in overlay-canvas
   *        local pixels (the old pane's cursor mapped to overlay space).
   *        Produces a smooth cross-pane fly animation.
   */
  attach(
    term: Terminal,
    container: HTMLElement,
    fromScreenX?: number,
    fromScreenY?: number,
  ) {
    this.term = term;
    this.termContainer = container;

    // Re-subscribe cursor-move tracking to the newly attached term so the
    // parked loop wakes whenever this terminal's cursor moves (typing,
    // program output, navigation).  Dispose the previous term's listener
    // first to avoid leaks across pane switches.
    this.cursorMoveSub?.dispose();
    this.cursorMoveSub = term.onCursorMove(() => this.wake());

    // Force a poke so the trail animates from the old position.
    this.measureGrid();
    this._poked = true;
    this._pokeFromX = fromScreenX ?? null;
    this._pokeFromY = fromScreenY ?? null;
    // A fresh poke is an animation — resume the loop if it had parked.
    this.wake();
  }

  setCursorStyle(style: TerminalCursorStyle) {
    this.cursorStyle = style;
    // Shape changed → re-render even if currently parked.
    this.wake();
  }

  dispose() {
    this.cursorMoveSub?.dispose();
    this.cursorMoveSub = null;
    super.dispose();
  }

  /** Check whether the trail is currently tracking this terminal. */
  isAttachedTo(term: Terminal): boolean {
    return this.term === term;
  }

  /**
   * Get the tracked terminal's cursor position in viewport (screen)
   * pixel coordinates.  Used for cross-pane attach().
   */
  getCursorScreenPos(): { x: number; y: number } | null {
    if (!this.term || !this.termContainer) return null;
    const term = this.term;
    const container = this.termContainer;

    const buf = term.buffer.active;
    const cx = buf.cursorX;
    const cy = buf.cursorY;

    const screenEl = container.querySelector('.xterm-screen') as HTMLElement | null;
    if (!screenEl) return null;

    const rowEls = screenEl.querySelectorAll('.xterm-rows > div');
    let cellH = this.cellH;
    let cellW = this.cellW;
    let originX = 0;
    let originY = 0;

    if (rowEls.length >= 1) {
      const r0 = rowEls[0].getBoundingClientRect();
      cellH = rowEls.length >= 2
        ? rowEls[1].getBoundingClientRect().top - r0.top
        : r0.height;
      cellW = r0.width / Math.max(1, term.cols);
      originX = r0.left;
      originY = r0.top;
    } else {
      const sr = screenEl.getBoundingClientRect();
      cellH = sr.height / Math.max(1, term.rows);
      cellW = sr.width / Math.max(1, term.cols);
      originX = sr.left;
      originY = sr.top;
    }

    return {
      x: originX + cx * cellW,
      y: originY + (cy + 1) * cellH - cellH * this.cursorThicknessY() * 0.5,
    };
  }

  // ── Private: Grid measurement ──

  /**
   * Measure grid metrics relative to the overlay canvas, NOT the
   * terminal container.
   */
  private measureGrid() {
    if (!this.term || !this.termContainer) return;
    const term = this.term;
    const container = this.termContainer;

    const screenEl = container.querySelector('.xterm-screen') as HTMLElement | null;
    if (!screenEl) return;

    const canvasRect = this.canvas.getBoundingClientRect();

    const rowEls = screenEl.querySelectorAll('.xterm-rows > div');
    if (rowEls.length >= 2) {
      const r0 = rowEls[0].getBoundingClientRect();
      const r1 = rowEls[1].getBoundingClientRect();
      this.cellH = r1.top - r0.top;
      this.cellW = r0.width / Math.max(1, term.cols);
      this.gridTop = r0.top - canvasRect.top;
      this.gridLeft = r0.left - canvasRect.left;
    } else if (rowEls.length === 1) {
      const r0 = rowEls[0].getBoundingClientRect();
      this.cellH = r0.height;
      this.cellW = r0.width / Math.max(1, term.cols);
      this.gridTop = r0.top - canvasRect.top;
      this.gridLeft = r0.left - canvasRect.left;
    } else {
      const screenRect = screenEl.getBoundingClientRect();
      this.cellH = screenRect.height / Math.max(1, term.rows);
      this.cellW = screenRect.width / Math.max(1, term.cols);
      this.gridTop = screenRect.top - canvasRect.top;
      this.gridLeft = screenRect.left - canvasRect.left;
    }
  }

  // ── Private: Cursor-shape geometry helpers ──

  private cursorThicknessY(): number {
    switch (this.cursorStyle) {
      case 'underline':
        return UNDERLINE_THICKNESS_RATIO;
      case 'block':
      case 'bar':
      default:
        return 1.0;
    }
  }

  private cursorThicknessX(): number {
    switch (this.cursorStyle) {
      case 'bar':
        return BAR_THICKNESS_RATIO;
      case 'block':
      case 'underline':
      default:
        return 1.0;
    }
  }

  // ── BaseCursorTrail implementation ──

  /**
   * Read cursor position from xterm buffer and set cursorEdgeX/Y.
   * Handles poke (cross-pane fly) and first-frame snap.
   */
  protected updateTarget() {
    // Measure grid every frame (xterm layout can change).
    this.measureGrid();
    if (!this.term) return;

    const buf = this.term.buffer.active;
    const cx = buf.cursorX;
    const cy = buf.cursorY;

    // Full cell bounds.
    const cellLeft = this.gridLeft + cx * this.cellW;
    const cellRight = this.gridLeft + (cx + 1) * this.cellW;
    const cellTop = this.gridTop + cy * this.cellH;
    const cellBottom = this.gridTop + (cy + 1) * this.cellH;

    // Trail quad edges follow the cursor shape.
    const thickX = this.cursorThicknessX();
    const thickY = this.cursorThicknessY();
    this.cursorEdgeX[0] = cellLeft;
    this.cursorEdgeX[1] = cellLeft + this.cellW * thickX;
    this.cursorEdgeY[0] = cellBottom - this.cellH * thickY;
    this.cursorEdgeY[1] = cellBottom;

    this.cursorVisible = true;

    // Reset the blink timer the moment the cursor jumps to a new cell so it
    // appears solid immediately after typing / navigation (then resumes
    // blinking once it sits still), exactly like EditorCursorTrail.
    if (cx !== this.lastCursorX || cy !== this.lastCursorY) {
      this.cursorVisibleStartTime = performance.now();
    }

    if (this._poked) {
      let flyFromX: number;
      let flyFromY: number;
      if (this._pokeFromX !== null && this._pokeFromY !== null) {
        flyFromX = this._pokeFromX;
        flyFromY = this._pokeFromY;
      } else {
        flyFromX = this.cursorEdgeX[0];
        flyFromY = this.cursorEdgeY[0] - this.cssH * 0.6;
      }
      for (let i = 0; i < 4; i++) {
        this.cornerX[i] = flyFromX;
        this.cornerY[i] = flyFromY;
      }
      this.opacity = 1;
      this._poked = false;
      this._pokeFromX = null;
      this._pokeFromY = null;
      this.firstFrame = false;
    } else if (this.firstFrame) {
      this.snapCorners();
      this.firstFrame = false;
    }

    this.lastCursorX = cx;
    this.lastCursorY = cy;
  }

  /**
   * Render options: FILL mode — the solid quad shaped in {@link updateTarget}
   * IS the cursor (xterm's native cursor is hidden by the parent), so it is
   * always visible and pulses via the blink multiplier.  This is what lets a
   * stationary terminal show a single cursor instead of stacking the native
   * underline under the trail's underline.
   */
  protected getRenderOptions(): RenderOptions {
    return { fillCursor: true, blink: this.computeBlink() };
  }

  /**
   * Smooth blink phase in 0..1.  Solid for {@link BLINK_SOLID_MS} after any
   * move, then a gentle sine fade so the cursor pulses without ever fully
   * vanishing (matches the bar / underline blink in EditorCursorTrail).
   */
  private computeBlink(): number {
    const elapsed = performance.now() - this.cursorVisibleStartTime;
    if (elapsed < BLINK_SOLID_MS) return 1.0;

    const phase = ((elapsed - BLINK_SOLID_MS) % BLINK_PERIOD_MS) / BLINK_PERIOD_MS;
    const wave = (Math.cos(phase * Math.PI * 2) + 1) * 0.5; // 1..0..1
    const floor = 0.15;
    return floor + (1 - floor) * wave;
  }

  /**
   * Keep the loop alive but throttled once the comet has converged and the
   * only thing left to animate is the slow blink.  We can't fully park (as
   * the old isIdle override did) because a parked loop would freeze the
   * cursor mid-fade now that the fill IS the cursor.  Any cursor move fires
   * xterm's onCursorMove → wake() → full-rate rAF for the comet.
   */
  protected shouldThrottle(): boolean {
    return !this._poked && this.opacity >= 0.999 && this.cornersSettled();
  }

  protected throttleFps(): number {
    return THROTTLE_FPS;
  }
}
