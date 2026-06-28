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
 *   3. Cmd/Ctrl+Enter → insert an empty paragraph BELOW the current block
 *      and focus it ("下方插入一行").
 *   4. Cmd/Ctrl+Shift+Enter → insert an empty paragraph ABOVE the current
 *      block and focus it ("上方插入一行").
 *   5. Backspace inside an EMPTY codeBlock → convert it back to a plain
 *      paragraph (Notion-style "delete block"). Only fires when the block has
 *      no text content, so normal text editing inside a code block is
 *      unaffected.
 */

import { Extension, type KeyboardShortcutCommand } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

import { slashMenuPluginKey } from './slashMenu';
import { resolveBinding, toTiptapBinding } from '../shortcuts/keyboardShortcuts';
import { useStore } from '../../store/useStore';

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
    // Helper: check whether the slash-menu suggestion is currently open.
    // When it is, arrow keys must be forwarded to the suggestion popup
    // for item navigation, so BlockNavigation should stand aside.
    // -----------------------------------------------------------------
    const isSuggestionActive = () => {
      const pluginState = slashMenuPluginKey.getState(editor.state);
      return !!(pluginState && pluginState.active);
    };

    // -----------------------------------------------------------------
    // Helper: check whether the cursor is in the very first leaf node of
    // the document (first child at every nesting level). This is needed
    // because `$head.before(1) === 0` is true for *any* list item inside
    // a list that happens to be the first top-level block — but only the
    // first item's first paragraph should trigger an exit-to-title.
    // -----------------------------------------------------------------
    const isInFirstDocLeaf = ($head: typeof editor.state.selection.$head) => {
      for (let d = 0; d < $head.depth; d++) {
        if ($head.index(d) !== 0) return false;
      }
      return true;
    };

    // -----------------------------------------------------------------
    // ArrowUp — at the first block's top boundary, exit to the title.
    // -----------------------------------------------------------------
    const onArrowUp = () => {
      if (isSuggestionActive()) return false;
      const { state, view } = editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const $head = selection.$head;
      if ($head.depth < 1) return false;
      // Only the very first content node (at every nesting level) can exit
      // upward to the title.  This prevents ArrowUp in the 2nd list item of
      // a list-as-first-block from jumping to the title.
      if (!isInFirstDocLeaf($head)) return false;
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
      if (isSuggestionActive()) return false;
      const { state } = editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const $head = selection.$head;
      if ($head.depth < 1) return false;
      if (!isInFirstDocLeaf($head)) return false;
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
      if (isSuggestionActive()) return false;
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
    // Cmd/Ctrl+Enter — insert an empty paragraph BELOW the current block.
    // -----------------------------------------------------------------
    const onModEnter = () => {
      const { state } = editor;
      const { selection } = state;
      const $head = selection.$head;
      if ($head.depth < 1) return false;
      const after = $head.after(1);
      const tr = state.tr;
      const para = state.schema.nodes.paragraph.create();
      tr.insert(after, para);
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
      editor.view.dispatch(tr);
      return true;
    };

    // -----------------------------------------------------------------
    // Cmd/Ctrl+Shift+Enter — insert an empty paragraph ABOVE the current block.
    // -----------------------------------------------------------------
    const onModShiftEnter = () => {
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

    // -----------------------------------------------------------------
    // Backspace — convert an EMPTY codeBlock into a plain paragraph.
    // -----------------------------------------------------------------
    const onBackspace = () => {
      const { state } = editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const $head = selection.$head;
      if ($head.depth < 1) return false;
      const parent = $head.parent;
      if (parent.type.name !== 'codeBlock') return false;
      // Only when the block is completely empty.
      if (parent.content.size !== 0) return false;
      const blockPos = $head.before(1);
      editor
        .chain()
        .focus()
        .setNodeSelection(blockPos)
        .deleteSelection()
        .run();
      return true;
    };

    // Resolve user-customizable bindings from the shortcut registry.
    const ov = useStore.getState().keyboardShortcuts;
    const modEnterBinding = toTiptapBinding(resolveBinding('editor.insertBlockBelow', ov));
    const modShiftEnterBinding = toTiptapBinding(resolveBinding('editor.insertBlockAbove', ov));

    const keymap: Record<string, KeyboardShortcutCommand> = {
      ArrowUp: onArrowUp,
      ArrowLeft: onArrowLeft,
      ArrowDown: onArrowDown,
      Backspace: onBackspace,
    };
    keymap[modEnterBinding] = onModEnter;
    keymap[modShiftEnterBinding] = onModShiftEnter;
    return keymap;
  },
});
