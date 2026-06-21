import type { Terminal } from '@xterm/xterm';
import type { TerminalCursorStyle } from '../../lib/storage';
import {
  BaseCursorTrail,
  CORNER_IDX_X,
  CORNER_IDX_Y,
} from '../cursor/BaseCursorTrail';

/**
 * CursorTrail — terminal cursor trail (xterm), built on BaseCursorTrail.
 *
 * Terminal-specific responsibilities:
 *   - Reading cursor position from xterm's buffer (cursorX / cursorY).
 *   - Measuring the grid (cellW, cellH, gridLeft, gridTop) from xterm DOM.
 *   - Cross-pane attach() with a "poke" fly animation.
 *   - Shaping the trail quad by cursor style (block / underline / bar).
 *
 * All GL pipeline, kitty physics, and rendering are inherited from
 * BaseCursorTrail — no duplication.
 */

/** Thickness ratios — define the trail quad shape for non-block cursors. */
const UNDERLINE_THICKNESS_RATIO = 0.15;
const BAR_THICKNESS_RATIO = 0.12;

export default class CursorTrail extends BaseCursorTrail {
  /** The terminal currently being tracked. */
  private term: Terminal | null = null;
  /** The DOM container of the tracked terminal (for measuring grid). */
  private termContainer: HTMLElement | null = null;

  /** Current cursor style — drives the trail quad shape. */
  private cursorStyle: TerminalCursorStyle = 'underline';

  private lastCursorX = -1;
  private lastCursorY = -1;
  private needsRender = false;

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

    // Force a poke so the trail animates from the old position.
    this.measureGrid();
    this._poked = true;
    this._pokeFromX = fromScreenX ?? null;
    this._pokeFromY = fromScreenY ?? null;
  }

  setCursorStyle(style: TerminalCursorStyle) {
    this.cursorStyle = style;
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
}
