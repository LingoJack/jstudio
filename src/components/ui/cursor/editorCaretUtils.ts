/**
 * Pure DOM utility functions for editor caret measurement.
 *
 * These functions do NOT access `this` - everything is passed as parameters.
 * The `metricsAt` callback pattern is used for the cached per-element font
 * metrics lookup (see {@link MetricsAtFn}).
 */

import type { EditorCursorStyle } from '../../../types/settings';
import type {
  CanvasLocalResult,
  CoveredGlyph,
  GlyphFont,
  MeasuredGlyph,
  MetricsAtFn,
} from './editorCursorTrailTypes';

// ── Caret geometry ───────────────────────────────────────────────────
const UNDERLINE_THICKNESS_RATIO = 0.15;
const BAR_THICKNESS_RATIO = 0.12;
/** Fallback character width (× font-size) when no glyph sits at the caret
 *  - e.g. end of line or empty paragraph.  The cursor then uses HALF of
 *  this, per the "no character -> 1/2 width" rule. */
export const CHAR_WIDTH_RATIO = 0.6;
const CARET_BAR_WIDTH_PX = 2;
/** Caret body height relative to font-size (a touch taller than the glyph
 *  so it visually matches the text, centred within the line box). */
const GLYPH_HEIGHT_RATIO = 1.15;

// ── Text node traversal helpers ──────────────────────────────────────

export function firstTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const text = firstTextNode(child);
    if (text) return text;
  }
  return null;
}

export function lastTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  for (let child = node.lastChild; child; child = child.previousSibling) {
    const text = lastTextNode(child);
    if (text) return text;
  }
  return null;
}

export function nextTextNode(node: Node, root: Node): Text | null {
  let current: Node | null = node;
  while (current && current !== root) {
    for (let sibling = current.nextSibling; sibling; sibling = sibling.nextSibling) {
      const text = firstTextNode(sibling);
      if (text) return text;
    }
    current = current.parentNode;
  }
  return null;
}

export function previousTextNode(node: Node, root: Node): Text | null {
  let current: Node | null = node;
  while (current && current !== root) {
    for (let sibling = current.previousSibling; sibling; sibling = sibling.previousSibling) {
      const text = lastTextNode(sibling);
      if (text) return text;
    }
    current = current.parentNode;
  }
  return null;
}

/** Find the nearest text position without crossing a visual line break. */
export function findAdjacentTextPosition(
  caret: Range,
  dir: 1 | -1,
  root: Node | null,
): { node: Text; offset: number } | null {
  const container = caret.startContainer;
  if (!root) return null;

  const scan = (node: Text, from: number): { node: Text; offset: number } | null => {
    const text = node.data;
    if (dir === 1) {
      for (let i = from; i < text.length; i++) {
        if (text[i] === '\n' || text[i] === '\r') return null;
        return { node, offset: i };
      }
    } else {
      for (let i = from - 1; i >= 0; i--) {
        if (text[i] === '\n' || text[i] === '\r') return null;
        return { node, offset: i + 1 };
      }
    }
    return null;
  };

  if (container.nodeType === Node.TEXT_NODE) {
    const current = scan(container as Text, caret.startOffset);
    if (current) return current;
    const text = (container as Text).data;
    const boundaryChar = dir === 1 ? text[caret.startOffset] : text[caret.startOffset - 1];
    if (boundaryChar === '\n' || boundaryChar === '\r') return null;
  }

  let adjacent: Text | null = null;
  if (container.nodeType === Node.ELEMENT_NODE) {
    const children = container.childNodes;
    if (dir === 1) {
      for (let i = caret.startOffset; i < children.length && !adjacent; i++) {
        adjacent = firstTextNode(children[i]);
      }
    } else {
      for (let i = caret.startOffset - 1; i >= 0 && !adjacent; i--) {
        adjacent = lastTextNode(children[i]);
      }
    }
  }

  if (!adjacent) {
    adjacent = dir === 1
      ? nextTextNode(container, root)
      : previousTextNode(container, root);
  }

  while (adjacent) {
    const found = scan(adjacent, dir === 1 ? 0 : adjacent.data.length);
    if (found) return found;
    if (adjacent.data.includes('\n') || adjacent.data.includes('\r')) return null;
    adjacent = dir === 1
      ? nextTextNode(adjacent, root)
      : previousTextNode(adjacent, root);
  }
  return null;
}

