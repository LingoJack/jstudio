/**
 * SelectAllText — overrides ProseMirror's default Mod-a keymap.
 *
 * The built-in "selectAll" command creates an AllSelection, whose DOM Range
 * extends to the very end of the editor DOM (.ProseMirror).  When the last
 * block is a <pre><code>…</code></pre>, WebKit paints the ::selection
 * background across the full width of the <pre> element's bottom padding,
 * producing a thick blue bar below the code.  By re-creating the selection as
 * a TextSelection (from doc start to the last text position inside the last
 * block), the DOM range stays within text nodes and the highlight renders
 * correctly.
 */

import { Extension } from '@tiptap/core';
import { TextSelection, NodeSelection } from '@tiptap/pm/state';

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

        // Walk the document to find the end position of the very last text
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
