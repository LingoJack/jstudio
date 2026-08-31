/**
 * SectionSearchHighlight — paints search-match highlights inside ONE section
 * editor, used by the cross-section find coordinator (useCrossSectionFind).
 *
 * Mirrors SectionHighlightSelection but accepts MULTIPLE match ranges plus an
 * `activeIndex` (which match is "current"). The active match gets a stronger
 * highlight class so the user can see where Cmd+G / Enter will jump next.
 *
 * The coordinator calls `setSectionSearchMatches(editor, matches, activeIndex)`
 * to paint and `setSectionSearchMatches(editor, [], null)` to clear. These
 * dispatch a metadata-only transaction (no doc change, no history entry), so
 * painting matches does NOT trigger the section's debounced save.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/react';

/** A single match range local to one section's ProseMirror doc. */
export interface SearchMatchRange {
  from: number;
  to: number;
}

/** Metadata payload used to update the decoration set. */
interface SearchMeta {
  matches: SearchMatchRange[];
  /** Index into `matches` that should get the active highlight class, or null. */
  activeIndex: number | null;
}

const searchKey = new PluginKey<DecorationSet>('sectionSearchHighlight');

export const SectionSearchHighlight = Extension.create({
  name: 'sectionSearchHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(searchKey) as SearchMeta | undefined;
            if (meta) {
              if (meta.matches.length === 0) {
                return DecorationSet.empty;
              }
              const decos = meta.matches.map((m, i) =>
                Decoration.inline(m.from, m.to, {
                  class:
                    i === meta.activeIndex
                      ? 'search-match search-match-active'
                      : 'search-match',
                }),
              );
              return DecorationSet.create(tr.doc, decos);
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
 * Paint search matches in the given editor, or clear them when `matches` is
 * empty. `activeIndex` is the index of the "current" match (gets a stronger
 * highlight class); pass null if none is current. Safe to call on a
 * destroyed/null editor.
 */
export function setSectionSearchMatches(
  editor: Editor | null | undefined,
  matches: SearchMatchRange[],
  activeIndex: number | null,
): void {
  if (!editor || editor.isDestroyed) return;
  const view = editor.view;
  if (!view) return;
  const tr = editor.state.tr.setMeta(searchKey, { matches, activeIndex });
  tr.setMeta('addToHistory', false);
  view.dispatch(tr);
}
