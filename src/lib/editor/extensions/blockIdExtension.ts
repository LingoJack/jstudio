import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node, Slice, Fragment } from '@tiptap/pm/model';

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
        key: new PluginKey('blockIdPaste'),
        props: {
          // When content is copied and pasted inside the same editor,
          // ProseMirror preserves every node attribute — including our
          // block id.  That leaves two DOM elements sharing the same
          // `data-block-id`, so the outline's querySelector always
          // resolves to the *first* match (the original/source node)
          // and clicking the pasted heading jumps back to the source.
          //
          // Regenerating ids on the pasted slice fixes this while
          // leaving drag-and-drop *moves* untouched (moves do not go
          // through transformPasted).
          transformPasted(slice: Slice): Slice {
            const newContent = slice.content.map((node) =>
              regenerateBlockIds(node),
            );
            return new Slice(newContent, slice.openStart, slice.openEnd);
          },
        },
      }),
    ];
  },
});

