import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
const highlightKey = new PluginKey(
  "sectionCrossSelectionHighlight"
);
const SectionHighlightSelection = Extension.create({
  name: "sectionHighlightSelection",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: highlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(highlightKey);
            if (meta) {
              if (meta.from == null || meta.to == null) {
                return DecorationSet.empty;
              }
              return DecorationSet.create(tr.doc, [
                Decoration.inline(meta.from, meta.to, {
                  class: "cross-section-selected"
                })
              ]);
            }
            if (tr.docChanged) return old.map(tr.mapping, tr.doc);
            return old;
          }
        },
        props: {
          decorations(state) {
            return this.getState(state);
          }
        }
      })
    ];
  }
});
function setSectionHighlight(editor, from, to) {
  if (!editor || editor.isDestroyed) return;
  const view = editor.view;
  if (!view) return;
  const tr = editor.state.tr.setMeta(highlightKey, { from, to });
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}
export {
  SectionHighlightSelection,
  setSectionHighlight
};
