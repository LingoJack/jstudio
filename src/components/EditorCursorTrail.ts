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

/** Longhand font properties of a glyph, used to re-draw it identically. */
interface GlyphFont {
  fontStyle: string;
  fontWeight: string;
  fontSize: string;
  fontFamily: string;
  letterSpacing: string;
}

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
   * DOM overlay that re-draws the glyph covered by a block cursor in the
   * editor's *background* colour, so the character stays legible on top of
   * the opaque block (terminal-style colour inversion).  Lazily created.
   */
  private glyphEl: HTMLDivElement | null = null;
  /** The glyph currently sitting under the block cursor (canvas-local). */
  private coveredGlyph: {
    text: string;
    left: number;
    top: number;
    width: number;
    height: number;
    font: GlyphFont;
  } | null = null;
  /** Editor background colour for the inverted glyph (cached, refreshed on
   *  caret move). */
  private invertColor = '#1e1e1e';

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
    this.invertColor = this.resolveInvertColor();
  }

  /**
   * Colour to paint the glyph that a block cursor covers.  We use the
   * editor's background colour so the character reads as inverted (e.g.
   * white-on-dark text becomes dark-on-green-block), matching how a
   * terminal block cursor swaps foreground/background.
   */
  private resolveInvertColor(): string {
    const fromVar = getComputedStyle(document.documentElement)
      .getPropertyValue('--vscode-editor-background')
      .trim();
    if (fromVar) return fromVar;
    // Walk up from the editor for a non-transparent background.
    let el: HTMLElement | null = this.editorEl;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'transparent' && !bg.startsWith('rgba(0, 0, 0, 0')) return bg;
      el = el.parentElement;
    }
    return '#1e1e1e';
  }

  // ── Public API ──

  setCursorStyle(style: EditorCursorStyle) {
    this.cursorStyle = style;
  }

  stop() {
    super.stop();
    if (this.glyphEl) this.glyphEl.style.display = 'none';
  }

  dispose() {
    super.dispose();
    if (this.glyphEl?.parentNode) this.glyphEl.parentNode.removeChild(this.glyphEl);
    this.glyphEl = null;
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

    // Sync the inverted-glyph overlay (block cursor only).
    this.syncGlyphOverlay();
  }

  /**
   * Render / position / hide the DOM overlay that re-draws the glyph sitting
   * under a block cursor in the editor's background colour.
   *
   * The WebGL block is drawn in the trail colour and is opaque, so it hides
   * whatever character it covers.  Rather than dimming the block (which
   * leaves the glyph muddy), we paint the same character on top of it in the
   * inverted colour — exactly how a terminal block cursor inverts fg/bg.
   *
   * The overlay's opacity tracks the block's blink so the glyph fades in
   * lock-step with the block (they invert together, never out of phase).
   */
  private syncGlyphOverlay() {
    const g = this.cursorVisible ? this.coveredGlyph : null;
    if (!g) {
      if (this.glyphEl) this.glyphEl.style.display = 'none';
      return;
    }

    if (!this.glyphEl) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'absolute',
        pointerEvents: 'none',
        display: 'block',
        textAlign: 'left',
        whiteSpace: 'pre',
        margin: '0',
        padding: '0',
        boxSizing: 'border-box',
        overflow: 'visible',
        zIndex: '1',
      } as Partial<CSSStyleDeclaration>);
      // Layer the glyph above the trail canvas inside the same overlay.
      this.canvas.parentElement?.appendChild(el);
      this.glyphEl = el;
    }

    const el = this.glyphEl;
    el.style.display = 'block';
    el.style.left = `${g.left}px`;
    el.style.top = `${g.top}px`;
    el.style.width = `${g.width}px`;
    el.style.height = `${g.height}px`;
    // Apply font as LONGHAND props (the `font` shorthand silently fails on
    // some font-variant values, dropping back to 16px).  The glyph's
    // bounding rect IS its original line box, so setting line-height to the
    // rect height reproduces the baseline exactly — only colour changes.
    const f = g.font;
    el.style.fontStyle = f.fontStyle;
    el.style.fontWeight = f.fontWeight;
    el.style.fontSize = f.fontSize;
    el.style.fontFamily = f.fontFamily;
    el.style.letterSpacing = f.letterSpacing;
    el.style.lineHeight = `${g.height}px`;
    el.style.color = this.invertColor;
    el.style.opacity = String(this.computeBlink());
    if (el.textContent !== g.text) el.textContent = g.text;
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
   * Blink phase in 0..1 for the current cursor style.
   *
   * - bar / underline: SMOOTH sine fade (they float beside/below the text
   *   and never occlude it, so a gentle pulse looks best).
   * - block: HARD on/off.  A block sits on top of a glyph and inverts its
   *   colour; a partially-faded block would let the original glyph bleed
   *   through the half-transparent fill AND show the inverted glyph at
   *   reduced opacity — a muddy three-way blend.  Snapping between fully
   *   solid (clean inversion) and fully off (original glyph) keeps it crisp,
   *   exactly like a terminal block cursor.
   */
  private computeBlink(): number {
    const elapsed = performance.now() - this.cursorVisibleStartTime;
    if (elapsed < BLINK_SOLID_MS) return 1.0;

    if (this.cursorStyle === 'block') {
      // Hard square-wave: solid for the first half of each cycle, off for
      // the second.
      const t = (elapsed - BLINK_SOLID_MS) % BLINK_PERIOD_MS;
      return t < BLINK_PERIOD_MS * 0.5 ? 1.0 : 0.0;
    }

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

    // ── Workaround: WebKit getBoundingClientRect() on collapsed ranges ──
    //
    // For a collapsed caret inside a multi-line text node (very common in
    // `<pre>` code blocks with `white-space: pre`), WebKit/WKWebView's
    // `range.getBoundingClientRect()` returns the **union** of every line
    // box the range touches — NOT the single line box the caret is on.
    //
    // Concretely, when the caret sits on the last line of a multi-line code
    // block:
    //   rect.top    = top of the FIRST line (wrong — should be the last line)
    //   rect.height = total height of ALL lines
    //   rect.width  = width of the WIDEST line (wrong — should be 0)
    //
    // This produces two visible bugs:
    //   1. Cursor appears at the bottom, overlapping the code block border
    //      (because `toCanvasLocal` centres the em-box within an oversized
    //      `lineHeight`).
    //   2. Cursor width is wider than normal (because `rect.width` reflects
    //      the widest line, not the caret's actual zero-width position).
    //
    // The fix: use `getClientRects()` which, even for a collapsed range,
    // returns an array of per-line boxes.  We pick the LAST one — that is
    // always the line box the caret physically sits on (browsers lay out
    // line boxes top-to-bottom, and the caret is at the end of the last
    // box).
    //
    // Chromium has never had this bug, so this is purely a WebKit fix.
    // The fallback to `getBoundingClientRect()` preserves the original
    // behaviour for any edge case where `getClientRects()` is empty.
    const rects = range.getClientRects();
    let rect: DOMRect;
    if (rects.length > 0) {
      // Last client rect = the actual line box the caret is on.
      rect = rects[rects.length - 1];
    } else {
      rect = range.getBoundingClientRect();
    }

    const fontSize = this.fontSizeAt(range.startContainer);
    const lineHeight = this.lineHeightAt(range.startContainer, fontSize);
    const glyph = this.measureGlyphAt(range, fontSize);

    // With the per-line rect from getClientRects(), a collapsed caret on a
    // real character has width 0 and height ≈ lineHeight.  But a collapsed
    // caret at an "empty" spot (truly empty paragraph, or between blocks)
    // also returns width=0 height=0 — that's the tempSpan fallback case.
    if (rect.width === 0 && rect.height === 0) {
      this.coveredGlyph = null;
      return this.measureCaretViaTempSpan(lineHeight);
    }

    return this.toCanvasLocal(rect, fontSize, lineHeight, glyph);
  }

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
   * caret the glyph occupies so it can position the cursor over it.  When
   * a real glyph is found, `cover` carries everything needed to re-draw it
   * in the inverted colour on top of a block cursor.
   */
  private measureGlyphAt(
    caret: Range,
    fontSize: number,
  ): {
    width: number;
    onChar: boolean;
    before: boolean;
    cover: { text: string; rect: DOMRect; font: GlyphFont } | null;
  } {
    const fallback = fontSize * CHAR_WIDTH_RATIO;
    const node = caret.startContainer;
    const offset = caret.startOffset;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';

      // 1. Character after the caret.
      if (offset < text.length) {
        const m = this.measureCodePoint(node, offset, text, +1);
        if (m) return { width: m.rect.width, onChar: true, before: false, cover: m };
      }

      // 2. Character before the caret.
      if (offset > 0) {
        const m = this.measureCodePoint(node, offset, text, -1);
        if (m) return { width: m.rect.width, onChar: true, before: true, cover: m };
      }
    }

    return { width: fallback, onChar: false, before: false, cover: null };
  }

  /**
   * Measure the code point adjacent to `offset` in `text`: its bounding
   * rect, the character string, and the computed font of its container
   * (so it can be re-rendered identically by the inverted-glyph overlay).
   *
   * @param dir +1 = the character starting at `offset` (after the caret),
   *            -1 = the character ending at `offset` (before the caret).
   */
  private measureCodePoint(
    node: Node,
    offset: number,
    text: string,
    dir: 1 | -1,
  ): { text: string; rect: DOMRect; font: GlyphFont } | null {
    try {
      const r = document.createRange();
      let start: number;
      let end: number;
      if (dir === 1) {
        const cp = text.codePointAt(offset);
        const len = cp !== undefined && cp > 0xffff ? 2 : 1;
        start = offset;
        end = Math.min(offset + len, text.length);
      } else {
        const prev = text.codePointAt(offset - 2);
        const isPair = offset >= 2 && prev !== undefined && prev > 0xffff;
        start = offset - (isPair ? 2 : 1);
        end = offset;
      }
      r.setStart(node, start);
      r.setEnd(node, end);
      const rect = r.getBoundingClientRect();
      if (rect.width <= 0.5) return null;

      const parent =
        node.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : node.parentElement;
      const cs = parent ? getComputedStyle(parent) : null;
      // Capture longhand font properties — NOT the `font` shorthand.  The
      // shorthand is invalid (and silently ignored, falling back to the
      // browser default 16px) whenever font-variant is something CSS won't
      // accept in the shorthand, which made the inverted glyph shrink.
      const fontStyle: GlyphFont = {
        fontStyle: cs?.fontStyle ?? 'normal',
        fontWeight: cs?.fontWeight ?? 'normal',
        fontSize: cs?.fontSize ?? '16px',
        fontFamily: cs?.fontFamily ?? 'inherit',
        letterSpacing: cs?.letterSpacing ?? 'normal',
      };

      return { text: text.slice(start, end), rect, font: fontStyle };
    } catch {
      return null;
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
   * Read the computed CSS line-height (px) of the element containing the
   * caret.
   *
   * We MUST read the real line-height from CSS rather than relying on
   * `range.getBoundingClientRect().height`, because the latter is
   * unreliable for collapsed caret ranges — especially inside `<pre>` blocks
   * with `white-space: pre` on WebKit/WKWebView, where it can return the
   * height of the entire content area instead of a single line box.  This
   * causes the cursor's em-box to be vertically centred within an
   * oversized rectangle, pushing it far below the actual text line (e.g.
   * overlapping the code block's bottom border).
   *
   * @param fontSize  The font-size already resolved by `fontSizeAt()`,
   *                  used as a fallback for the `"normal"` keyword.
   */
  private lineHeightAt(node: Node | null, fontSize: number): number {
    let el: Element | null =
      node && node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node?.parentElement ?? null;
    if (!el || !(el instanceof HTMLElement)) el = this.editorEl;
    if (!el) return fontSize * 1.6;
    const lh = getComputedStyle(el).lineHeight;
    if (lh === 'normal' || lh === '') {
      // "normal" ≈ 1.2 × font-size (CSS specification default).
      return fontSize * 1.2;
    }
    const px = parseFloat(lh);
    if (Number.isFinite(px) && px > 0) return px;
    // Final fallback: assume 1.6 × font-size (matches the app's body text).
    return fontSize * 1.6;
  }

  /**
   * Fallback caret measurement: insert a temporary zero-width span at the
   * caret position and measure its bounding rect.
   *
   * @param lineHeight  Computed CSS line-height (px), passed through from
   *                    the caller so we don't need to re-derive it here.
   */
  private measureCaretViaTempSpan(lineHeight: number): { left: number; right: number; top: number; bottom: number } | null {
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
    return this.toCanvasLocal(rect, fontSize, lineHeight, {
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
   *
   * @param lineHeight  Computed CSS line-height (px).  MUST be passed in
   *                    from the caller (via `lineHeightAt()`) rather than
   *                    derived from `rect.height`, because
   *                    `range.getBoundingClientRect().height` is unreliable
   *                    for collapsed caret ranges — especially inside `<pre>`
   *                    blocks on WebKit/WKWebView, where it can return the
   *                    entire content area height instead of a single line
   *                    box, causing the cursor to be vertically misplaced.
   */
  private toCanvasLocal(
    rect: DOMRect,
    fontSize: number,
    lineHeight: number,
    glyph: {
      width: number;
      onChar: boolean;
      before: boolean;
      cover?: { text: string; rect: DOMRect; font: GlyphFont } | null;
    },
  ): { left: number; right: number; top: number; bottom: number } | null {
    const canvasRect = this.canvas.getBoundingClientRect();
    const caretLeft = rect.left - canvasRect.left;
    const top = rect.top - canvasRect.top;

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
    //
    // IMPORTANT: we use the CSS-computed `lineHeight` (passed in from the
    // caller) instead of `rect.height`.  The latter is the raw
    // getBoundingClientRect() height of the collapsed caret range, which
    // is unreliable on WebKit/WKWebView — especially inside `<pre>` code
    // blocks with `white-space: pre`, where it can span the entire
    // remaining content area.  Using an oversized `lineHeight` here would
    // vertically centre the em-box far below the actual text line,
    // causing the cursor to overlap the code block's bottom border.
    const safeLineHeight = Math.max(lineHeight, 1);
    const emHeight = Math.min(fontSize * GLYPH_HEIGHT_RATIO, safeLineHeight);
    const emTop = top + (safeLineHeight - emHeight) / 2;
    const emBottom = emTop + emHeight;

    // Only the block cursor sits ON TOP of a glyph and hides it.  Capture
    // the covered glyph so the render loop can re-draw it in the inverted
    // colour; clear it for the other styles (and when over empty space).
    if (this.cursorStyle === 'block' && glyph.cover) {
      const c = glyph.cover;
      this.coveredGlyph = {
        text: c.text,
        left: c.rect.left - canvasRect.left,
        top: c.rect.top - canvasRect.top,
        width: c.rect.width,
        height: c.rect.height,
        font: c.font,
      };
    } else {
      this.coveredGlyph = null;
    }

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
        // Horizontal bar resting on the glyph baseline (em-box bottom).
        // Spans the real glyph width when over a character; at empty
        // positions its minimum is ONE full character width (not the
        // half-width used by block) so the underline stays clearly visible.
        const underH = Math.max(fontSize * UNDERLINE_THICKNESS_RATIO, 2);
        const underW = glyph.onChar
          ? glyph.width
          : Math.max(glyph.width, fontSize * CHAR_WIDTH_RATIO);
        trailLeft = left;
        trailRight = left + underW;
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