/**
 * Measure the code point adjacent to `offset` in `text`: its bounding
 * rect, the character string, and the computed font of its container
 * (so it can be re-rendered identically by the inverted-glyph overlay).
 *
 * @param dir +1 = the character starting at `offset` (after the caret),
 *            -1 = the character ending at `offset` (before the caret).
 */
export function measureCodePoint(
  node: Node,
  offset: number,
  text: string,
  dir: 1 | -1,
  metricsAt: MetricsAtFn,
  cursorStyle: EditorCursorStyle,
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

    // Use getClientRects() instead of getBoundingClientRect() - the same
    // WebKit/WKWebView multi-line bug that affects collapsed ranges (see
    // measureCaretRect) also affects non-collapsed ranges inside multi-
    // line text nodes (e.g. <pre> code blocks with white-space: pre).
    // getBoundingClientRect() returns the union of ALL line boxes, making
    // rect.width = width of the WIDEST line instead of the single char.
    // getClientRects() returns per-line boxes; a single character lives on
    // exactly one line, so we get its true advance width.
    const rects = r.getClientRects();
    let rect: DOMRect;
    if (rects.length > 0) {
      rect = rects[rects.length - 1];
    } else {
      rect = r.getBoundingClientRect();
    }

    // ── Width sanity cap ──
    // A single code point's advance width should never exceed roughly
    // 2× the font-size (CJK and emoji glyphs are at most ~1em wide; even
    // generous tab stops don't exceed this for a single character).  When
    // getClientRects() is empty and we fall back to getBoundingClientRect()
    // on a multi-line text node, WebKit returns the union of all line
    // boxes - which can be hundreds of pixels wide (the widest line),
    // making the cursor explode.  Cap it here as a last line of defence.
    const parent =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement;
    // Use the cached metrics for the cap - no fresh getComputedStyle().
    const fs = metricsAt(parent).fontSize;
    const maxGlyphWidth = Math.max(fs * 2, 32); // never less than 32px floor
    if (rect.width > maxGlyphWidth) return null;
    if (rect.width <= 0.5) return null;

    // The longhand font properties are ONLY consumed when a `block` cursor
    // re-draws the covered glyph (see toCanvasLocal -> syncGlyphOverlay).
    // For `bar` / `underline` the `cover` field is never read, so we skip
    // the expensive getComputedStyle() entirely and return a placeholder
    // font.  This keeps per-keystroke measurement cheap in the common case
    // while leaving the block-cursor inversion pixel-identical.
    let fontStyle: GlyphFont;
    if (cursorStyle === 'block') {
      // Capture longhand font properties - NOT the `font` shorthand.  The
      // shorthand is invalid (and silently ignored, falling back to the
      // browser default 16px) whenever font-variant is something CSS won't
      // accept in the shorthand, which made the inverted glyph shrink.
      const cs = parent ? getComputedStyle(parent) : null;
      fontStyle = {
        fontStyle: cs?.fontStyle ?? 'normal',
        fontWeight: cs?.fontWeight ?? 'normal',
        fontSize: cs?.fontSize ?? '16px',
        fontFamily: cs?.fontFamily ?? 'inherit',
        letterSpacing: cs?.letterSpacing ?? 'normal',
      };
    } else {
      fontStyle = {
        fontStyle: 'normal',
        fontWeight: 'normal',
        fontSize: `${fs}px`,
        fontFamily: 'inherit',
        letterSpacing: 'normal',
      };
    }

    return { text: text.slice(start, end), rect, font: fontStyle };
  } catch {
    return null;
  }
}

