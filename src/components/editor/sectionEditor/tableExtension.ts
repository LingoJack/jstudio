/**
 * CollapsibleTable – extends TipTap's built-in Table extension with a
 * `collapsed` attribute and a `toggleTableCollapsed` command.
 *
 * When `collapsed` is true, only the first row (header or first data row) is
 * visible – it acts as a "header bar".  The collapse / expand toggle is
 * exposed in the `TableControls` floating toolbar (top-right corner, shown
 * when the cursor is inside the table) via the `toggleTableCollapsed`
 * command.  `ResizableTableView` only reflects the attribute on the wrapper
 * (`data-collapsed`, which drives the CSS that hides body rows) and freezes
 * column widths for the collapsed layout.
 */

import { Table } from '@tiptap/extension-table';
import type { Command, Editor } from '@tiptap/core';
import { ResizableTableView } from './ResizableTableView';

/**
 * List node types that own Tab semantics within a table cell. When the cursor
 * sits inside one of these, Tab/Shift+Tab should indent/outdent the list item
 * (delegated to the list extension's own keymap) rather than jump cells.
 *
 * Without this deferral, lists nested in cells can never be indented: the
 * stock Table handler's `goToNextCell` runs before TaskItem's `sinkListItem`
 * (registered later) and, for the first `listItem`, `sinkListItem` fails so
 * `goToNextCell` wins unconditionally.
 */
const LIST_TAB_OWNED_TYPES = new Set(['listItem', 'taskItem']);

/**
 * Returns true when the selection is a caret (or text range) inside a
 * `listItem` / `taskItem` that itself lives inside a table cell. CellSelection
 * (multi-cell range, exposed via `$anchorCell`) is excluded so cell-range
 * navigation still jumps cells.
 */
function isEditingListInCell(editor: Editor): boolean {
  const { selection } = editor.state;
  if ((selection as { $anchorCell?: unknown }).$anchorCell) return false;
  const $head = selection.$head;
  for (let d = $head.depth; d > 0; d--) {
    if (LIST_TAB_OWNED_TYPES.has($head.node(d).type.name)) return true;
  }
  return false;
}

// Register the custom command on TipTap's Commands interface so that
// `editor.commands.toggleTableCollapsed` / `editor.chain().toggleTableCollapsed()`
// are typed. A dedicated `collapsibleTable` namespace avoids clashing with the
// `table` namespace declared by @tiptap/extension-table.
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsibleTable: {
      /** Toggle the `collapsed` attribute of the table containing the selection. */
      toggleTableCollapsed: () => ReturnType;
    };
  }
}

export const CollapsibleTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-collapsed') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => ({
          'data-collapsed': String(attrs.collapsed ?? false),
        }),
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      toggleTableCollapsed:
        (): Command =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;

          // Walk up from the selection to find the enclosing table node.
          let depth: number | null = null;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'table') {
              depth = d;
              break;
            }
          }
          if (depth === null) return false;

          const pos = $from.before(depth);
          const tableNode = state.doc.nodeAt(pos);
          if (!tableNode) return false;

          const collapsed = !(tableNode.attrs.collapsed ?? false);
          if (dispatch) {
            dispatch(
              state.tr.setNodeMarkup(pos, undefined, {
                ...tableNode.attrs,
                collapsed,
              }),
            );
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    // Stock Table Tab/Shift-Tab handlers jump cells whenever the cursor is
    // anywhere inside a table — including inside a list nested in a cell,
    // which makes list indentation impossible (see LIST_TAB_OWNED_TYPES).
    // When editing a list inside a cell, return false so the list extension's
    // own sink/lift keymap handles the indent (or no-op if it can't). Keep the
    // stock cell-jump behavior everywhere else.
    return {
      ...this.parent?.(),
      Tab: () => {
        if (isEditingListInCell(this.editor)) return false;
        if (this.editor.commands.goToNextCell()) return true;
        if (!this.editor.can().addRowAfter()) return false;
        return this.editor.chain().addRowAfter().goToNextCell().run();
      },
      'Shift-Tab': () => {
        if (isEditingListInCell(this.editor)) return false;
        return this.editor.commands.goToPreviousCell();
      },
    };
  },

  addNodeView() {
    const cellMinWidth = this.options.cellMinWidth;
    return ({ node, HTMLAttributes }) =>
      new ResizableTableView(node, cellMinWidth, HTMLAttributes);
  },
});
