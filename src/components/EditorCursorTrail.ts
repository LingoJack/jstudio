/**
 * EditorCursorTrail — editor cursor trail (contentEditable / ProseMirror),
 * built on BaseCursorTrail.
 *
 * Editor-specific responsibilities:
 *   - Reading cursor position from the browser Selection / Range API.
 *   - Deriving cell metrics from font-size (no fixed grid like xterm).
 *   - Blink animation for all cursor styles (VS Code default rhythm).
 *   - Shaping the trail quad by cursor style (bar / block / underline).
 *
 * All GL pipeline, kitty physics, and rendering are inherited from
 * BaseCursorTrail — no duplication.
 */

import {
  BaseCursorTrail,
  type RenderOptions,
} from './cursor/BaseCursorTrail';
import type { EditorCursorStyle } from '../lib/storage';

// ── Cursor blink (milliseconds) ──────────────────────────────────────
// Matches VS Code's default cursor blink: 530ms on, 530ms off.
const BLINK_PERIOD_MS = 1060;
const BLINK_ON_RATIO = 0.5;

// ── Caret geometry (same ratios as terminal CursorTrail) ─────────────
const UNDERLINE_THICKNESS_RATIO = 0.15;
const BAR_THICKNESS_RATIO = 0.12;
const CHAR_WIDTH_RATIO = 0.6;
const CARET_BAR_WIDTH_PX = 2;

export class EditorCursorTrail extends BaseCursorTrail {
  /** The ProseMirror editor DOM element (for focus detection). */
  private editorEl: HTMLElement | null = null;
  /** The scroll container that wraps the editor (for coordinate mapping). */
  private scrollContainer: HTMLElement | null = null;

  /** Current cursor shape — controls the trail geometry. */
  private cursorStyle: EditorCursorStyle = 'bar';

  /** When the cursor first became visible (ms epoch) — for blink phase. */
  private cursorVisibleStartTime = 0;
  /** Whether the caret position has changed since last frame. */
  private prevCaretKey = '';
  /** Cached line-spacing value (avoid getComputedStyle every frame). */
  private cachedLineSpacing = 1.7;

  /**
   * @param canvas           An overlay canvas positioned over the editor area.
   * @param color            Trail color as "#rrggbb".
   * @param editorEl         The .ProseMirror element.
   * @param scrollContainer  The scrollable ancestor container.
   */
  constructor(
    canvas: HTMLCanvasElement,
    color: string,
    editorEl: HTMLElement,
    scrollContainer: HTMLElement,
  ) {
    super(canvas, color);
    this.editorEl = editorEl;
    this.scrollContainer = scrollContainer;
  }

  // ── Public API ──

  setCursorStyle(style: EditorCursorStyle) {
    this.cursorStyle = style;
  }

  resize() {
    super.resize();
    // Refresh cached line-spacing (cheap, only called on resize).
    const lsStr =
      getComputedStyle(document.documentElement).getPropertyValue('--jstudio-line-height') || '1.7';
    this.cachedLineSpacing = parseFloat(lsStr) || 1.7;
  }

  // ── BaseCursorTrail implementation ──

  /**
   * Read caret position from the Selection API and set cursorEdgeX/Y.
   * Handles first-frame snap and blink timer reset.
   */
  protected updateTarget() {
    const caretRect = this.measureCaretRect();

    if (caretRect) {
      // Detect if the caret position changed — reset blink timer so the
      // cursor immediately appears solid when you type or move.
      const key = `${caretRect.left.toFixed(1)}|${caretRect.top.toFixed(1)}`;
      const wasHidden = !this.cursorVisible;
      this.cursorVisible = true;
      this.cursorEdgeX[0] = caretRect.left;
      this.cursorEdgeX[1] = caretRect.right;
      this.cursorEdgeY[0] = caretRect.top;
      this.cursorEdgeY[1] = caretRect.bottom;
      if (key !== this.prevCaretKey || wasHidden) {
        this.cursorVisibleStartTime = performance.now();
        this.prevCaretKey = key;
      }
    } else {
      this.cursorVisible = false;
    }

    if (this.firstFrame && caretRect) {
      this.snapCorners();
      this.firstFrame = false;
    }
  }

