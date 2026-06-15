/**
 * Custom BlockNote extension that overrides the default code block Enter behavior.
 *
 * By default, BlockNote exits the code block when you press Enter twice at the
 * end of the block (mimicking Notion). This extension disables that behavior so
 * that Enter inside a code block ALWAYS just inserts a newline — the only way
 * to leave the code block is via arrow keys / mouse.
 */

import { createExtension } from '@blocknote/core';

export const CodeBlockEnterOverride = createExtension({
  key: 'code-block-enter-override',

  // Run before the built-in code-block keyboard shortcuts so we intercept
  // Enter first. If we return true, the built-in handler never fires.
  runsBefore: ['code-block-keyboard-shortcuts'],

  keyboardShortcuts: {
    Enter: ({ editor }) => {
      const block = editor.getTextCursorPosition().block;
      if (block.type !== 'codeBlock') {
        // Not in a code block — let the default handler deal with it.
        return false;
      }
      // Inside a code block: insert a plain newline and stop propagation so
      // the built-in "double Enter to exit" logic never triggers.
      editor.transact((tr) => {
        tr.insertText('\n');
      });
      return true;
    },
  },
});
