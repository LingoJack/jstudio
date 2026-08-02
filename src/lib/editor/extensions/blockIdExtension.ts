import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Fragment, Slice } from '@tiptap/pm/model';
import type { Node } from '@tiptap/pm/model';

/**
 * Recursively walk a node tree and assign fresh ids to every node that
 * carries a block id (attrs.id).  Returns a new node tree; nodes without
 * an id and without modified descendants are returned as-is (structural
 * sharing) so unchanged subtrees are not needlessly re-created.
 */
function regenerateBlockIds(node: Node): Node {
  // Recurse into children first.
  let content = node.content;
  if (content.size > 0) {
    const children: Node[] = [];
    content.forEach((child) => children.push(regenerateBlockIds(child)));
    content = Fragment.from(children);
  }

  const hasId = node.attrs && 'id' in node.attrs && node.attrs.id != null;

  if (hasId) {
    // Re-create the node with a brand-new id, preserving type/content/marks.
    return node.type.create(
      { ...node.attrs, id: crypto.randomUUID() },
      content,
      node.marks,
    );
  }

  // No id on this node, but children may have changed.
  if (content !== node.content) {
    return node.copy(content);
  }

  return node;
}

/**
 * Persist our document Block.id through TipTap/ProseMirror JSON.
 *
 * Without a schema attribute, ids written by the adapter are dropped by
 * ProseMirror, and the store sync regenerates every block id on each save.
 */
export const BlockIdExtension = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: [
          'paragraph',
          'heading',
          'blockquote',
          'codeBlock',
          'image',
          'fileBlock',
          'linkBlock',
          'diagramBlock',
          'mathBlock',
          'table',
          'bulletList',
          'orderedList',
          'taskList',
          'horizontalRule',
          'collapsible',
        ],
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-block-id'),
            renderHTML: (attributes) => {
              if (!attributes.id) return {};
              return { 'data-block-id': attributes.id };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockId'),
        // Backfill a fresh `id` on any block-level node that is missing one.
        //
        // Nodes created through the editor (slash-menu headings, Enter-created
        // paragraphs, drag-inserted blocks, …) start with `id: null` because
        // the `id` attribute's default is null and no creation path sets it.
        // The store sync (`tiptapJSONToOurBlock`) then generates a NEW uuid
        // for such nodes, so the editor's ProseMirror node (null id -> no
        // `data-block-id` in the DOM) and the store block (new uuid) drift
        // apart. The outline - which merges store + editor headings and looks
        // up the DOM by `data-block-id` - can no longer find the element, so
        // clicking the heading does nothing.
        //
        // Assigning the id HERE (inside the editor, the moment the node is
        // created) keeps the editor doc, the rendered DOM and the store all
        // referencing the SAME id, so outline jump-to-heading works for every
        // heading regardless of how it was created.
        appendTransaction: (transactions, _oldState, newState) => {
          // Selection-only transactions (caret moves) don't touch the doc.
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const tr = newState.tr;
          let modified = false;
          newState.doc.descendants((node, pos) => {
            // Only block-level node types carry the global `id` attribute;
            // inline nodes (text) and wrapper-only nodes (listItem, tableCell,
            // …) don't, so skip them.
            if (!node.type.attrs.id) return true;
            if (node.attrs.id) return true; // already has an id - leave it.
            tr.setNodeMarkup(
              pos,
              undefined,
              { ...node.attrs, id: crypto.randomUUID() },
            );
            modified = true;
            return true;
          });
          if (!modified) return null;
          // id assignment is metadata bookkeeping, not a user edit - keep it
          // out of the undo stack (undoing it would only re-trigger this).
          tr.setMeta('addToHistory', false);
          return tr;
        },
        props: {
          // When content is copied and pasted inside the same editor,
          // ProseMirror preserves every node attribute - including our
          // block id.  That leaves two DOM elements sharing the same
          // `data-block-id`, so the outline's querySelector always
          // resolves to the *first* match (the original/source node)
          // and clicking the pasted heading jumps back to the source.
          //
          // Regenerating ids on the pasted slice fixes this while
          // leaving drag-and-drop *moves* untouched (moves do not go
          // through transformPasted).
          transformPasted(slice: Slice): Slice {
            const children: Node[] = [];
            slice.content.forEach((child) =>
              children.push(regenerateBlockIds(child)),
            );
            return new Slice(Fragment.from(children), slice.openStart, slice.openEnd);
          },
        },
      }),
    ];
  },
});
