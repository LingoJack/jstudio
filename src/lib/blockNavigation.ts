/**
 * BlockNavigation — unified arrow-key & Enter navigation for BlockEditor.
 *
 * The document title is a plain <input> that lives OUTSIDE the TipTap editor,
 * so ProseMirror has no built-in way to move the focus between the title and
 * the editor body. This extension bridges that gap and also fixes a couple of
 * "trapped cursor" annoyances:
 *
 *   1. ArrowUp / ArrowLeft at the start of the FIRST block → hand focus back
 *      to the document title input (via the `onExitToTitle` callback).
 *   2. ArrowDown at the end of the LAST block when it is a codeBlock → insert
 *      a new empty paragraph below and move the cursor there. Code blocks are
 *      otherwise hard to leave (exitOnTripleEnter is disabled).
 *   3. Cmd/Ctrl+Enter → insert an empty paragraph ABOVE the current block and
 *      focus it ("上方插入一行").
 */

import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

export interface BlockNavigationOptions {
  /** Called when the cursor should leave the editor upward to the title. */
  onExitToTitle?: () => void;
}

export const BlockNavigation = Extension.create<BlockNavigationOptions>({
  name: 'blockNavigation',

  addOptions() {
    return {
      onExitToTitle: undefined,
    };
  },

  addKeyboardShortcuts() {
    const editor = this.editor;

    // -----------------------------------------------------------------
    // ArrowUp — at the first block's top boundary, exit to the title.
    // -----------------------------------------------------------------
    const onArrowUp = () => {
      const { state, view } = editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const $head = selection.$head;
      if ($head.depth < 1) return false;
      // Only the very first top-level block can exit upward to the title.
      if ($head.before(1) !== 0) return false;
      // Cursor is on the first visual line / at the very start of the block.
      const atTop =
        view.endOfTextblock('up', state) || $head.pos === $head.start(1);
      if (atTop) {
        this.options.onExitToTitle?.();
        return true;
      }
      return false;
    };

    // -----------------------------------------------------------------
    // ArrowLeft — at the first block's start, exit to the title.
    // -----------------------------------------------------------------
    const onArrowLeft = () => {
      const { state } = editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const $head = selection.$head;
      if ($head.depth < 1) return false;
      if ($head.before(1) !== 0) return false;
      if ($head.pos === $head.start(1)) {
        this.options.onExitToTitle?.();
        return true;
      }
      return false;
    };

    // -----------------------------------------------------------------
    // ArrowDown — escape a trailing code block by inserting a paragraph.
    // -----------------------------------------------------------------
    const onArrowDown = () => {
      const { state, view } = editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const $head = selection.$head;
      if ($head.depth < 1) return false;
      const parent = $head.parent;
      // Only code blocks need help escaping; other blocks behave natively.
      if (parent.type.name !== 'codeBlock') return false;
      // If a block follows, let native ArrowDown move to it.
      const isLastBlock = $head.after(1) >= state.doc.content.size;
      if (!isLastBlock) return false;
      const atBottom =
        view.endOfTextblock('down', state) || $head.pos === $head.end();
      if (atBottom) {
        const after = $head.after(1);
        const tr = state.tr;
        const para = state.schema.nodes.paragraph.create();
        tr.insert(after, para);
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
        editor.view.dispatch(tr);
        return true;
      }
      return false;
    };

    // -----------------------------------------------------------------
    // Cmd/Ctrl+Enter — insert an empty paragraph ABOVE the current block.
    // -----------------------------------------------------------------
    const onModEnter = () => {
      const { state } = editor;
      const { selection } = state;
      const $head = selection.$head;
      if ($head.depth < 1) return false;
      const blockPos = $head.before(1);
      const tr = state.tr;
      const para = state.schema.nodes.paragraph.create();
      tr.insert(blockPos, para);
      tr.setSelection(TextSelection.create(tr.doc, blockPos + 1));
      editor.view.dispatch(tr);
      return true;
    };

    return {
      ArrowUp: onArrowUp,
      ArrowLeft: onArrowLeft,
      ArrowDown: onArrowDown,
      'Mod-Enter': onModEnter,
    };
  },
});
