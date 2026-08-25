/**
 * ModClickCaretFix — treats Cmd/Ctrl+click as a plain click (caret only).
 *
 * ProseMirror has a deliberate "select the clicked node" gesture bound to
 * Cmd+click (macOS) / Ctrl+click (other platforms) — see `selectNodeModifier`
 * in prosemirror-view. For text blocks (paragraphs, list items) this paints a
 * `.ProseMirror-selectednode` frame around the whole block, which reads as an
 * unexpected "box popping up" rather than a useful selection. This plugin
 * intercepts the modifier-click before PM's own mousedown handler and just
 * collapses a caret at the clicked point instead.
 *
 * Shift+Cmd+click is left alone (shift+click range-extension still works).
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';

export const ModClickCaretFix = Extension.create({
  name: 'modClickCaretFix',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('modClickCaretFix'),
        props: {
          handleDOMEvents: {
            mousedown(view, event) {
              if (
                event.button !== 0 ||
                !(event.metaKey || event.ctrlKey) ||
                event.shiftKey
              ) {
                return false;
              }
              const pos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });
              if (!pos) return false;
              event.preventDefault();
              const tr = view.state.tr.setSelection(
                TextSelection.create(view.state.doc, pos.pos),
              );
              view.dispatch(tr);
              view.focus();
              return true;
            },
          },
        },
      }),
    ];
  },
});
