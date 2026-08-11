import { useEffect } from "react";
import { TextSelection } from "@tiptap/pm/state";
import { eventToBinding, resolveBinding } from "../../../lib/shortcuts/keyboardShortcuts";
import { editorForKeyboardTarget } from "../../../lib/editor/editorForKeyboardTarget";
import { logicalCodeLineBoundary, visualCodeLineBoundary } from "../../../lib/editor/codeLineBoundary";
import { useStore } from "../../../store/useStore";
function useEditorKeyboardNav({
  readOnly,
  titleInputRef,
  sectionEditorsRef,
  cursorTrailRegistry
}) {
  useEffect(() => {
    if (readOnly) return;
    const handler = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey) return;
      if (e.key === "`") {
        const editor2 = editorForKeyboardTarget(e.target, sectionEditorsRef.current);
        if (editor2) {
          const binding = eventToBinding(e);
          const overrides = useStore.getState().keyboardShortcuts;
          if (binding === resolveBinding("editor.inlineCode", overrides)) {
            editor2.chain().focus().toggleCode().run();
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const titleEl = titleInputRef.current;
      if (titleEl && e.target === titleEl) {
        const toStart2 = e.key === "ArrowLeft";
        const len = titleEl.value.length;
        const target = toStart2 ? 0 : len;
        if (e.shiftKey) {
          const s = titleEl.selectionStart ?? 0;
          const en = titleEl.selectionEnd ?? 0;
          const anchor = titleEl.selectionDirection === "backward" ? en : s;
          titleEl.setSelectionRange(
            Math.min(anchor, target),
            Math.max(anchor, target),
            target < anchor ? "backward" : "forward"
          );
        } else {
          titleEl.setSelectionRange(target, target);
        }
        cursorTrailRegistry.markDirty();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const editor = editorForKeyboardTarget(e.target, sectionEditorsRef.current);
      if (!editor) return;
      const view = editor.view;
      const { state } = view;
      const { selection } = state;
      if (!(selection instanceof TextSelection)) return;
      const $head = selection.$head;
      if ($head.depth < 1) return;
      const toStart = e.key === "ArrowLeft";
      const extend = e.shiftKey;
      let edge;
      const inCodeBlock = $head.depth > 0 && $head.parent.type.name === "codeBlock";
      if (inCodeBlock) {
        const codeNode = $head.parent;
        const blockStart = $head.start();
        const blockEnd = blockStart + codeNode.content.size;
        edge = visualCodeLineBoundary(
          editor,
          selection.head,
          blockStart,
          blockEnd,
          toStart
        ) ?? blockStart + logicalCodeLineBoundary(
          codeNode.textContent,
          $head.parentOffset,
          toStart
        );
      } else {
        edge = toStart ? $head.start() : $head.end();
      }
      const tr = extend ? state.tr.setSelection(
        TextSelection.create(state.doc, selection.$anchor.pos, edge)
      ) : state.tr.setSelection(TextSelection.create(state.doc, edge));
      tr.setMeta("addToHistory", false);
      view.dispatch(tr);
      view.focus();
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [readOnly]);
}
export {
  useEditorKeyboardNav
};
