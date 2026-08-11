import { Extension } from "@tiptap/core";
import { TextSelection, NodeSelection } from "@tiptap/pm/state";
const SelectAllText = Extension.create({
  name: "select-all-text",
  addKeyboardShortcuts() {
    return {
      "Mod-a": ({ editor }) => {
        const { state, view } = editor;
        const { tr, doc, selection } = state;
        let codeBlockRange = null;
        if (selection instanceof NodeSelection && selection.node.type.name === "codeBlock") {
          const pos = selection.from;
          const node = selection.node;
          codeBlockRange = { from: pos + 1, to: pos + 1 + node.content.size };
        } else {
          const { $from } = selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === "codeBlock") {
              const start = $from.start(d);
              const node = $from.node(d);
              codeBlockRange = { from: start, to: start + node.content.size };
              break;
            }
          }
        }
        if (codeBlockRange) {
          tr.setSelection(
            TextSelection.create(doc, codeBlockRange.from, codeBlockRange.to)
          );
          view.dispatch(tr);
          return true;
        }
        let lastTextEnd = -1;
        doc.descendants((node, pos) => {
          if (node.isText) lastTextEnd = pos + node.nodeSize;
          return true;
        });
        const end = lastTextEnd >= 0 ? lastTextEnd : doc.content.size;
        tr.setSelection(TextSelection.create(doc, 0, end));
        view.dispatch(tr);
        return true;
      }
    };
  }
});
export {
  SelectAllText
};
