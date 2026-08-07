/**
 * CollapsibleTable – extends TipTap's built-in Table extension with a
 * `collapsed` attribute and a `toggleTableCollapsed` command.
 *
 * When `collapsed` is true, only the first row (header or first data row) is
 * visible – it acts as a "header bar".  A chevron toggle in the top-left cell
 * corner (rendered by `ResizableTableView`) lets the user expand/collapse.
 *
 * The `addNodeView` override passes `getPos` to `ResizableTableView` so the
 * view can dispatch transactions to toggle the attribute without needing a
 * separate command invocation.
 */

import { Table } from '@tiptap/extension-table';
import type { Command } from '@tiptap/core';
import { ResizableTableView } from './ResizableTableView';

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

  addNodeView() {
    const cellMinWidth = this.options.cellMinWidth;
    return ({ node, getPos, HTMLAttributes, editor }) =>
      new ResizableTableView(
        node,
        cellMinWidth,
        editor.view,
        HTMLAttributes,
        getPos,
      );
  },
});
