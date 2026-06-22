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

// ── Caret geometry ───────────────────────────────────────────────────
const UNDERLINE_THICKNESS_RATIO = 0.15;
const BAR_THICKNESS_RATIO = 0.12;
/** Fallback character width (× font-size) when no glyph sits at the caret
 *  — e.g. end of line or empty paragraph.  The cursor then uses HALF of
 *  this, per the "no character → 1/2 width" rule. */
const CHAR_WIDTH_RATIO = 0.6;
const CARET_BAR_WIDTH_PX = 2;
/** Caret body height relative to font-size (a touch taller than the glyph
 *  so it visually matches the text, centred within the line box). */
const GLYPH_HEIGHT_RATIO = 1.15;
/** Block-cursor fill opacity.  A full-opacity block would completely hide
 *  the glyph it sits on; keeping it semi-transparent tints the character
 *  with the cursor colour while leaving it readable underneath. */
const BLOCK_FILL_ALPHA = 0.5;

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
    let blink = this.computeBlink();
    // Block sits directly on top of a glyph; dim it so the character
    // underneath stays readable (the fill only tints it).
    if (this.cursorStyle === 'block') blink *= BLOCK_FILL_ALPHA;
    return { fillCursor: true, blink };
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
    const fontSize = this.fontSizeAt(range.startContainer);
    const glyph = this.measureGlyphAt(range, fontSize);

    if (rect.width === 0 && rect.height === 0) {
      return this.measureCaretViaTempSpan();
    }

    return this.toCanvasLocal(rect, fontSize, glyph);
  }

  /**
   * Measure the glyph the caret is anchored to.
   *
   * We look at the character *following* the caret (the one you'd overtype
   * in block mode).  If a real character is there, we return its actual
   * advance width and `onChar = true` so the cursor matches CJK / wide /
   * narrow glyphs exactly.  If there's nothing after the caret (end of
   * line, empty block), `onChar = false` and the caller falls back to the
   * half-width rule.
   */
  /**
   * Measure the glyph the caret is anchored to.
   *
   * Preference order:
   *   1. Character *after* the caret (the one you'd overtype) → anchor to
   *      the right of the caret.
   *   2. If nothing follows (end of line / end of text), the character
   *      *before* the caret (the one the caret visually sits under, e.g.
   *      a Chinese glyph you just typed) → anchor to the left.
   *   3. Neither → half-width fallback.
   *
   * Returning the real advance width makes the cursor match CJK / wide /
   * narrow glyphs exactly; `before` tells the caller which side of the
   * caret the glyph occupies so it can position the cursor over it.
   */
  private measureGlyphAt(
    caret: Range,
    fontSize: number,
  ): { width: number; onChar: boolean; before: boolean } {
    const fallback = fontSize * CHAR_WIDTH_RATIO;
    const node = caret.startContainer;
    const offset = caret.startOffset;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';

      // 1. Character after the caret.
      if (offset < text.length) {
        const w = this.rangeWidth(node, offset, text, +1);
        if (w > 0.5) return { width: w, onChar: true, before: false };
      }

      // 2. Character before the caret.
      if (offset > 0) {
        const w = this.rangeWidth(node, offset, text, -1);
        if (w > 0.5) return { width: w, onChar: true, before: true };
      }
    }

    return { width: fallback, onChar: false, before: false };
  }

  /**
   * Width (px) of the code point adjacent to `offset` in `text`.
   * @param dir +1 = the character starting at `offset` (after the caret),
   *            -1 = the character ending at `offset` (before the caret).
   */
  private rangeWidth(node: Node, offset: number, text: string, dir: 1 | -1): number {
    try {
      const r = document.createRange();
      if (dir === 1) {
        // Code point starting at offset (handle surrogate pairs / emoji).
        const cp = text.codePointAt(offset);
        const len = cp !== undefined && cp > 0xffff ? 2 : 1;
        r.setStart(node, offset);
        r.setEnd(node, Math.min(offset + len, text.length));
      } else {
        // Code point ending at offset.
        const prev = text.codePointAt(offset - 2);
        const isPair =
          offset >= 2 && prev !== undefined && prev > 0xffff;
        r.setStart(node, offset - (isPair ? 2 : 1));
        r.setEnd(node, offset);
      }
      return r.getBoundingClientRect().width;
    } catch {
      return 0;
    }
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

    // The temp-span path only triggers at empty positions (no glyph),
    // so there is no character under the caret → half-width fallback.
    return this.toCanvasLocal(rect, fontSize, {
      width: fontSize * CHAR_WIDTH_RATIO,
      onChar: false,
      before: false,
    });
  }

  /**
   * Convert a screen-space DOMRect to overlay-canvas-local coordinates,
   * shaping the cursor to match the glyph at the caret.
   *
   * Width rule (per the spec):
   *   - caret sits ON a character → use that glyph's real advance width
   *     (so CJK / wide / narrow chars all match exactly);
   *   - caret NOT on a character (end of line, empty block) → half width.
   * Height is always the glyph's em-box height.  Position is anchored at
   * the caret's left edge, which is the glyph's left edge.
   */
  private toCanvasLocal(
    rect: DOMRect,
    fontSize: number,
    glyph: { width: number; onChar: boolean; before: boolean },
  ): { left: number; right: number; top: number; bottom: number } | null {
    const canvasRect = this.canvas.getBoundingClientRect();
    const caretLeft = rect.left - canvasRect.left;
    const top = rect.top - canvasRect.top;
    const lineHeight = Math.max(rect.height, 1);

    // Cursor footprint width: full glyph width when overtyping a real
    // character, otherwise half the fallback character width.
    const cellWidth = Math.max(
      glyph.onChar ? glyph.width : glyph.width * 0.5,
      CARET_BAR_WIDTH_PX,
    );

    // Horizontal anchor: a glyph *after* the caret occupies the space to
    // the right (left edge = caret); a glyph *before* the caret (e.g. a
    // CJK char you just typed, caret now at end of line) occupies the
    // space to the left, so the cursor must extend leftwards to sit under
    // it instead of dangling half-width to the right.
    const left = glyph.before ? caretLeft - cellWidth : caretLeft;

    // Em-box: the glyph's vertical extent, centred within the line box
    // (CSS splits the leading equally above and below the glyphs).
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
        trailRight = left + cellWidth;
        trailTop = emTop;
        trailBottom = emBottom;
        break;
      }
      case 'underline': {
        // Horizontal bar resting on the glyph baseline (em-box bottom),
        // spanning the glyph width.
        const underH = Math.max(fontSize * UNDERLINE_THICKNESS_RATIO, 2);
        trailLeft = left;
        trailRight = left + cellWidth;
        trailBottom = emBottom;
        trailTop = emBottom - underH;
        break;
      }
      case 'bar':
      default: {
        // Thin vertical bar spanning the glyph height — always at the
        // caret itself, never offset to a neighbouring glyph.
        const barW = Math.max(cellWidth * BAR_THICKNESS_RATIO, CARET_BAR_WIDTH_PX);
        trailLeft = caretLeft;
        trailRight = caretLeft + barW;
        trailTop = emTop;
        trailBottom = emBottom;
        break;
      }
    }

    if (trailRight < 0 || trailLeft > this.cssW || trailBottom < 0 || trailTop > this.cssH) return null;

    return { left: trailLeft, right: trailRight, top: trailTop, bottom: trailBottom };
  }
}
