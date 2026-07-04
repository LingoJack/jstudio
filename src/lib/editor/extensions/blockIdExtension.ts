import { Extension } from '@tiptap/core';

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
});

