import { Extension } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { slashMenuPluginKey } from "./slashMenu";
import { eventToBinding, resolveBinding } from "../shortcuts/keyboardShortcuts";
import { useStore } from "../../store/useStore";
import { blockBehaviorRegistry } from "./blockBehaviorRegistry";
const TAB_SPACES = "    ";
const STRUCTURAL_TAB_TYPES = ["listItem", "taskItem", "tableCell", "tableHeader"];
function insertParagraphAdjacent(editor, above) {
  const { state, view } = editor;
  if (!view.hasFocus()) return false;
  const $head = state.selection.$head;
  if ($head.depth < 1) return false;
  const pos = above ? $head.before(1) : $head.after(1);
  const tr = state.tr;
  tr.insert(pos, state.schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  view.dispatch(tr);
  return true;
}
const BlockNavigation = Extension.create({
  name: "blockNavigation",
  addOptions() {
    return {
      onExitToTitle: void 0
    };
  },
  addKeyboardShortcuts() {
    const editor = this.editor;
    const isSuggestionActive = () => {
      const pluginState = slashMenuPluginKey.getState(editor.state);
      return !!(pluginState && pluginState.active);
    };
    const isInFirstDocLeaf = ($head) => {
      for (let d = 0; d < $head.depth; d++) {
        if ($head.index(d) !== 0) return false;
      }
      return true;
    };
    const onArrowUp = () => {
      if (isSuggestionActive()) return false;
      const { state, view } = editor;
      if (!view.hasFocus()) return false;
      const { selection } = state;
      if (!selection.empty) return false;
      const $head = selection.$head;
      if ($head.depth < 1) return false;
      if (!isInFirstDocLeaf($head)) return false;
      const atTop = view.endOfTextblock("up", state) || $head.pos === $head.start(1);
      if (atTop) {
        this.options.onExitToTitle?.();
        return true;
      }
      return false;
    };
    const onArrowLeft = () => {
      if (isSuggestionActive()) return false;
      const { state, view } = editor;
      if (!view.hasFocus()) return false;
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
    const onArrowDown = () => {
      if (isSuggestionActive()) return false;
      const { state, view } = editor;
      if (!view.hasFocus()) return false;
      const { selection } = state;
      if (!selection.empty) return false;
      const $head = selection.$head;
      if ($head.depth < 1) return false;
      const parent = $head.parent;
      if (parent.type.name !== "codeBlock") return false;
      const isLastBlock = $head.after(1) >= state.doc.content.size;
      if (!isLastBlock) return false;
      const atBottom = view.endOfTextblock("down", state) || $head.pos === $head.end();
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
    const onBackspace = () => {
      if (!editor.view.hasFocus()) return false;
      return blockBehaviorRegistry.handleBackspace(editor);
    };
    const isInStructuralContainer = ($pos) => {
      for (let d = $pos.depth; d > 0; d--) {
        if (STRUCTURAL_TAB_TYPES.includes($pos.node(d).type.name)) return true;
      }
      return false;
    };
    const onTab = () => {
      if (isSuggestionActive()) return false;
      const { state, view } = editor;
      if (!view.hasFocus()) return false;
      const { selection } = state;
      const $head = selection.$head;
      if ($head.depth < 1) return false;
      if (isInStructuralContainer($head)) return false;
      const tr = state.tr;
      if (!selection.empty) tr.deleteSelection();
      tr.insertText(TAB_SPACES);
      view.dispatch(tr);
      return true;
    };
    const onShiftTab = () => {
      if (isSuggestionActive()) return false;
      const { state, view } = editor;
      if (!view.hasFocus()) return false;
      const { selection } = state;
      const $head = selection.$head;
      if ($head.depth < 1) return false;
      if (isInStructuralContainer($head)) return false;
      const pos = selection.from;
      const blockStart = $head.start();
      const textBefore = state.doc.textBetween(blockStart, pos, "\n", "\n");
      let remove = 0;
      for (let i = textBefore.length - 1; i >= 0 && remove < TAB_SPACES.length && textBefore[i] === " "; i--) {
        remove++;
      }
      if (remove > 0) {
        view.dispatch(state.tr.delete(pos - remove, pos));
      }
      return true;
    };
    const keymap = {
      ArrowUp: onArrowUp,
      ArrowLeft: onArrowLeft,
      ArrowDown: onArrowDown,
      Backspace: onBackspace,
      Tab: onTab,
      "Shift-Tab": onShiftTab
    };
    return keymap;
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleKeyDown: (_view, event) => {
            const binding = eventToBinding(event);
            if (!binding) return false;
            const overrides = useStore.getState().keyboardShortcuts;
            if (binding === resolveBinding("editor.insertBlockBelow", overrides)) {
              return insertParagraphAdjacent(editor, false);
            }
            if (binding === resolveBinding("editor.insertBlockAbove", overrides)) {
              return insertParagraphAdjacent(editor, true);
            }
            return false;
          }
        }
      })
    ];
  }
});
export {
  BlockNavigation
};
