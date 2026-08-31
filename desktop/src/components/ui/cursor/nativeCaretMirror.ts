/**
 * Native input/textarea caret measurement via an off-screen layout mirror.
 *
 * The browser does not expose the pixel position of the caret inside an
 * `<input>` or `<textarea>`.  To get it we build a hidden `<div>` that
 * mirrors the control's font, padding, border, width and scroll offset,
 * inject a zero-width marker span at the caret offset, and read its
 * `getBoundingClientRect()`.
 */

import type { EditorCursorStyle } from '../../../types/settings';
import type { NativeCaretHost } from '../../editor/CursorTrailContext';
import type {
  CanvasLocalResult,
  CoveredGlyph,
  GlyphFont,
  MetricsAtFn,
} from './editorCursorTrailTypes';
import { firstCodePoint, lastCodePoint, appendSpan } from './trailMath';
import { CHAR_WIDTH_RATIO, toCanvasLocal } from './editorCaretUtils';

/** Result of native caret measurement (includes the mirror for reuse). */
export interface NativeCaretResult {
  rect: { left: number; right: number; top: number; bottom: number } | null;
  coveredGlyph: CoveredGlyph | null;
  mirror: HTMLDivElement | null;
}

/**
 * Create or update the hidden mirror div for an input or textarea.
 *
 * @param input           The native text control.
 * @param cs              Pre-fetched computed style of `input`.
 * @param existingMirror  A previously created mirror, or `null` to create one.
 * @returns The mirror div (same instance as `existingMirror` when non-null).
 */