/**
 * Measure the glyph the caret is anchored to.
 *
 * Preference order:
 *   1. Character *after* the caret (the one you'd overtype) -> anchor to
 *      the right of the caret.
 *   2. If nothing follows (end of line / end of text), the character
 *      *before* the caret (the one the caret visually sits under, e.g.
 *      a Chinese glyph you just typed) -> anchor to the left.
 *   3. Neither -> half-width fallback.
 *
 * Returning the real advance width makes the cursor match CJK / wide /
 * narrow glyphs exactly; `before` tells the caller which side of the
 * caret the glyph occupies so it can position the cursor over it.  When
 * a real glyph is found, `cover` carries everything needed to re-draw it
 * in the inverted colour on top of a block cursor.
 */
export function measureGlyphAt(
  caret: Range,
  fontSize: number,
  root: Node | null,
  metricsAt: MetricsAtFn,
  cursorStyle: EditorCursorStyle,
): MeasuredGlyph {
  const fallback = fontSize * CHAR_WIDTH_RATIO;

  const after = findAdjacentTextPosition(caret, +1, root);
  if (after) {
    const text = after.node.textContent ?? '';
    const measured = measureCodePoint(after.node, after.offset, text, +1, metricsAt, cursorStyle);
    if (measured) {
      return { width: measured.rect.width, onChar: true, before: false, cover: measured };
    }
  }

  const before = findAdjacentTextPosition(caret, -1, root);
  if (before) {
    const text = before.node.textContent ?? '';
    const measured = measureCodePoint(before.node, before.offset, text, -1, metricsAt, cursorStyle);
    if (measured) {
      return { width: measured.rect.width, onChar: true, before: true, cover: measured };
    }
  }

  return { width: fallback, onChar: false, before: false, cover: null };
}

/**
 * Clip a ProseMirror-resolved caret to a nested code block viewport.
 * coordsAtPos already accounts for line layout and scroll offsets; the only
 * remaining special handling is clipping because the shared WebGL canvas is
 * not a descendant of the scrollable <pre>.
 */
export function clipPreCaretRect(rect: DOMRect, range: Range): DOMRect | null {
  let node: Node | null =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
  let preEl: HTMLPreElement | null = null;
  while (node) {
    if (node.nodeName === 'PRE') {
      preEl = node as HTMLPreElement;
      break;
    }
    node = node.parentElement;
  }
  if (!preEl) return rect;

  const preRect = preEl.getBoundingClientRect();
  if (
    rect.bottom <= preRect.top ||
    rect.top >= preRect.bottom ||
    rect.left < preRect.left ||
    rect.left > preRect.right
  ) {
    return null;
  }
  return rect;
}

/**
 * Convert a screen-space DOMRect to overlay-canvas-local coordinates,
 * shaping the cursor to match the glyph at the caret.
 *
 * Width rule (per the spec):
 *   - caret sits ON a character -> use that glyph's real advance width
 *     (so CJK / wide / narrow chars all match exactly);
 *   - caret NOT on a character (end of line, empty block) -> half width.
 * Height is always the glyph's em-box height.  Position is anchored at
 * the caret's left edge, which is the glyph's left edge.
 *
 * @param lineHeight  Computed CSS line-height (px).  MUST be passed in
 *                    from the caller (via `metricsAt()`) rather than
 *                    derived from `rect.height`, because
 *                    `range.getBoundingClientRect().height` is unreliable
 *                    for collapsed caret ranges - especially inside `<pre>`
 *                    blocks on WebKit/WKWebView, where it can return the
 *                    entire content area height instead of a single line
 *                    box, causing the cursor to be vertically misplaced.
 */
