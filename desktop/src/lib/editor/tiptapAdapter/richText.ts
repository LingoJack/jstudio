/**
 * RichText ↔ TipTap marks bidirectional conversion.
 *
 * Our `RichText[]` (Notion-like rich-text segments) ↔ TipTap inline `JSONContent[]`.
 *
 * Mapping:
 *   OUR ANNOTATIONS   →   TIPTAP MARKS
 *   ────────────────────────────────────────
 *   bold              →   bold
 *   italic            →   italic
 *   underline         →   underline
 *   strikethrough     →   strike
 *   code              →   code
 *   color (≠ default) →   textStyle (attrs.color)
 *   href              →   link (attrs.href)
 *   inlineMath        →   inlineMath node (attrs.latex = segment text)
 */

import type { JSONContent } from "@tiptap/react";
import type { RichText, RichTextAnnotations } from "../../../types/richText";

/** A TipTap mark with a concrete type and attrs. */
interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/**
 * Build the list of TipTap marks for a single `RichText` segment based on its
 * annotations.
 *
 * Order matters for rendering consistency: we emit marks in a stable order
 * (bold, italic, underline, strike, code, textStyle, link).
 */
function annotationsToMarks(ann: RichTextAnnotations): TiptapMark[] {
  const marks: TiptapMark[] = [];

  if (ann.bold) marks.push({ type: "bold" });
  if (ann.italic) marks.push({ type: "italic" });
  if (ann.underline) marks.push({ type: "underline" });
  if (ann.strikethrough) marks.push({ type: "strike" });
  if (ann.code) marks.push({ type: "code" });

  if (ann.color && ann.color !== "default") {
    marks.push({ type: "textStyle", attrs: { color: ann.color } });
  }

  if (ann.href) {
    marks.push({ type: "link", attrs: { href: ann.href } });
  }

  return marks;
}

/**
 * Split a `RichText[]` into per-line groups on `\n` (both standalone `\n`
 * segments and `\n` inside a segment's text). Annotations are preserved on
 * each piece. Always returns at least one group (possibly empty).
 *
 * Used by container blocks (quote, list items, todo items) to emit ONE
 * PARAGRAPH PER LINE instead of a single paragraph with hardBreaks: on
 * WebKit/WKWebView the native caret on continuation lines of a multi-line
 * textblock is painted with the full line-stride height (line-height, e.g.
 * 1.7em) instead of the typographic height (~1.2em), so hardBreak-separated
 * lines show an oversized caret. Separate paragraphs don't trigger it.
 */
export function splitRichTextByLines(rich: RichText[]): RichText[][] {
  const lines: RichText[][] = [[]];
  for (const seg of rich ?? []) {
    if (!seg.text) continue;
    const parts = seg.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...seg, text: part });
    });
  }
  return lines;
}

/**
 * Convert our `RichText[]` to an array of TipTap inline `JSONContent` nodes.
 *
 * Each `RichText` segment becomes a text node with the appropriate marks.
 * Empty segments are skipped. If the array is empty an empty array is
 * returned (the caller can decide whether to emit an empty paragraph).
 */
export function richTextToTiptapInline(rich: RichText[]): JSONContent[] {
  if (!rich || rich.length === 0) return [];

  const result: JSONContent[] = [];

  for (const seg of rich) {
    if (!seg.text) continue;

    // Inline LaTeX formula: an atom node, not text+marks. Its text IS the
    // LaTeX source. Formulas are single-line by definition; an embedded \n
    // is kept verbatim inside the latex attr (KaTeX handles newlines).
    if (seg.annotations?.inlineMath) {
      result.push({ type: "inlineMath", attrs: { latex: seg.text } });
      continue;
    }

    const marks = annotationsToMarks(seg.annotations ?? {});
    // A segment may contain soft line breaks (`\n`, from Shift+Enter). TipTap
    // represents these as `hardBreak` atom nodes, not as `\n` inside a text
    // node. Split on `\n` and interleave hardBreak nodes so the break
    // survives the round-trip instead of being silently dropped.
    const parts = seg.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) result.push({ type: "hardBreak" });
      if (part) result.push({ type: "text", text: part, marks });
    });
  }

  return result;
}

/**
 * Convert an array of TipTap inline `JSONContent` nodes back to our
 * `RichText[]`.
 *
 * Handles text nodes and unwraps `link` nodes if present.
 */
export function tiptapInlineToRichText(nodes: JSONContent[]): RichText[] {
  if (!nodes || nodes.length === 0) return [];

  const result: RichText[] = [];

  for (const node of nodes) {
    if (node.type === "text") {
      const marks = (node.marks ?? []) as TiptapMark[];
      result.push({
        text: node.text ?? "",
        annotations: marksToAnnotations(marks),
      });
    } else if (node.type === "inlineMath") {
      // Inline LaTeX formula atom — the latex attr becomes the segment text.
      const latex = node.attrs?.latex;
      result.push({
        text: typeof latex === "string" ? latex : "",
        annotations: { inlineMath: true },
      });
    } else if (node.type === "hardBreak") {
      // Soft line break (Shift+Enter). Encode as a `\n` segment so it
      // round-trips back to a hardBreak on the next load.
      result.push({ text: "\n", annotations: {} });
    }
    // Other inline types are ignored for now.
  }

  return result;
}

/** Map a list of TipTap marks back to our `RichTextAnnotations`. */
function marksToAnnotations(marks: TiptapMark[]): RichTextAnnotations {
  const annotations: RichTextAnnotations = {};

  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        annotations.bold = true;
        break;
      case "italic":
        annotations.italic = true;
        break;
      case "underline":
        annotations.underline = true;
        break;
      case "strike":
        annotations.strikethrough = true;
        break;
      case "code":
        annotations.code = true;
        break;
      case "textStyle": {
        const color = mark.attrs?.color;
        if (typeof color === "string") {
          annotations.color = color;
        }
        break;
      }
      case "link": {
        const href = mark.attrs?.href;
        if (typeof href === "string") {
          annotations.href = href;
        }
        break;
      }
      default:
        // Unknown marks are ignored.
        break;
    }
  }

  return annotations;
}
