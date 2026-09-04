/**
 * Rich text inline annotation model.
 *
 * Instead of storing raw HTML, inline formatting is stored as an array of
 * text segments. Each segment carries its text plus an annotations object.
 * This keeps the data structure clean, makes diffs efficient, and simplifies
 * collaboration.
 *
 * This mirrors Notion's "rich text" design.
 */

/** Inline formatting flags applied to a single text segment. */
export interface RichTextAnnotations {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  /** Inline code. When present the segment is rendered as `<code>`. */
  code?: boolean;
  /** CSS color value or a semantic color token. */
  color?: string;
  /** Link URL. When present the segment is rendered as an `<a>`. */
  href?: string;
  /**
   * Inline LaTeX formula. When present the segment's text IS the LaTeX
   * source and is rendered with KaTeX (inline mode). Atoms — other
   * annotations on the same segment are ignored by the editor.
   */
  inlineMath?: boolean;
}

/** A single run of text with optional inline annotations. */
export interface RichText {
  text: string;
  annotations: RichTextAnnotations;
}
