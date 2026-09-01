/**
 * Clipboard markdown serialization for copy events.
 *
 * Rule (one sentence): blocks FULLY covered by the selection keep their
 * markdown structure; blocks the selection cuts into contribute only the
 * selected inline content (bold/inline-code marks kept, no block-level
 * prefixes at all).
 *
 * Consequences:
 *   - Select text inside a list item        -> plain text, no '- '.
 *   - Click a list marker (ListMarkerSelection node-selects the item)
 *                                            -> '- text' with nesting.
 *   - Block-aligned drag / Cmd+A select-all -> full markdown structure.
 *   - Cut into a heading mid-word           -> plain text, no '## '.
 *
 * Coverage is computed directly from doc positions (doc.forEach over
 * top-level blocks) rather than from ProseMirror slice shapes —
 * openStart/openEnd semantics vary with cut depth, which made the previous
 * slice-unwrapping approach fragile for ragged multi-block selections.
 */

import type { Editor, JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import type { Node } from "@tiptap/pm/model";

const LIST_ITEM_TYPE = "listItem";
const LIST_NODE_TYPES = new Set(["bulletList", "orderedList"]);
const DEFAULT_LIST_TYPE = "bulletList";

/** One clipped text node as JSONContent, marks preserved. */
function textNodeJson(node: Node, clipFrom: number, clipTo: number): JSONContent | null {
  const text = node.text?.slice(clipFrom, clipTo) ?? "";
  if (!text) return null;
  return {
    type: "text",
    text,
    ...(node.marks.length > 0
      ? { marks: node.marks.map((m) => m.toJSON()) }
      : {}),
  };
}

/**
 * Inline content of [from, to] (inside a cut-open block) grouped into plain
 * paragraphs. Marks survive; block structure does not.
 */
function rangeToPlainParagraphs(doc: Node, from: number, to: number): JSONContent[] {
  if (from >= to) return [];
  const paragraphs: JSONContent[] = [];
  let inline: JSONContent[] = [];
  let lastTextblock: Node | null = null;

  const flush = () => {
    if (inline.length > 0) {
      paragraphs.push({ type: "paragraph", content: inline });
      inline = [];
    }
  };

  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      // Paragraph boundary: flush the inline run of the previous textblock.
      if (lastTextblock !== node) {
        flush();
        lastTextblock = node;
      }
      return true;
    }
    if (node.isText && node.text) {
      const start = Math.max(pos, from);
      const end = Math.min(pos + node.nodeSize, to);
      if (end > start) {
        const json = textNodeJson(node, start - pos, end - pos);
        if (json) inline.push(json);
      }
      return true;
    }
    if (node.type.name === "hardBreak") {
      inline.push({ type: "hardBreak" });
      return true;
    }
    if (node.isBlock && node.isLeaf && pos >= from && pos + node.nodeSize <= to) {
      // Fully covered atom block (image, horizontal rule, ...) inside a
      // cut-open container — keep the node itself, flush around it.
      flush();
      paragraphs.push(node.toJSON());
    }
    return true;
  });
  flush();
  return paragraphs;
}

/**
 * Serialize [from, to] of the focused editor's doc. Exported for the
 * cross-section copy path (useCrossSectionSelection -> getText), which
 * owns explicit per-section ranges instead of a live selection.
 */
export function serializeRangeToMarkdown(
  editor: Editor,
  from: number,
  to: number,
): string {
  const manager = editor.markdown;
  if (!manager) {
    // Fallback (Markdown extension absent): flattening text only.
    return editor.state.doc.textBetween(from, to, "\n");
  }
  if (from >= to) return "";

  const { doc } = editor.state;
  const blocks: JSONContent[] = [];
  doc.forEach((node, offset) => {
    const start = offset;
    const end = offset + node.nodeSize;
    if (end <= from || start >= to) return; // block outside the selection

    // Boundary tolerance: a cut exactly at the block's content edge
    // (from == start + 1 / to == end - 1) still selects the whole block —
    // dragging from the first character of a heading keeps its '## '.
    // Note this never upgrades a mid-list-item cut to "covered": the cut
    // there lands 3+ positions inside the top-level list node.
    const coversLeft = from <= start + 1;
    const coversRight = to >= end - 1;

    if (coversLeft && coversRight) {
      blocks.push(node.toJSON());
    } else {
      blocks.push(
        ...rangeToPlainParagraphs(
          doc,
          Math.max(from, start + 1),
          Math.min(to, end - 1),
        ),
      );
    }
  });

  return manager.serialize({ type: "doc", content: blocks }).trim();
}

/** Immediate list type around `pos` ('bulletList' | 'orderedList'). */
function enclosingListType(editor: Editor, pos: number): string {
  const $pos = editor.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 1; depth--) {
    const name = $pos.node(depth).type.name;
    if (LIST_NODE_TYPES.has(name)) return name;
  }
  return DEFAULT_LIST_TYPE;
}

/**
 * Serialize the editor's CURRENT selection for the clipboard.
 * Node selections (whole-block / list-item-via-marker) keep structure;
 * everything else goes through the range serializer.
 */
export function serializeSelectionToMarkdown(editor: Editor): string {
  const { selection } = editor.state;
  const manager = editor.markdown;
  if (!manager) {
    return editor.state.doc.textBetween(
      selection.from,
      selection.to,
      "\n",
    );
  }

  if (selection instanceof NodeSelection) {
    const json = selection.node.toJSON();
    let content: JSONContent[];
    if (json.type === LIST_ITEM_TYPE) {
      // A bare listItem is not valid at doc level — wrap it into its
      // parent list so the serializer can emit the marker.
      content = [
        { type: enclosingListType(editor, selection.from), content: [json] },
      ];
    } else {
      content = [json];
    }
    return manager.serialize({ type: "doc", content }).trim();
  }

  return serializeRangeToMarkdown(editor, selection.from, selection.to);
}
