import { Table } from "@tiptap/extension-table";
import { ResizableTableView } from "./ResizableTableView";
const CollapsibleTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-collapsed") === "true",
        renderHTML: (attrs) => ({
          "data-collapsed": String(attrs.collapsed ?? false)
        })
      }
    };
  },
  addCommands() {
    return {
      ...this.parent?.(),
      toggleTableCollapsed: () => ({ state, dispatch }) => {
        const { $from } = state.selection;
        let depth = null;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === "table") {
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
            state.tr.setNodeMarkup(pos, void 0, {
              ...tableNode.attrs,
              collapsed
            })
          );
        }
        return true;
      }
    };
  },
  addNodeView() {
    const cellMinWidth = this.options.cellMinWidth;
    return ({ node, HTMLAttributes }) => new ResizableTableView(node, cellMinWidth, HTMLAttributes);
  }
});
export {
  CollapsibleTable
};
