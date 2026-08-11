import { firstCodePoint, lastCodePoint, appendSpan } from "./trailMath";
import { CHAR_WIDTH_RATIO, toCanvasLocal } from "./editorCaretUtils";
function syncNativeMirror(input, cs, existingMirror) {
  let m = existingMirror;
  if (!m) {
    m = document.createElement("div");
    m.setAttribute("aria-hidden", "true");
    Object.assign(m.style, {
      position: "fixed",
      visibility: "hidden",
      whiteSpace: "pre",
      pointerEvents: "none",
      margin: "0",
      boxSizing: "content-box",
      zIndex: "-1",
      top: "0",
      left: "0"
    });
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
  m.style.borderStyle = "solid";
  m.style.top = `${r.top}px`;
  m.style.left = `${r.left}px`;
  if (input instanceof HTMLTextAreaElement) {
    const borderX = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
    const borderY = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    m.style.boxSizing = "border-box";
    m.style.width = `${input.clientWidth + borderX}px`;
    m.style.height = `${input.clientHeight + borderY}px`;
    m.style.whiteSpace = cs.whiteSpace || "pre-wrap";
    m.style.overflow = "hidden";
    m.style.overflowWrap = cs.overflowWrap;
    m.style.wordBreak = cs.wordBreak;
    m.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
  } else {
    m.style.width = "max-content";
    m.style.height = "auto";
    m.style.whiteSpace = "pre";
    m.style.overflow = "visible";
    m.style.overflowWrap = "normal";
    m.style.wordBreak = "normal";
    m.style.transform = `translateX(${-input.scrollLeft}px)`;
  }
  return m;
}
function measureNativeCaretRect(input, metricsAt, canvas, cursorStyle, cssW, cssH, existingMirror) {
  const selStart = input.selectionStart;
  const selEnd = input.selectionEnd;
  if (selStart == null || selEnd == null || selStart !== selEnd) {
    return { rect: null, coveredGlyph: null, mirror: existingMirror };
  }
  const caret = selStart;
  const value = input.value;
  const cs = getComputedStyle(input);
  const { fontSize, lineHeight } = metricsAt(input);
  const before = value.slice(0, caret);
  const after = value.slice(caret);
  const rawAfterCp = firstCodePoint(after);
  const rawBeforeCp = lastCodePoint(before);
  const afterCp = rawAfterCp === "\n" || rawAfterCp === "\r" ? "" : rawAfterCp;
  const beforeCp = rawBeforeCp === "\n" || rawBeforeCp === "\r" ? "" : rawBeforeCp;
  const beforeHead = before.slice(0, before.length - beforeCp.length);
  const afterTail = after.slice(afterCp.length);
  const mirror = syncNativeMirror(input, cs, existingMirror);
  mirror.textContent = "";
  if (beforeHead) mirror.appendChild(document.createTextNode(beforeHead));
  const beforeSpan = beforeCp ? appendSpan(mirror, beforeCp) : null;
  const marker = appendSpan(mirror, "\u200B");
  const afterSpan = afterCp ? appendSpan(mirror, afterCp) : null;
  if (afterTail) mirror.appendChild(document.createTextNode(afterTail));
  const markerRect = marker.getBoundingClientRect();
  const r = input.getBoundingClientRect();
  if (markerRect.left < r.left || markerRect.left > r.right || markerRect.top < r.top || markerRect.top > r.bottom) {
    return { rect: null, coveredGlyph: null, mirror };
  }
  let lineTop;
  if (input instanceof HTMLTextAreaElement) {
    lineTop = markerRect.top;
  } else {
    const borderTop = parseFloat(cs.borderTopWidth) || 0;
    const paddingTop = parseFloat(cs.paddingTop) || 0;
    const paddingBottom = parseFloat(cs.paddingBottom) || 0;
    const borderBottom = parseFloat(cs.borderBottomWidth) || 0;
    const contentTop = r.top + borderTop + paddingTop;
    const contentH = r.height - borderTop - paddingTop - paddingBottom - borderBottom;
    lineTop = contentTop + Math.max(0, (contentH - lineHeight) / 2);
  }
  const mkRect = (left, width) => ({
    left,
    right: left + width,
    top: lineTop,
    bottom: lineTop + lineHeight,
    width,
    height: lineHeight,
    x: left,
    y: lineTop,
    toJSON: () => ({})
  });
  const caretRect = mkRect(markerRect.left, 0);
  const font = {
    fontStyle: cs.fontStyle,
    fontWeight: cs.fontWeight,
    fontSize: cs.fontSize,
    fontFamily: cs.fontFamily,
    letterSpacing: cs.letterSpacing
  };
  let glyph;
  if (afterSpan) {
    const cr = afterSpan.getBoundingClientRect();
    glyph = {
      width: cr.width,
      onChar: true,
      before: false,
      cover: { text: afterCp, rect: mkRect(cr.left, cr.width), font }
    };
  } else if (beforeSpan) {
    const cr = beforeSpan.getBoundingClientRect();
    glyph = {
      width: cr.width,
      onChar: true,
      before: true,
      cover: { text: beforeCp, rect: mkRect(cr.left, cr.width), font }
    };
  } else {
    glyph = {
      width: fontSize * CHAR_WIDTH_RATIO,
      onChar: false,
      before: false,
      cover: null
    };
  }
  const result = toCanvasLocal(caretRect, fontSize, lineHeight, glyph, canvas, cursorStyle, cssW, cssH);
  return { rect: result.rect, coveredGlyph: result.coveredGlyph, mirror };
}
export {
  measureNativeCaretRect,
  syncNativeMirror
};
