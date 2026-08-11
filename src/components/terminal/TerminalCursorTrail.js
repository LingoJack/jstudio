import {
  BaseCursorTrail
} from "../ui/cursor/BaseCursorTrail";
const UNDERLINE_THICKNESS_RATIO = 0.15;
const BAR_THICKNESS_RATIO = 0.12;
const BLINK_SOLID_MS = 400;
const BLINK_PERIOD_MS = 700;
const THROTTLE_FPS = 20;
class TerminalCursorTrail extends BaseCursorTrail {
  /** The terminal currently being tracked. */
  term = null;
  /** The DOM container of the tracked terminal (for measuring grid). */
  termContainer = null;
  /** xterm onCursorMove subscription for the tracked term (wakes the loop). */
  cursorMoveSub = null;
  /** Current cursor style — drives the trail quad shape. */
  cursorStyle = "underline";
  lastCursorX = -1;
  lastCursorY = -1;
  needsRender = false;
  /** When the cursor last moved/appeared (ms epoch) — drives blink phase. */
  cursorVisibleStartTime = 0;
  // ── Grid metrics (re-measured each frame) ──
  cellW = 8;
  cellH = 16;
  gridLeft = 0;
  gridTop = 0;
  // Poke state (cross-pane fly animation)
  _poked = false;
  _pokeFromX = null;
  _pokeFromY = null;
  /**
   * @param canvas       An overlay canvas that covers the entire pane area
   *                     (all panes).  This class does NOT own the canvas —
   *                     the caller creates and positions it.
   * @param color        Initial trail color.
   * @param cursorStyle  Initial cursor style — drives the trail quad shape.
   */
  constructor(canvas, color, cursorStyle = "underline") {
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
  attach(term, container, fromScreenX, fromScreenY) {
    this.term = term;
    this.termContainer = container;
    this.cursorMoveSub?.dispose();
    this.cursorMoveSub = term.onCursorMove(() => this.wake());
    this.measureGrid();
    this._poked = true;
    this._pokeFromX = fromScreenX ?? null;
    this._pokeFromY = fromScreenY ?? null;
    this.wake();
  }
  setCursorStyle(style) {
    this.cursorStyle = style;
    this.wake();
  }
  dispose() {
    this.cursorMoveSub?.dispose();
    this.cursorMoveSub = null;
    super.dispose();
  }
  /** Check whether the trail is currently tracking this terminal. */
  isAttachedTo(term) {
    return this.term === term;
  }
  /**
   * Get the tracked terminal's cursor position in viewport (screen)
   * pixel coordinates.  Used for cross-pane attach().
   */
  getCursorScreenPos() {
    if (!this.term || !this.termContainer) return null;
    const term = this.term;
    const container = this.termContainer;
    const buf = term.buffer.active;
    const cx = buf.cursorX;
    const cy = buf.cursorY;
    const screenEl = container.querySelector(".xterm-screen");
    if (!screenEl) return null;
    const rowEls = screenEl.querySelectorAll(".xterm-rows > div");
    let cellH = this.cellH;
    let cellW = this.cellW;
    let originX = 0;
    let originY = 0;
    if (rowEls.length >= 1) {
      const r0 = rowEls[0].getBoundingClientRect();
      cellH = rowEls.length >= 2 ? rowEls[1].getBoundingClientRect().top - r0.top : r0.height;
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
      y: originY + (cy + 1) * cellH - cellH * this.cursorThicknessY() * 0.5
    };
  }
  // ── Private: Grid measurement ──
  /**
   * Measure grid metrics relative to the overlay canvas, NOT the
   * terminal container.
   */
  measureGrid() {
    if (!this.term || !this.termContainer) return;
    const term = this.term;
    const container = this.termContainer;
    const screenEl = container.querySelector(".xterm-screen");
    if (!screenEl) return;
    const canvasRect = this.canvas.getBoundingClientRect();
    const rowEls = screenEl.querySelectorAll(".xterm-rows > div");
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
  cursorThicknessY() {
    switch (this.cursorStyle) {
      case "underline":
        return UNDERLINE_THICKNESS_RATIO;
      case "block":
      case "bar":
      default:
        return 1;
    }
  }
  cursorThicknessX() {
    switch (this.cursorStyle) {
      case "bar":
        return BAR_THICKNESS_RATIO;
      case "block":
      case "underline":
      default:
        return 1;
    }
  }
  // ── BaseCursorTrail implementation ──
  /**
   * Read cursor position from xterm buffer and set cursorEdgeX/Y.
   * Handles poke (cross-pane fly) and first-frame snap.
   */
  updateTarget() {
    this.measureGrid();
    if (!this.term) return;
    const buf = this.term.buffer.active;
    const cx = buf.cursorX;
    const cy = buf.cursorY;
    const cellLeft = this.gridLeft + cx * this.cellW;
    const cellRight = this.gridLeft + (cx + 1) * this.cellW;
    const cellTop = this.gridTop + cy * this.cellH;
    const cellBottom = this.gridTop + (cy + 1) * this.cellH;
    const thickX = this.cursorThicknessX();
    const thickY = this.cursorThicknessY();
    this.cursorEdgeX[0] = cellLeft;
    this.cursorEdgeX[1] = cellLeft + this.cellW * thickX;
    this.cursorEdgeY[0] = cellBottom - this.cellH * thickY;
    this.cursorEdgeY[1] = cellBottom;
    this.cursorVisible = true;
    if (cx !== this.lastCursorX || cy !== this.lastCursorY) {
      this.cursorVisibleStartTime = performance.now();
    }
    if (this._poked) {
      let flyFromX;
      let flyFromY;
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
  getRenderOptions() {
    return { fillCursor: true, blink: this.computeBlink() };
  }
  /**
   * Smooth blink phase in 0..1.  Solid for {@link BLINK_SOLID_MS} after any
   * move, then a gentle sine fade so the cursor pulses without ever fully
   * vanishing (matches the bar / underline blink in EditorCursorTrail).
   */
  computeBlink() {
    const elapsed = performance.now() - this.cursorVisibleStartTime;
    if (elapsed < BLINK_SOLID_MS) return 1;
    const phase = (elapsed - BLINK_SOLID_MS) % BLINK_PERIOD_MS / BLINK_PERIOD_MS;
    const wave = (Math.cos(phase * Math.PI * 2) + 1) * 0.5;
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
  shouldThrottle() {
    return !this._poked && this.opacity >= 0.999 && this.cornersSettled();
  }
  throttleFps() {
    return THROTTLE_FPS;
  }
}
export {
  TerminalCursorTrail as default
};