export function toCanvasLocal(
  rect: DOMRect,
  fontSize: number,
  lineHeight: number,
  glyph: MeasuredGlyph,
  canvas: HTMLCanvasElement,
  cursorStyle: EditorCursorStyle,
  cssW: number,
  cssH: number,
): CanvasLocalResult {
  const canvasRect = canvas.getBoundingClientRect();
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
  // is unreliable on WebKit/WKWebView - especially inside `<pre>` code
  // blocks with `white-space: pre`, where it can span the entire
  // remaining content area.  Using an oversized `lineHeight` here would
  // vertically centre the em-box far below the actual text line,
  // causing the cursor to overlap the code block's bottom border.
  // ── Vertical positioning ──
  //
  // Centre the em-box within the ACTUAL caret rect, not within the CSS
  // line-height.  On WebKit/WKWebView the collapsed caret rect from
  // getClientRects() covers only the typographic text area (ascent +
  // descent ≈ fontSize × 1.2), whose top is already below the line-box
  // top by half the leading.  Centring within the CSS line-height on top
  // of that adds the half-leading offset a SECOND time, pushing the
  // cursor visibly below the text glyphs.
  //
  // ProseMirror coordsAtPos returns the actual line box. The safety cap
  // still protects the Range fallback from a multi-line WebKit rect.
  const safeLineHeight = Math.max(lineHeight, 1);
  const boxHeight =
    rect.height > 0 && rect.height <= safeLineHeight * 1.5
      ? rect.height
      : safeLineHeight;
  const emHeight = Math.min(fontSize * GLYPH_HEIGHT_RATIO, boxHeight);
  const emTop = top + (boxHeight - emHeight) / 2;
  const emBottom = emTop + emHeight;

  // Only the block cursor sits ON TOP of a glyph and hides it.  Capture
  // the covered glyph so the render loop can re-draw it in the inverted
  // colour; clear it for the other styles (and when over empty space).
  let coveredGlyph: CoveredGlyph | null = null;
  if (cursorStyle === 'block' && glyph.cover) {
    const c = glyph.cover;
    coveredGlyph = {
      text: c.text,
      left: c.rect.left - canvasRect.left,
      top: c.rect.top - canvasRect.top,
      width: c.rect.width,
      height: c.rect.height,
      font: c.font,
    };
  }

  let trailLeft: number;
  let trailRight: number;
  let trailTop: number;
  let trailBottom: number;

  switch (cursorStyle) {
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
      // Thin vertical bar spanning the glyph height - always at the
      // caret itself, never offset to a neighbouring glyph.
      const barW = Math.max(cellWidth * BAR_THICKNESS_RATIO, CARET_BAR_WIDTH_PX);
      trailLeft = caretLeft;
      trailRight = caretLeft + barW;
      trailTop = emTop;
      trailBottom = emBottom;
      break;
    }
  }

  const culled =
    trailRight < 0 || trailLeft > cssW || trailBottom < 0 || trailTop > cssH;
  if (culled) return { rect: null, coveredGlyph };

  return { rect: { left: trailLeft, right: trailRight, top: trailTop, bottom: trailBottom }, coveredGlyph };
}

/**
 * Fallback caret measurement: insert a temporary zero-width span at the
 * caret position and measure its bounding rect.
 *
 * @param lineHeight  Computed CSS line-height (px), passed through from
 *                    the caller so we don't need to re-derive it here.
 */
export function measureCaretViaTempSpan(
  lineHeight: number,
  metricsAt: MetricsAtFn,
  canvas: HTMLCanvasElement,
  cursorStyle: EditorCursorStyle,
  cssW: number,
  cssH: number,
): CanvasLocalResult {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { rect: null, coveredGlyph: null };

  const range = sel.getRangeAt(0);
  const span = document.createElement('span');
  span.textContent = '\u200b';
  span.style.display = 'inline-block';

  const clonedRange = range.cloneRange();
  clonedRange.insertNode(span);

  const rawRect = span.getBoundingClientRect();
  const parent = span.parentNode;
  const fontSize = metricsAt(parent).fontSize;
  if (parent) parent.removeChild(span);

  sel.removeAllRanges();
  sel.addRange(range);

  if (rawRect.width === 0 && rawRect.height === 0) return { rect: null, coveredGlyph: null };

  // The shared canvas must explicitly clip nested scrollable code blocks.
  const rect = clipPreCaretRect(rawRect, range);
  // null = caret scrolled out of a code block's visible band -> hide.
  if (!rect) return { rect: null, coveredGlyph: null };

  // The temp-span path only triggers at empty positions (no glyph),
  // so there is no character under the caret -> half-width fallback.
  return toCanvasLocal(rect, fontSize, lineHeight, {
    width: fontSize * CHAR_WIDTH_RATIO,
    onChar: false,
    before: false,
  }, canvas, cursorStyle, cssW, cssH);
}
