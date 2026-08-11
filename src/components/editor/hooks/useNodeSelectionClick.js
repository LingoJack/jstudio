import { useCallback } from "react";
const DEFAULT_IGNORE_SELECTOR = "button, input, textarea, select, a, .block-resize-handle";
function useNodeSelectionClick(editor, getPos, options = {}) {
  const { ignoreSelector, skipWhenSelected = false, selected = false } = options;
  const selectorList = ignoreSelector ? `${DEFAULT_IGNORE_SELECTOR}, ${ignoreSelector}` : DEFAULT_IGNORE_SELECTOR;
  return useCallback(
    (e) => {
      if (!editor) return;
      if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if (skipWhenSelected && selected) return;
      const target = e.target;
      if (target && target.closest(selectorList)) return;
      const pos = typeof getPos === "function" ? getPos() : null;
      if (pos == null) return;
      const isEditableTarget = target instanceof HTMLElement ? target.isContentEditable : false;
      if (!isEditableTarget) {
        e.preventDefault();
      }
      editor.commands.setNodeSelection(pos);
      if (!editor.view.hasFocus()) {
        editor.view.focus();
      }
    },
    [editor, getPos, selectorList, skipWhenSelected, selected]
  );
}
export {
  useNodeSelectionClick
};
