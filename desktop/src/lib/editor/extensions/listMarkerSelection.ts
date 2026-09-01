/**
 * ListMarkerSelection — makes list markers clickable: clicking a bullet /
 * number marker selects the WHOLE list item as a node selection, so copying
 * it produces the markdown list item ('- item') instead of plain text.
 *
 * The markers themselves are still painted by native CSS `list-style` (see
 * vscode-theme.css); this extension only adds a transparent click-target
 * widget over each marker area (positioned into the ul/ol padding zone via
 * the `.list-marker-hitbox` CSS rule). A plain text selection inside the
 * item never carries the marker — see serializeSliceToMarkdown.ts.
 *
 * taskItem nodes are skipped on purpose: they already have their own
 * checkbox hit target.
 */

import { Extension } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

const LIST_ITEM_TYPE = 'listItem';
const HITBOX_CLASS = 'list-marker-hitbox';

/** Create the transparent marker click-target for one listItem. */
function createHitbox(
  view: EditorView,
  getPos: () => number | undefined,
): HTMLElement {
  const hitbox = document.createElement('span');
  hitbox.className = HITBOX_CLASS;
  hitbox.setAttribute('aria-hidden', 'true');
  // Widgets inherit contenteditable=true from the editor root; make the
  // hitbox atomic so text input/selection never lands inside it.
  hitbox.contentEditable = 'false';
  hitbox.draggable = false;

  hitbox.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    // Swallow the gesture entirely: ProseMirror's own mousedown handling
    // (bubble phase on view.dom) must not place a caret / start a text
    // selection, and the browser must not begin a native drag-selection.
    event.preventDefault();
    event.stopPropagation();
    const widgetPos = getPos();
    if (widgetPos == null) return;
    const { state } = view;
    const $pos = state.doc.resolve(widgetPos);
    for (let depth = $pos.depth; depth > 0; depth--) {
      if ($pos.node(depth).type.name !== LIST_ITEM_TYPE) continue;
      view.dispatch(
        state.tr.setSelection(
          NodeSelection.create(state.doc, $pos.before(depth)),
        ),
      );
      view.focus();
      return;
    }
  });

  return hitbox;
}

export const ListMarkerSelection = Extension.create({
  name: 'listMarkerSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('listMarkerSelection'),
        props: {
          decorations(state) {
            const hitboxes: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== LIST_ITEM_TYPE) return true;
              hitboxes.push(
                Decoration.widget(pos + 1, createHitbox, {
                  // Place before the item's first paragraph so the widget DOM
                  // is a direct child of the <li> (required for the absolute
                  // positioning against the li's marker zone).
                  side: -1,
                  ignoreSelection: true,
                  key: `list-marker-${pos}`,
                }),
              );
              // Descend — nested lists have their own items to cover.
              return true;
            });
            return DecorationSet.create(state.doc, hitboxes);
          },
        },
      }),
    ];
  },
});
