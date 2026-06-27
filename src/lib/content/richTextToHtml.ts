/**
 * RichText[] → HTML string converter.
 *
 * Renders an array of annotated text segments into HTML that a
 * `contentEditable` element can consume via `innerHTML`.
 *
 * Each segment is wrapped in a `<span>` (or `<a>` when it has a link) with
 * CSS classes / inline styles derived from its annotations.
 */

import type { RichText, RichTextAnnotations } from '../../types/richText';

/** Escape HTML special characters in text content. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape text for use inside a double-quoted attribute value. */
function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

/**
 * Render a single `RichText` segment into an HTML string.
 *
 * Empty annotations produce plain (escaped) text.
 */
function renderSegment(segment: RichText): string {
  const { text, annotations } = segment;
  const escaped = escapeHtml(text);

  // No annotations at all — emit raw text.
  const hasAny =
    annotations.bold ||
    annotations.italic ||
    annotations.underline ||
    annotations.strikethrough ||
    annotations.code ||
    annotations.color ||
    annotations.href;
  if (!hasAny) return escaped;

  // Build class list and inline style.
  const classes: string[] = [];
  const styles: string[] = [];

  if (annotations.bold) classes.push('rt-bold');
  if (annotations.italic) classes.push('rt-italic');
  if (annotations.underline) classes.push('rt-underline');
  if (annotations.strikethrough) classes.push('rt-strikethrough');
  if (annotations.code) classes.push('rt-code');
  if (annotations.color) styles.push(`color: ${annotations.color}`);

  const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
  const styleAttr = styles.length ? ` style="${styles.join('; ')}"` : '';

  // Links render as <a>.
  if (annotations.href) {
    const href = escapeAttr(annotations.href);
    return `<a href="${href}"${classAttr}${styleAttr}>${escaped}</a>`;
  }

  return `<span${classAttr}${styleAttr}>${escaped}</span>`;
}

/**
 * Convert a `RichText[]` into an HTML string.
 *
 * Newlines within a segment's text are preserved as `<br>`.
 *
 * @param segments  The rich text array to render.
 * @returns         An HTML string suitable for `el.innerHTML`.
 */
export function richTextToHtml(segments: RichText[] | null | undefined): string {
  if (!segments || segments.length === 0) return '';

  return segments
    .map((segment) => {
      // Preserve newlines as <br>.
      if (segment.text.includes('\n')) {
        const parts = segment.text.split('\n');
        return parts
          .map((part, idx) => {
            const rendered = renderSegment({ text: part, annotations: segment.annotations });
            return idx < parts.length - 1 ? rendered + '<br>' : rendered;
          })
          .join('');
      }
      return renderSegment(segment);
    })
    .join('');
}
