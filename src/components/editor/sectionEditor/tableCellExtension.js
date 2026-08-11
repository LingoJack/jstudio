import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
function normalizeVerticalAlign(value) {
  if (value === "top" || value === "middle" || value === "bottom") {
    return value;
  }
  return null;
}
function createVAlignAttribute() {
  return {
    default: null,
    parseHTML: (element) => normalizeVerticalAlign(
      (element.style.verticalAlign || "").trim().toLowerCase()
    ),
    renderHTML: (attributes) => {
      if (!attributes.vAlign) return {};
      return { style: `vertical-align: ${attributes.vAlign}` };
    }
  };
}
const TableCellWithVAlign = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      vAlign: createVAlignAttribute()
    };
  }
});
const TableHeaderWithVAlign = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      vAlign: createVAlignAttribute()
    };
  }
});
export {
  TableCellWithVAlign,
  TableHeaderWithVAlign
};
