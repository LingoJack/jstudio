const UNDERLINE_THICKNESS_RATIO = 0.15;
const BAR_THICKNESS_RATIO = 0.12;
const CHAR_WIDTH_RATIO = 0.6;
const CARET_BAR_WIDTH_PX = 2;
const GLYPH_HEIGHT_RATIO = 1.15;
function firstTextNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const text = firstTextNode(child);
    if (text) return text;
  }
  return null;
}
function lastTextNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node;
  for (let child = node.lastChild; child; child = child.previousSibling) {
    const text = lastTextNode(child);
    if (text) return text;
  }
  return null;
}
function nextTextNode(node, root) {
  let current = node;
  while (current && current !== root) {
    for (let sibling = current.nextSibling; sibling; sibling = sibling.nextSibling) {
      const text = firstTextNode(sibling);
      if (text) return text;
    }
    current = current.parentNode;
  }
  return null;
}
function previousTextNode(node, root) {
  let current = node;
  while (current && current !== root) {
    for (let sibling = current.previousSibling; sibling; sibling = sibling.previousSibling) {
      const text = lastTextNode(sibling);
      if (text) return text;
    }
    current = current.parentNode;
  }
  return null;
}
function findAdjacentTextPosition(caret, dir, root) {
  const container = caret.startContainer;
  if (!root) return null;
  const scan = (node, from) => {
    const text = node.data;
    if (dir === 1) {
      for (let i = from; i < text.length; i++) {
        if (text[i] === "\n" || text[i] === "\r") return null;
        return { node, offset: i };
      }
    } else {
      for (let i = from - 1; i >= 0; i--) {
        if (text[i] === "\n" || text[i] === "\r") return null;
        return { node, offset: i + 1 };
      }
    }
    return null;
  };
  if (container.nodeType === Node.TEXT_NODE) {
    const current = scan(container, caret.startOffset);
    if (current) return current;
    const text = container.data;
    const boundaryChar = dir === 1 ? text[caret.startOffset] : text[caret.startOffset - 1];
    if (boundaryChar === "\n" || boundaryChar === "\r") return null;
  }
  let adjacent = null;
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
    adjacent = dir === 1 ? nextTextNode(container, root) : previousTextNode(container, root);
  }
  while (adjacent) {
    const found = scan(adjacent, dir === 1 ? 0 : adjacent.data.length);
    if (found) return found;
    if (adjacent.data.includes("\n") || adjacent.data.includes("\r")) return null;
    adjacent = dir === 1 ? nextTextNode(adjacent, root) : previousTextNode(adjacent, root);
  }
  return null;
}
function measureCodePoint(node, offset, text, dir, metricsAt, cursorStyle) {
  try {
    const r = document.createRange();
    let start;
    let end;
    if (dir === 1) {
      const cp = text.codePointAt(offset);
      const len = cp !== void 0 && cp > 65535 ? 2 : 1;
      start = offset;
      end = Math.min(offset + len, text.length);
    } else {
      const prev = text.codePointAt(offset - 2);
      const isPair = offset >= 2 && prev !== void 0 && prev > 65535;
      start = offset - (isPair ? 2 : 1);
      end = offset;
    }
    r.setStart(node, start);
    r.setEnd(node, end);
    const rects = r.getClientRects();
    let rect;
    if (rects.length > 0) {
      rect = rects[rects.length - 1];
    } else {
      rect = r.getBoundingClientRect();
    }
    const parent = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const fs = metricsAt(parent).fontSize;
    const maxGlyphWidth = Math.max(fs * 2, 32);
    if (rect.width > maxGlyphWidth) return null;
    if (rect.width <= 0.5) return null;
    let fontStyle;
    if (cursorStyle === "block") {
      const cs = parent ? getComputedStyle(parent) : null;
      fontStyle = {
        fontStyle: cs?.fontStyle ?? "normal",
        fontWeight: cs?.fontWeight ?? "normal",
        fontSize: cs?.fontSize ?? "16px",
        fontFamily: cs?.fontFamily ?? "inherit",
        letterSpacing: cs?.letterSpacing ?? "normal"
      };
    } else {
      fontStyle = {
        fontStyle: "normal",
        fontWeight: "normal",
        fontSize: `${fs}px`,
        fontFamily: "inherit",
        letterSpacing: "normal"
      };
    }
    return { text: text.slice(start, end), rect, font: fontStyle };
  } catch {
    return null;
  }
}
function measureGlyphAt(caret, fontSize, root, metricsAt, cursorStyle) {
  const fallback = fontSize * CHAR_WIDTH_RATIO;
  const after = findAdjacentTextPosition(caret, 1, root);
  if (after) {
    const text = after.node.textContent ?? "";
    const measured = measureCodePoint(after.node, after.offset, text, 1, metricsAt, cursorStyle);
    if (measured) {
      return { width: measured.rect.width, onChar: true, before: false, cover: measured };
    }
  }
  const before = findAdjacentTextPosition(caret, -1, root);
  if (before) {
    const text = before.node.textContent ?? "";
    const measured = measureCodePoint(before.node, before.offset, text, -1, metricsAt, cursorStyle);
    if (measured) {
      return { width: measured.rect.width, onChar: true, before: true, cover: measured };
    }
  }
  return { width: fallback, onChar: false, before: false, cover: null };
}
function clipPreCaretRect(rect, range) {
  let node = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
  let preEl = null;
  while (node) {
    if (node.nodeName === "PRE") {
      preEl = node;
      break;
    }
    node = node.parentElement;
  }
  if (!preEl) return rect;
  const preRect = preEl.getBoundingClientRect();
  if (rect.bottom <= preRect.top || rect.top >= preRect.bottom || rect.left < preRect.left || rect.left > preRect.right) {
    return null;
  }
  return rect;
}
function toCanvasLocal(rect, fontSize, lineHeight, glyph, canvas, cursorStyle, cssW, cssH) {
  const canvasRect = canvas.getBoundingClientRect();
  const caretLeft = rect.left - canvasRect.left;
  const top = rect.top - canvasRect.top;
  const cellWidth = Math.max(
    glyph.onChar ? glyph.width : glyph.width * 0.5,
    CARET_BAR_WIDTH_PX
  );
  const left = glyph.before ? caretLeft - cellWidth : caretLeft;
  const safeLineHeight = Math.max(lineHeight, 1);
  const boxHeight = rect.height > 0 && rect.height <= safeLineHeight * 1.5 ? rect.height : safeLineHeight;
  const emHeight = Math.min(fontSize * GLYPH_HEIGHT_RATIO, boxHeight);
  const emTop = top + (boxHeight - emHeight) / 2;
  const emBottom = emTop + emHeight;
  let coveredGlyph = null;
  if (cursorStyle === "block" && glyph.cover) {
    const c = glyph.cover;
    coveredGlyph = {
      text: c.text,
      left: c.rect.left - canvasRect.left,
      top: c.rect.top - canvasRect.top,
      width: c.rect.width,
      height: c.rect.height,
      font: c.font
    };
  }
  let trailLeft;
  let trailRight;
  let trailTop;
  let trailBottom;
  switch (cursorStyle) {
    case "block": {
      trailLeft = left;
      trailRight = left + cellWidth;
      trailTop = emTop;
      trailBottom = emBottom;
      break;
    }
    case "underline": {
      const underH = Math.max(fontSize * UNDERLINE_THICKNESS_RATIO, 2);
      const underW = glyph.onChar ? glyph.width : Math.max(glyph.width, fontSize * CHAR_WIDTH_RATIO);
      trailLeft = left;
      trailRight = left + underW;
      trailBottom = emBottom;
      trailTop = emBottom - underH;
      break;
    }
    case "bar":
    default: {
      const barW = Math.max(cellWidth * BAR_THICKNESS_RATIO, CARET_BAR_WIDTH_PX);
      trailLeft = caretLeft;
      trailRight = caretLeft + barW;
      trailTop = emTop;
      trailBottom = emBottom;
      break;
    }
  }
  const culled = trailRight < 0 || trailLeft > cssW || trailBottom < 0 || trailTop > cssH;
  if (culled) return { rect: null, coveredGlyph };
  return { rect: { left: trailLeft, right: trailRight, top: trailTop, bottom: trailBottom }, coveredGlyph };
}
function measureCaretViaTempSpan(lineHeight, metricsAt, canvas, cursorStyle, cssW, cssH) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { rect: null, coveredGlyph: null };
  const range = sel.getRangeAt(0);
  const span = document.createElement("span");
  span.textContent = "\u200B";
  span.style.display = "inline-block";
  const clonedRange = range.cloneRange();
  clonedRange.insertNode(span);
  const rawRect = span.getBoundingClientRect();
  const parent = span.parentNode;
  const fontSize = metricsAt(parent).fontSize;
  if (parent) parent.removeChild(span);
  sel.removeAllRanges();
  sel.addRange(range);
  if (rawRect.width === 0 && rawRect.height === 0) return { rect: null, coveredGlyph: null };
  const rect = clipPreCaretRect(rawRect, range);
  if (!rect) return { rect: null, coveredGlyph: null };
  return toCanvasLocal(rect, fontSize, lineHeight, {
    width: fontSize * CHAR_WIDTH_RATIO,
    onChar: false,
    before: false
  }, canvas, cursorStyle, cssW, cssH);
}
export {
  CHAR_WIDTH_RATIO,
  clipPreCaretRect,
  findAdjacentTextPosition,
  firstTextNode,
  lastTextNode,
  measureCaretViaTempSpan,
  measureCodePoint,
  measureGlyphAt,
  nextTextNode,
  previousTextNode,
  toCanvasLocal
};
