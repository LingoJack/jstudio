/**
 * SectionHighlightSelection — paints a visual highlight over a range of text
 * inside ONE section editor, used by the cross-section selection coordinator.
 *
 * Why this exists: the browser only maintains a single native Selection,
 * which lives inside the focused section's contenteditable. When a selection
 * spans several sections, only the focused (anchor) section shows a native
 * ::selection highlight; every other section involved has no DOM selection
 * to render. ProseMirror's built-in drawSelection plugin likewise only paints
 * when its view is focused. So we draw the highlight ourselves with an inline
 * Decoration on the non-focused sections.
 *
 * The coordinator calls `setSectionHighlight(editor, from, to)` to paint and
 * `setSectionHighlight(editor, null, null)` to clear. These dispatch a
 * metadata-only transaction (no doc change, no history entry), so painting
 * the highlight does NOT trigger the section's debounced save.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/react';

const highlightKey = new PluginKey<DecorationSet>(
  'sectionCrossSelectionHighlight',
);

export const SectionHighlightSelection = Extension.create({
  name: 'sectionHighlightSelection',
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
                  class: 'cross-section-selected',
                }),
              ]);
            }
            if (tr.docChanged) return old.map(tr.mapping, tr.doc);
            return old;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

/**
 * Paint a highlight over [from, to] in the given editor, or clear it when
 * either argument is null. Safe to call on a destroyed/null editor.
 */
export function setSectionHighlight(
  editor: Editor | null | undefined,
  from: number | null,
  to: number | null,
): void {
  if (!editor || editor.isDestroyed) return;
  const view = editor.view;
  if (!view) return;
  const tr = editor.state.tr.setMeta(highlightKey, { from, to });
  tr.setMeta('addToHistory', false);
  view.dispatch(tr);
}