export function syncNativeMirror(
  input: NativeCaretHost,
  cs: CSSStyleDeclaration,
  existingMirror: HTMLDivElement | null,
): HTMLDivElement {
  let m = existingMirror;
  if (!m) {
    m = document.createElement('div');
    m.setAttribute('aria-hidden', 'true');
    Object.assign(m.style, {
      position: 'fixed',
      visibility: 'hidden',
      whiteSpace: 'pre',
      pointerEvents: 'none',
      margin: '0',
      boxSizing: 'content-box',
      zIndex: '-1',
      top: '0',
      left: '0',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(m);
  }
  const r = input.getBoundingClientRect();
  m.style.fontStyle = cs.fontStyle;
  m.style.fontWeight = cs.fontWeight;
  m.style.fontSize = cs.fontSize;
  m.style.fontFamily = cs.fontFamily;
  m.style.lineHeight = cs.lineHeight;
  m.style.letterSpacing = cs.letterSpacing;
  m.style.textTransform = cs.textTransform;
  m.style.fontVariant = cs.fontVariant;
  m.style.boxSizing = cs.boxSizing;
  m.style.paddingTop = cs.paddingTop;
  m.style.paddingRight = cs.paddingRight;
  m.style.paddingBottom = cs.paddingBottom;
  m.style.paddingLeft = cs.paddingLeft;
  m.style.borderTopWidth = cs.borderTopWidth;
  m.style.borderRightWidth = cs.borderRightWidth;
  m.style.borderBottomWidth = cs.borderBottomWidth;
  m.style.borderLeftWidth = cs.borderLeftWidth;
  m.style.borderStyle = 'solid';
  m.style.top = `${r.top}px`;
  m.style.left = `${r.left}px`;

  if (input instanceof HTMLTextAreaElement) {
    // Match the textarea's scrollable client box, excluding any native
    // scrollbar gutter. Force border-box so this remains correct whether
    // the original control uses content-box or border-box sizing.
    const borderX = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
    const borderY = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    m.style.boxSizing = 'border-box';
    m.style.width = `${input.clientWidth + borderX}px`;
    m.style.height = `${input.clientHeight + borderY}px`;
    m.style.whiteSpace = cs.whiteSpace || 'pre-wrap';
    m.style.overflow = 'hidden';
    m.style.overflowWrap = cs.overflowWrap;
    m.style.wordBreak = cs.wordBreak;
    m.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
  } else {
    m.style.width = 'max-content';
    m.style.height = 'auto';
    m.style.whiteSpace = 'pre';
    m.style.overflow = 'visible';
    m.style.overflowWrap = 'normal';
    m.style.wordBreak = 'normal';
    m.style.transform = `translateX(${-input.scrollLeft}px)`;
  }
  return m;
}

/**
 * Measure an input/textarea caret via an off-screen layout mirror.
 *
 * @param input           The native text control.
 * @param metricsAt       Cached per-element font-metrics callback.
 * @param canvas          The overlay canvas (for coordinate conversion).
 * @param cursorStyle     Current cursor shape (bar / block / underline).
 * @param cssW            Canvas CSS width (for culling).
 * @param cssH            Canvas CSS height (for culling).
 * @param existingMirror  A previously created mirror div, or `null`.
 */
export function measureNativeCaretRect(
  input: NativeCaretHost,
  metricsAt: MetricsAtFn,
  canvas: HTMLCanvasElement,
  cursorStyle: EditorCursorStyle,
  cssW: number,
  cssH: number,
  existingMirror: HTMLDivElement | null,
): NativeCaretResult {
  const selStart = input.selectionStart;
  const selEnd = input.selectionEnd;
  // Hide on a range selection (mirrors the editor's collapsed-caret-only rule).
  if (selStart == null || selEnd == null || selStart !== selEnd) {
    return { rect: null, coveredGlyph: null, mirror: existingMirror };
  }

  const caret = selStart;
  const value = input.value;
  const cs = getComputedStyle(input);
  const { fontSize, lineHeight } = metricsAt(input);

  // Isolate the code points immediately before / after the caret so we can
  // measure their advance widths (needed for block / underline shaping).
  const before = value.slice(0, caret);
  const after = value.slice(caret);
  const rawAfterCp = firstCodePoint(after);
  const rawBeforeCp = lastCodePoint(before);
  const afterCp = rawAfterCp === '\n' || rawAfterCp === '\r' ? '' : rawAfterCp;
  const beforeCp = rawBeforeCp === '\n' || rawBeforeCp === '\r' ? '' : rawBeforeCp;
  const beforeHead = before.slice(0, before.length - beforeCp.length);
  const afterTail = after.slice(afterCp.length);

  // Build the mirror: [beforeHead][beforeSpan][marker][afterSpan][afterTail].
  const mirror = syncNativeMirror(input, cs, existingMirror);
  mirror.textContent = '';
  if (beforeHead) mirror.appendChild(document.createTextNode(beforeHead));
  const beforeSpan = beforeCp ? appendSpan(mirror, beforeCp) : null;
  const marker = appendSpan(mirror, '\u200b');
  const afterSpan = afterCp ? appendSpan(mirror, afterCp) : null;
  if (afterTail) mirror.appendChild(document.createTextNode(afterTail));

  const markerRect = marker.getBoundingClientRect();
  const r = input.getBoundingClientRect();
  if (
    markerRect.left < r.left ||
    markerRect.left > r.right ||
    markerRect.top < r.top ||
    markerRect.top > r.bottom
  ) {
    return { rect: null, coveredGlyph: null, mirror };
  }


  let lineTop: number;
  if (input instanceof HTMLTextAreaElement) {
    // The mirror reproduces textarea wrapping and scroll offsets, so its
    // marker already identifies the correct visual line.
    lineTop = markerRect.top;
  } else {
    // Native single-line inputs vertically centre their text inside the
    // content box; a normal div mirror does not.
    const borderTop = parseFloat(cs.borderTopWidth) || 0;
    const paddingTop = parseFloat(cs.paddingTop) || 0;
    const paddingBottom = parseFloat(cs.paddingBottom) || 0;
    const borderBottom = parseFloat(cs.borderBottomWidth) || 0;
    const contentTop = r.top + borderTop + paddingTop;
    const contentH = r.height - borderTop - paddingTop - paddingBottom - borderBottom;
    lineTop = contentTop + Math.max(0, (contentH - lineHeight) / 2);
  }

  // Build a DOMRect-like with the mirror's X but the recomputed Y band.
  const mkRect = (left: number, width: number): DOMRect =>
    ({
      left,
      right: left + width,
      top: lineTop,
      bottom: lineTop + lineHeight,
      width,
      height: lineHeight,
      x: left,
      y: lineTop,
      toJSON: () => ({}),
    }) as DOMRect;

  const caretRect = mkRect(markerRect.left, 0);

  const font: GlyphFont = {
    fontStyle: cs.fontStyle,
    fontWeight: cs.fontWeight,
    fontSize: cs.fontSize,
    fontFamily: cs.fontFamily,
    letterSpacing: cs.letterSpacing,
  };

  let glyph: {
    width: number;
    onChar: boolean;
    before: boolean;
    cover: { text: string; rect: DOMRect; font: GlyphFont } | null;
  };
  if (afterSpan) {
    // Caret sits ON the character after it (overtype target).
    const cr = afterSpan.getBoundingClientRect();
    glyph = {
      width: cr.width,
      onChar: true,
      before: false,
      cover: { text: afterCp, rect: mkRect(cr.left, cr.width), font },
    };
  } else if (beforeSpan) {
    // End of text - anchor to the character before the caret.
    const cr = beforeSpan.getBoundingClientRect();
    glyph = {
      width: cr.width,
      onChar: true,
      before: true,
      cover: { text: beforeCp, rect: mkRect(cr.left, cr.width), font },
    };
  } else {
    // Empty title - half-width fallback, no covered glyph.
    glyph = {
      width: fontSize * CHAR_WIDTH_RATIO,
      onChar: false,
      before: false,
      cover: null,
    };
  }

  const result: CanvasLocalResult = toCanvasLocal(caretRect, fontSize, lineHeight, glyph, canvas, cursorStyle, cssW, cssH);
  return { rect: result.rect, coveredGlyph: result.coveredGlyph, mirror };
}
