import { useState, useEffect } from "react";
import { NodeSelection } from "@tiptap/pm/state";
function useNodeSelected(editor, getPos) {
  const [selected, setSelected] = useState(false);
  useEffect(() => {
    if (!editor) return;
    const compute = () => {
      const pos = typeof getPos === "function" ? getPos() : null;
      const sel = editor.state.selection;
      setSelected(
        pos != null && sel instanceof NodeSelection && sel.from === pos
      );
    };
    compute();
    editor.on("selectionUpdate", compute);
    return () => {
      editor.off("selectionUpdate", compute);
    };
  }, [editor, getPos]);
  return selected;
}
export {
  useNodeSelected
};
