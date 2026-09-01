/**
 * SelectAllText — the editor's Mod-a keymap.
 *
 * Behavior:
 *   1. Caret/selection inside a code block → select ONLY that block's content.
 *   2. Otherwise → delegate to the cross-section select-all handler
 *      registered by DocumentPanel (selectAllRegistry) so the whole document
 *      is selected, identical to the macOS menu's "Select All" dispatch.
 *   3. No handler registered (static preview etc.) → section-local
 *      TextSelection from doc start to the last text position, which keeps
 *      the DOM Range inside text nodes and avoids the WebKit bug where an
 *      AllSelection paints a full-width ::selection bar across a trailing
 *      <pre>'s bottom padding.
 */

import { Extension } from '@tiptap/core';
import { TextSelection, NodeSelection } from '@tiptap/pm/state';
import { getSelectAllHandler } from '../selectAllRegistry';

export const SelectAllText = Extension.create({
  name: 'select-all-text',
  addKeyboardShortcuts() {
    return {
      'Mod-a': ({ editor }) => {
        const { state, view } = editor;
        const { tr, doc, selection } = state;

        // If the cursor is inside a code block — OR a code block node is
        // selected (e.g. after triple-click) — select only that block's
        // content instead of the entire document. NodeSelection must be
        // handled separately because its $from.depth === 0, so the ancestor
        // walk below would skip it and fall through to whole-doc selection.
        let codeBlockRange: { from: number; to: number } | null = null;

        if (
          selection instanceof NodeSelection &&
          selection.node.type.name === 'codeBlock'
        ) {
          // The code block node itself is selected.
          const pos = selection.from;
          const node = selection.node;
          codeBlockRange = { from: pos + 1, to: pos + 1 + node.content.size };
        } else {
          // The caret is inside a code block — walk up the ancestors.
          const { $from } = selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'codeBlock') {
              const start = $from.start(d);
              const node = $from.node(d);
              codeBlockRange = { from: start, to: start + node.content.size };
              break;
            }
          }
        }

        if (codeBlockRange) {
          tr.setSelection(
            TextSelection.create(doc, codeBlockRange.from, codeBlockRange.to),
          );
          view.dispatch(tr);
          return true;
        }

        // Not in a code block → select the ENTIRE document across all
        // sections via the handler registered by DocumentPanel (the same
        // entry the macOS menu's "Select All" dispatches to). This fires when
        // Cmd+A reaches the editor as a DOM keydown — i.e. whenever the
        // native menu did NOT intercept it — so both paths behave identically.
        const crossHandler = getSelectAllHandler();
        if (crossHandler) {
          crossHandler();
          return true;
        }

        // Fallback (no DocumentPanel registered, e.g. static preview): walk
        // the document to find the end position of the very last text
        // node.  This keeps the DOM selection range inside text nodes,
        // avoiding the AllSelection bug where WebKit paints a full-width
        // ::selection bar across <pre> bottom padding.
        let lastTextEnd = -1;
        doc.descendants((node, pos) => {
          if (node.isText) lastTextEnd = pos + node.nodeSize;
          return true;
        });

        const end = lastTextEnd >= 0 ? lastTextEnd : doc.content.size;
        tr.setSelection(TextSelection.create(doc, 0, end));
        view.dispatch(tr);
        return true;
      },
    };
  },
});
