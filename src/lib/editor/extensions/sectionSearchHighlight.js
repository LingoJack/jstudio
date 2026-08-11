import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
const searchKey = new PluginKey("sectionSearchHighlight");
const SectionSearchHighlight = Extension.create({
  name: "sectionSearchHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(searchKey);
            if (meta) {
              if (meta.matches.length === 0) {
                return DecorationSet.empty;
              }
              const decos = meta.matches.map(
                (m, i) => Decoration.inline(m.from, m.to, {
                  class: i === meta.activeIndex ? "search-match search-match-active" : "search-match"
                })
              );
              return DecorationSet.create(tr.doc, decos);
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
function setSectionSearchMatches(editor, matches, activeIndex) {
  if (!editor || editor.isDestroyed) return;
  const view = editor.view;
  if (!view) return;
  const tr = editor.state.tr.setMeta(searchKey, { matches, activeIndex });
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}
export {
  SectionSearchHighlight,
  setSectionSearchMatches
};
