/**
 * serializeSliceToMarkdown — serialize a ProseMirror slice to markdown text
 * for the clipboard.
 *
 * Why: ProseMirror's default clipboardTextSerializer (and any
 * `doc.textBetween`-based copy path) flattens structure — bullet/ordered/
 * task lists lose their markers and nesting indentation, inline code loses
 * its backticks, headings lose '#', code blocks lose their fences. Routing
 * the slice through the editor's MarkdownManager preserves all of that, so
 * text copied out of the editor is usable markdown instead of a wall of
 * de-structured plain lines.
 */

import type { Editor } from "@tiptap/core";
import type { Slice } from "@tiptap/pm/model";

export function serializeSliceToMarkdown(editor: Editor, slice: Slice): string {
  const manager = editor.markdown;
  if (!manager) {
    // Fallback (Markdown extension absent): structure-aware serialization is
    // unavailable; keep the previous flattening behavior.
    return slice.content.textBetween(0, slice.content.size, "\n");
  }
  // slice.content.toJSON() yields complete node JSON (openStart/openEnd are
  // slice metadata, not part of the nodes), so the manager can serialize it
  // as an ordinary doc.
  return manager
    .serialize({ type: "doc", content: slice.content.toJSON() ?? [] })
    .trim();
}