  /**
   * Render options.
   *
   * 'bar' uses CUTOUT mode: the native caret shows through the hole in
   * the trail quad.  Blink is handled by CSS caret-color animation on
   * the editor element (see vscode-theme.css).
   *
   * 'block'/'underline' use FILL mode with shader blink because there
   * is no native equivalent — the solid fill IS the cursor.
   */
  protected getRenderOptions(): RenderOptions {
    const useFill = this.cursorStyle === 'block' || this.cursorStyle === 'underline';

    let blink = 1.0;
    if (useFill) {
      // Blink only when stationary (trail corners ≈ target).
      const maxDelta = Math.max(
        Math.abs(this.cornerX[0] - this.cursorEdgeX[1]),
        Math.abs(this.cornerX[2] - this.cursorEdgeX[0]),
        Math.abs(this.cornerY[0] - this.cursorEdgeY[0]),
        Math.abs(this.cornerY[2] - this.cursorEdgeY[1]),
      );
      if (maxDelta < 2) {
        const elapsed = performance.now() - this.cursorVisibleStartTime;
        const phase = (elapsed % BLINK_PERIOD_MS) / BLINK_PERIOD_MS;
        blink = phase < BLINK_ON_RATIO ? 1.0 : 0.0;
      }
    }

    return { fillCursor: useFill, blink };
  }

  // ── Private: Caret measurement ──

  /**
   * Measure the caret position in overlay-canvas-local pixel coordinates.
   * Returns null when there is no collapsed caret (no focus, or a text
   * range selection is active).
   */
  private measureCaretRect(): { left: number; right: number; top: number; bottom: number } | null {
    if (!this.editorEl || !this.scrollContainer) return null;

    // The editor must contain the active element (focused).
    if (!this.editorEl.contains(document.activeElement)) return null;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return this.measureCaretViaTempSpan();
    }

    return this.toCanvasLocal(rect);
  }

  /**
   * Fallback caret measurement: insert a temporary zero-width span at the
   * caret position and measure its bounding rect.
   */
  private measureCaretViaTempSpan(): { left: number; right: number; top: number; bottom: number } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.textContent = '\u200b';
    span.style.display = 'inline-block';

    const clonedRange = range.cloneRange();
    clonedRange.insertNode(span);

    const rect = span.getBoundingClientRect();
    const parent = span.parentNode;
    if (parent) parent.removeChild(span);

    sel.removeAllRanges();
    sel.addRange(range);

    if (rect.width === 0 && rect.height === 0) return null;

    return this.toCanvasLocal(rect);
  }

  /**
   * Convert a screen-space DOMRect to overlay-canvas-local coordinates,
   * adjusting the shape to match the selected cursor style.
   *
   * Cell metrics are derived from font-size (via line-height ÷ line-spacing),
   * NOT from the DOMRect height (which includes line-spacing and would be
   * too large for 'block').
   */
  private toCanvasLocal(rect: DOMRect): { left: number; right: number; top: number; bottom: number } | null {
    const canvasRect = this.canvas.getBoundingClientRect();
    const left = rect.left - canvasRect.left;
    const top = rect.top - canvasRect.top;
    const lineHeight = Math.max(rect.height, 1);

    const fontSize = lineHeight / this.cachedLineSpacing;
    const charWidth = Math.max(fontSize * CHAR_WIDTH_RATIO, CARET_BAR_WIDTH_PX);

    let trailLeft: number;
    let trailRight: number;
    let trailTop: number;
    let trailBottom: number;

    switch (this.cursorStyle) {
      case 'block': {
        const blockH = fontSize;
        trailLeft = left;
        trailRight = left + charWidth;
        trailTop = top + (lineHeight - blockH) / 2;
        trailBottom = trailTop + blockH;
        break;
      }
      case 'underline': {
        const underH = Math.max(fontSize * UNDERLINE_THICKNESS_RATIO, 2);
        trailLeft = left;
        trailRight = left + charWidth;
        trailTop = top + lineHeight - underH;
        trailBottom = top + lineHeight;
        break;
      }
      case 'bar':
      default: {
        const barW = Math.max(charWidth * BAR_THICKNESS_RATIO, CARET_BAR_WIDTH_PX);
        trailLeft = left;
        trailRight = left + barW;
        trailTop = top;
        trailBottom = top + lineHeight;
        break;
      }
    }

    if (trailRight < 0 || trailLeft > this.cssW || trailBottom < 0 || trailTop > this.cssH) return null;

    return { left: trailLeft, right: trailRight, top: trailTop, bottom: trailBottom };
  }
}
