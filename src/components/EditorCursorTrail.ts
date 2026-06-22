/**
 * EditorCursorTrail — editor cursor trail (contentEditable / ProseMirror),
 * built on BaseCursorTrail.
 *
 * Editor-specific responsibilities:
 *   - Reading cursor position from the browser Selection / Range API.
 *   - Deriving cell metrics from font-size (no fixed grid like xterm).
 *   - Shaping the trail quad by cursor style (bar / block / underline).
 *   - Blink is handled in BlockEditor via JS caret-color toggle.
 *
 * All GL pipeline, kitty physics, and rendering are inherited from
 * BaseCursorTrail — no duplication.
 */

import {
  BaseCursorTrail,
  type RenderOptions,
} from './cursor/BaseCursorTrail';
import type { EditorCursorStyle } from '../lib/storage';

// ── Caret geometry (same ratios as terminal CursorTrail) ─────────────
const UNDERLINE_THICKNESS_RATIO = 0.15;
const BAR_THICKNESS_RATIO = 0.12;
const CHAR_WIDTH_RATIO = 0.6;
const CARET_BAR_WIDTH_PX = 2;
/** Caret body height relative to font-size (a touch taller than the glyph
 *  so it visually matches the text, centred within the line box). */
const GLYPH_HEIGHT_RATIO = 1.15;

// ── Blink animation timing (ms) ──────────────────────────────────────
/** Stay fully solid for this long after the caret moves/appears. */
const BLINK_SOLID_MS = 530;
/** Full blink cycle (fade out + back in) once blinking begins. */
const BLINK_PERIOD_MS = 1060;

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
   * Render options: FILL mode for all styles.
   *
   * The WebGL fill IS the cursor — the solid quad is shaped per style
   * (bar / block / underline) in {@link toCanvasLocal}, and the native
   * caret is hidden by BlockEditor (caret-color: transparent).  This is
   * what lets `block` render as a solid block and `underline` as a bar
   * along the baseline — the native caret can only ever be a thin line.
   *
   * Blink is computed here as a smooth 0..1 multiplier so the cursor
   * fades out and back in (rather than a hard on/off), and is reset to
   * fully-solid whenever the caret moves or reappears.
   */
  protected getRenderOptions(): RenderOptions {
    return { fillCursor: true, blink: this.computeBlink() };
  }

  /**
   * Smooth blink phase in 0..1.
   *
   * The caret stays fully solid (1.0) for {@link BLINK_SOLID_MS} after it
   * last moved/appeared, then eases between solid and dim on a sine curve
   * with period {@link BLINK_PERIOD_MS}.  The dim floor is 0.15 (never
   * fully invisible) so the cursor remains discoverable while pulsing.
   */
  private computeBlink(): number {
    const elapsed = performance.now() - this.cursorVisibleStartTime;
    if (elapsed < BLINK_SOLID_MS) return 1.0;

    const phase = ((elapsed - BLINK_SOLID_MS) % BLINK_PERIOD_MS) / BLINK_PERIOD_MS;
    // cos: 1 → -1 → 1 over the period.  Map to 1 → floor → 1.
    const wave = (Math.cos(phase * Math.PI * 2) + 1) * 0.5; // 1..0..1
    const floor = 0.15;
    return floor + (1 - floor) * wave;
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

    return this.toCanvasLocal(rect, this.fontSizeAt(range.startContainer));
  }

  /**
   * Read the actual computed font-size (px) of the element containing the
   * caret.  This is essential because headings, code blocks, etc. each have
   * their own font-size and line-height — deriving the glyph size from a
   * single global line-spacing constant mis-sizes the cursor on those lines
   * (block too small / underline floating above the baseline).
   */
  private fontSizeAt(node: Node | null): number {
    let el: Element | null =
      node && node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node?.parentElement ?? null;
    if (!el || !(el instanceof HTMLElement)) el = this.editorEl;
    if (!el) return 16;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    return Number.isFinite(fs) && fs > 0 ? fs : 16;
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
    const fontSize = this.fontSizeAt(parent);
    if (parent) parent.removeChild(span);

    sel.removeAllRanges();
    sel.addRange(range);

    if (rect.width === 0 && rect.height === 0) return null;

    return this.toCanvasLocal(rect, fontSize);
  }

  /**
   * Convert a screen-space DOMRect to overlay-canvas-local coordinates,
   * adjusting the shape to match the selected cursor style.
   *
   * Cell metrics are derived from font-size (via line-height ÷ line-spacing),
   * NOT from the DOMRect height (which includes line-spacing and would be
   * too large for 'block').
   */
  private toCanvasLocal(
    rect: DOMRect,
    fontSize: number,
  ): { left: number; right: number; top: number; bottom: number } | null {
    const canvasRect = this.canvas.getBoundingClientRect();
    const left = rect.left - canvasRect.left;
    const top = rect.top - canvasRect.top;
    const lineHeight = Math.max(rect.height, 1);

    const charWidth = Math.max(fontSize * CHAR_WIDTH_RATIO, CARET_BAR_WIDTH_PX);

    // Em-box: the glyph band, slightly taller than font-size to cover
    // ascenders→descenders, centred within the line box (CSS splits the
    // leading equally above and below the glyphs).
    const emHeight = Math.min(fontSize * GLYPH_HEIGHT_RATIO, lineHeight);
    const emTop = top + (lineHeight - emHeight) / 2;
    const emBottom = emTop + emHeight;

    let trailLeft: number;
    let trailRight: number;
    let trailTop: number;
    let trailBottom: number;

    switch (this.cursorStyle) {
      case 'block': {
        // Solid block covering the glyph cell.
        trailLeft = left;
        trailRight = left + charWidth;
        trailTop = emTop;
        trailBottom = emBottom;
        break;
      }
      case 'underline': {
        // Horizontal bar resting on the glyph baseline (em-box bottom),
        // full character width.
        const underH = Math.max(fontSize * UNDERLINE_THICKNESS_RATIO, 2);
        trailLeft = left;
        trailRight = left + charWidth;
        trailBottom = emBottom;
        trailTop = emBottom - underH;
        break;
      }
      case 'bar':
      default: {
        // Thin vertical bar spanning the glyph height.
        const barW = Math.max(charWidth * BAR_THICKNESS_RATIO, CARET_BAR_WIDTH_PX);
        trailLeft = left;
        trailRight = left + barW;
        trailTop = emTop;
        trailBottom = emBottom;
        break;
      }
    }

    if (trailRight < 0 || trailLeft > this.cssW || trailBottom < 0 || trailTop > this.cssH) return null;

    return { left: trailLeft, right: trailRight, top: trailTop, bottom: trailBottom };
  }
}
