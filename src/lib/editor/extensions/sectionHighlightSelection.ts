/**
 * SectionHighlightSelection — paints a visual highlight over a range of text
 * inside ONE section editor. Two modes:
 *
 * 1. EXPLICIT (cross-section coordinator): the browser only maintains a
 *    single native Selection, which lives inside the focused section's
 *    contenteditable. When a selection spans several sections, every other
 *    section has no DOM selection to render. The coordinator calls
 *    `setSectionHighlight(editor, from, to)` to paint and
 *    `setSectionHighlight(editor, null, null)` to clear. These dispatch a
 *    metadata-only transaction (no doc change, no history entry), so painting
 *    the highlight does NOT trigger the section's debounced save.
 *
 * 2. MIRROR (within-section selections): any non-collapsed native
 *    TextSelection (mouse drag, shift+keys, double/triple click) is mirrored
 *    into the same `.cross-section-selected` decoration. The native
 *    ::selection paint is suppressed PERMANENTLY for the whole editor via
 *    `.ProseMirror ::selection { background: transparent }` (vscode-theme.css)
 *    — NOT by toggling a class, because WebKit's selection invalidation
 *    repaints stale full-width highlight bands when the ::selection rule
 *    flips mid-collapse. Without the mirror, drag selections show the native
 *    WebKit highlight — which over-extends to full block width at line ends
 *    and looks different from the custom style used for cross-section
 *    selections and Cmd+A. NodeSelections / CellSelections are NOT mirrored
 *    (they have their own chrome).
 *
 * The explicit mode wins: while the coordinator owns the decoration (during
 * a cross-section selection), native-selection changes are ignored until it
 * clears via `setSectionHighlight(editor, null, null)`.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/react';

interface HighlightState {
  deco: DecorationSet;
  /** true while the cross-section coordinator owns the decoration. */
  explicit: boolean;
}

const highlightKey = new PluginKey<HighlightState>(
  'sectionCrossSelectionHighlight',
);

export const SectionHighlightSelection = Extension.create({
  name: 'sectionHighlightSelection',
  addProseMirrorPlugins() {
    return [
      new Plugin<HighlightState>({
        key: highlightKey,
        state: {
          init: () => ({ deco: DecorationSet.empty, explicit: false }),
          apply(tr, old) {
            const meta = tr.getMeta(highlightKey) as
              | { from: number | null; to: number | null }
              | undefined;
            if (meta) {
              if (meta.from == null || meta.to == null) {
                return { deco: DecorationSet.empty, explicit: false };
              }
              return {
                deco: DecorationSet.create(tr.doc, [
                  Decoration.inline(meta.from, meta.to, {
                    class: 'cross-section-selected',
                  }),
                ]),
                explicit: true,
              };
            }
            if (old.explicit) {
              // Coordinator-owned: keep (mapping through doc changes) until
              // it explicitly clears.
              return tr.docChanged
                ? { deco: old.deco.map(tr.mapping, tr.doc), explicit: true }
                : old;
            }
            // Mirror the section's own native text selection.
            const sel = tr.selection;
            if (sel instanceof TextSelection && !sel.empty) {
              return {
                deco: DecorationSet.create(tr.doc, [
                  Decoration.inline(sel.from, sel.to, {
                    class: 'cross-section-selected',
                  }),
                ]),
                explicit: false,
              };
            }
            return { deco: DecorationSet.empty, explicit: false };
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.deco ?? null;
          },
        },
        view(view) {
          // On blur a mirrored highlight must not linger in an unfocused
          // section (focus changes don't dispatch transactions). Explicit
          // (coordinator-owned) paint is left alone — the coordinator
          // manages it.
          const onBlur = () => {
            const s = highlightKey.getState(view.state);
            if (s && !s.explicit && s.deco.find().length > 0) {
              const tr = view.state.tr.setMeta(highlightKey, {
                from: null,
                to: null,
              });
              tr.setMeta('addToHistory', false);
              view.dispatch(tr);
            }
          };
          // On (re)focus the PM selection is restored to the DOM — dispatch
          // an empty tr so apply() re-mirrors it.
          const onFocus = () => {
            const s = highlightKey.getState(view.state);
            if (s && s.explicit) return;
            const tr = view.state.tr.setMeta('addToHistory', false);
            view.dispatch(tr);
          };
          view.dom.addEventListener('blur', onBlur);
          view.dom.addEventListener('focus', onFocus);
          return {
            destroy() {
              view.dom.removeEventListener('blur', onBlur);
              view.dom.removeEventListener('focus', onFocus);
            },
          };
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
