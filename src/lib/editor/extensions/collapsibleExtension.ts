/**
 * CollapsibleExtension — custom block node for collapsible (foldable) content.
 *
 * A collapsible block has:
 *   - A summary/title row (always visible, editable via an <input>)
 *   - A body region that can be expanded or collapsed
 *
 * The body accepts arbitrary block content (`content: 'block+'`), so users can
 * nest paragraphs, headings, lists, images, code blocks, etc. inside it.
 *
 * The `isolating` flag ensures the editor cursor cannot accidentally merge
 * content in or out of the collapsible boundary, and `defining: true` keeps
 * the node type when pasted into other editors.
 *
 * Supported attributes:
 *   open    — whether the body is expanded (default true)
 *   summary — the always-visible title text (default '')
 */

import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import CollapsibleView from '../../../components/editor/nodes/CollapsibleView';
import { blockBehaviorRegistry } from '../blockBehaviorRegistry';

export interface CollapsibleNodeAttributes {
  open: boolean;
  summary: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsible: {
      /** Insert a collapsible block with an empty summary and an empty paragraph inside. */
      setCollapsible: (attrs?: Partial<CollapsibleNodeAttributes>) => ReturnType;
    };
  }
}

export const CollapsibleExtension = Node.create({
  name: 'collapsible',

  group: 'block',

  /** Allow one or more block-level children inside the body. */
  content: 'block+',

  /**
   * Isolate the node so that backspace at the boundary of the collapsible
   * does not merge its first/last child into the surrounding document.
   */
  isolating: true,

  /** Keep the node type when its content is pasted elsewhere. */
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (el) => el.getAttribute('data-open') !== 'false',
        renderHTML: (attrs) => ({ 'data-open': String(attrs.open ?? true) }),
      },
      summary: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-summary') || '',
        renderHTML: (attrs) => ({ 'data-summary': attrs.summary ?? '' }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="collapsible"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { 'data-type': 'collapsible', ...HTMLAttributes },
      0,
    ];
  },

  addCommands() {
    return {
      setCollapsible:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent([
            {
              type: 'collapsible',
              attrs: {
                open: true,
                summary: '',
                ...attrs,
              },
              content: [{ type: 'paragraph' }],
            },
            {
              type: 'paragraph',
            },
          ]);
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CollapsibleView);
  },
});

/* --------------------------------------------------------------------- */
/* BlockBehaviorRegistry — delete empty collapsible on Backspace        */
/* --------------------------------------------------------------------- */

/**
 * Register deletion behavior for collapsible.
 *
 * When the user presses Backspace inside a collapsible block's empty body
 * paragraph AND the summary is empty, delete the whole collapsible block.
 * This matches Notion's behavior: an empty collapsible block should be deletable.
 *
 * Conditions for deletion:
 * 1. Cursor is in a paragraph inside the collapsible body
 * 2. That paragraph is empty (content.size === 0)
 * 3. It's the ONLY child of the collapsible body
 * 4. The collapsible's summary attribute is empty or whitespace-only
 */
blockBehaviorRegistry.register({
  nodeType: 'collapsible',
  canDelete: (editor, $head) => {
    // Check if we're inside a collapsible block's empty paragraph
    const parent = $head.parent;
    if (parent.type.name !== 'paragraph' || parent.content.size !== 0) return false;

    // Walk up to find the collapsible ancestor
    for (let d = $head.depth; d > 1; d--) {
      const ancestor = $head.node(d);
      if (ancestor.type.name === 'collapsible') {
        const summary = (ancestor.attrs.summary as string) ?? '';
        // Check if body has only one child AND it's an empty paragraph
        const hasOnlyOneEmptyChild =
          ancestor.childCount === 1 &&
          ancestor.firstChild?.type.name === 'paragraph' &&
          ancestor.firstChild.content.size === 0;
        // Delete only when summary is empty AND body is empty
        return hasOnlyOneEmptyChild && summary.trim() === '';
      }
    }
    return false;
  },
  delete: (editor, $head) => {
    // Walk up to find the collapsible ancestor's position and delete it
    for (let d = $head.depth; d > 1; d--) {
      const ancestor = $head.node(d);
      if (ancestor.type.name === 'collapsible') {
        const collapsiblePos = $head.before(d);
        editor
          .chain()
          .focus()
          .setNodeSelection(collapsiblePos)
          .deleteSelection()
          .run();
        return true;
      }
    }
    return false;
  },
});

export default CollapsibleExtension;
