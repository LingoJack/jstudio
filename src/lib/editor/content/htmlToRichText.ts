/**
 * DOM → RichText[] converter.
 *
 * Walks the child nodes of a `contentEditable` element and produces an array
 * of `RichText` segments, preserving inline annotations (bold, italic, color,
 * links, etc.) without storing any HTML.
 */

import type { RichText, RichTextAnnotations } from '../../../types/richText';

/** A set of block-level tags whose children should be joined with a newline. */
const LINE_BREAK_TAGS = new Set(['BR']);

/**
 * Determine whether the inline style indicates a CSS line-through.
 */
function hasLineThrough(el: HTMLElement): boolean {
  const deco = el.style.textDecoration;
  if (!deco) return false;
  return deco
    .toLowerCase()
    .split(/\s+/)
    .includes('line-through');
}

/**
 * Recursively walk a DOM node, collecting `RichText` segments into `out`.
 *
 * @param node       The DOM node to inspect.
 * @param inherited  Annotations inherited from ancestor elements.
 * @param out        Accumulator array.
 */
function walk(
  node: Node,
  inherited: RichTextAnnotations,
  out: RichText[],
): void {
  // Text node — emit a segment.
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (text.length === 0) return;
    // Shallow-clone inherited so callers don't mutate each other.
    const annotations: RichTextAnnotations = { ...inherited };
    out.push({ text, annotations });
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName;

  // <br> → emit a newline segment.
  if (LINE_BREAK_TAGS.has(tag)) {
    out.push({ text: '\n', annotations: { ...inherited } });
    return;
  }

  // Compute annotations contributed by this element.
  const local: RichTextAnnotations = { ...inherited };
  const lowerTag = tag.toLowerCase();
  switch (lowerTag) {
    case 'b':
    case 'strong':
      local.bold = true;
      break;
    case 'i':
    case 'em':
      local.italic = true;
      break;
    case 'u':
      local.underline = true;
      break;
    case 's':
    case 'strike':
    case 'del':
      local.strikethrough = true;
      break;
    case 'a': {
      const href = el.getAttribute('href');
      if (href) local.href = href;
      break;
    }
    case 'span': {
      const color = el.style.color;
      if (color) local.color = color;
      if (hasLineThrough(el)) local.strikethrough = true;
      const fontWeight = el.style.fontWeight;
      if (fontWeight === 'bold' || fontWeight === '700') local.bold = true;
      const fontStyle = el.style.fontStyle;
      if (fontStyle === 'italic') local.italic = true;
      // Class-based annotations (e.g. <span class="rt-bold">)
      if (el.classList.contains('rt-bold')) local.bold = true;
      if (el.classList.contains('rt-italic')) local.italic = true;
      if (el.classList.contains('rt-underline')) local.underline = true;
      if (el.classList.contains('rt-strikethrough')) local.strikethrough = true;
      // data-color allows semantic color tokens
      const dataColor = el.getAttribute('data-color');
      if (dataColor) local.color = dataColor;
      const dataHref = el.getAttribute('data-href');
      if (dataHref) local.href = dataHref;
      break;
    }
    default:
      break;
  }

  // Recurse into children.
  el.childNodes.forEach((child) => walk(child, local, out));
}

/**
 * Merge adjacent segments that share identical annotations.
 */
function coalesce(segments: RichText[]): RichText[] {
  if (segments.length === 0) return [];
  const result: RichText[] = [segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const prev = result[result.length - 1];
    if (sameAnnotations(seg.annotations, prev.annotations)) {
      prev.text += seg.text;
    } else {
      result.push(seg);
    }
  }
  return result;
}

/** Shallow equality check on annotation keys. */
function sameAnnotations(
  a: RichTextAnnotations,
  b: RichTextAnnotations,
): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.strikethrough === !!b.strikethrough &&
    (a.color ?? '') === (b.color ?? '') &&
    (a.href ?? '') === (b.href ?? '')
  );
}

/**
 * Convert the inner content of a DOM element into a `RichText[]`.
 *
 * @param el The element whose `childNodes` should be parsed.
 * @returns  An array of rich text segments (empty if `el` has no text).
 */
export function htmlToRichText(el: Node | null): RichText[] {
  if (!el) return [];

  const segments: RichText[] = [];
  el.childNodes.forEach((child) => walk(child, {}, segments));
  return coalesce(segments);
}
