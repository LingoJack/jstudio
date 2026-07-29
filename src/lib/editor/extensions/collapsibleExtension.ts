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
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
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

  addKeyboardShortcuts() {
    const nodeName = this.name;

    return {
      /**
       * Escape - exit the collapsible block, placing the cursor after it.
       *
       * Because the collapsible is `isolating`, the cursor cannot naturally
       * rest at the boundary between two adjacent collapsibles (or between a
       * collapsible and a code block). When the user presses Escape, we move
       * the cursor to the position after the collapsible. If that position is:
       *   - End of document, OR
       *   - Immediately before another isolating block (e.g. another
       *     collapsible or a code block)
       * we insert an empty paragraph there first, so the cursor has a valid
       * text selection to land in. This directly solves the "two adjacent
       * collapsibles with no way to insert content between them" problem.
       *
       * Mirrors the CodeBlock extension's Escape behavior.
       */
      Escape: () => {
        const { editor } = this;
        const { state } = editor;
        const { selection, doc } = state;

        // Find the collapsible's "after" position.
        let after: number | null = null;

        if (
          selection instanceof NodeSelection &&
          selection.node.type.name === nodeName
        ) {
          // The collapsible node itself is selected (e.g. after clicking the
          // header background).
          after = selection.to;
        } else {
          // The caret is inside the collapsible - walk up to find it.
          const { $from } = selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === nodeName) {
              after = $from.after(d);
              break;
            }
          }
        }

        // Not in / on a collapsible - let other handlers run.
        if (after == null) return false;

        // Determine whether we need to insert a paragraph for the cursor to
        // land in. This is necessary when:
        //   1. The collapsible is the last block (after >= doc.content.size), OR
        //   2. The next block is also isolating (cursor can't sit at the gap)
        let needsParagraph = after >= doc.content.size;
        if (!needsParagraph) {
          const nextNode = doc.resolve(after).nodeAfter;
          if (nextNode && nextNode.type.spec.isolating) {
            needsParagraph = true;
          }
        }

        if (needsParagraph) {
          return editor
            .chain()
            .insertContentAt(after, { type: 'paragraph' })
            .setTextSelection(after + 1)
            .focus()
            .run();
        }

        return editor.chain().setTextSelection(after).focus().run();
      },

      /**
       * ArrowDown - at the end of the last child, if the collapsible is the
       * last block in the document, insert an empty paragraph below for the
       * cursor to land in.
       *
       * Otherwise, return false and let ProseMirror's default ArrowDown
       * move the cursor to the next block naturally.
       *
       * Mirrors the CodeBlock extension's ArrowDown behavior.
       */
      ArrowDown: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const $head = selection.$head;

        // Find the collapsible ancestor.
        let collapsibleDepth = -1;
        for (let d = $head.depth; d >= 1; d--) {
          if ($head.node(d).type.name === nodeName) {
            collapsibleDepth = d;
            break;
          }
        }
        if (collapsibleDepth < 0) return false;

        // Only act if the cursor is in the LAST child of the collapsible.
        const collapsibleNode = $head.node(collapsibleDepth);
        const lastChildIndex = collapsibleNode.childCount - 1;
        if ($head.index(collapsibleDepth) !== lastChildIndex) return false;

        // Only act if the cursor is at the bottom of the textblock.
        const atBottom =
          view.endOfTextblock('down', state) || $head.pos === $head.end();
        if (!atBottom) return false;

        // Only act if the collapsible is the last block in the document.
        const after = $head.after(collapsibleDepth);
        if (after < state.doc.content.size) return false;

        // Insert a paragraph after the collapsible and move the cursor there.
        const tr = state.tr;
        const para = state.schema.nodes.paragraph.create();
        tr.insert(after, para);
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
        editor.view.dispatch(tr);
        return true;
      },
    };
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

    // Walk up to find the collapsible ancestor (including depth=1)
    for (let d = $head.depth; d >= 1; d--) {
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
    for (let d = $head.depth; d >= 1; d--) {
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
