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
import { TextSelection } from '@tiptap/pm/state';

export const SelectAllText = Extension.create({
  name: 'select-all-text',
  addKeyboardShortcuts() {
    return {
      'Mod-a': ({ editor }) => {
        const { state, view } = editor;
        const { tr, doc, selection } = state;

        // If the cursor is inside a code block, select only that code
        // block's content instead of the entire document.
        const { $from } = selection;
        let codeBlockDepth = -1;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'codeBlock') {
            codeBlockDepth = d;
            break;
          }
        }

        if (codeBlockDepth >= 0) {
          const codeBlockNode = $from.node(codeBlockDepth);
          const start = $from.start(codeBlockDepth);
          const end = start + codeBlockNode.content.size;
          tr.setSelection(TextSelection.create(doc, start, end));
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
