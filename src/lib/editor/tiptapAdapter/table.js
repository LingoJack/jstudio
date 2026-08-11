import { richTextToTiptapInline, tiptapInlineToRichText } from "./richText";
function tableDataToTiptap(data) {
  return data.rows.map((row) => ({
    type: "tableRow",
    content: row.cells.map((cell) => {
      const cellType = row.isHeader ? "tableHeader" : "tableCell";
      const cellNode = {
        type: cellType,
        content: cell.content.map((paragraph) => {
          const paraNode = {
            type: "paragraph",
            content: richTextToTiptapInline(paragraph)
          };
          if (cell.align) {
            paraNode.attrs = { textAlign: cell.align };
          }
          return paraNode;
        })
      };
      const attrs = {};
      if (cell.colspan && cell.colspan > 1) attrs.colspan = cell.colspan;
      if (cell.rowspan && cell.rowspan > 1) attrs.rowspan = cell.rowspan;
      if (cell.colwidth && cell.colwidth.length > 0) attrs.colwidth = cell.colwidth;
      if (cell.vAlign) attrs.vAlign = cell.vAlign;
      if (Object.keys(attrs).length > 0) cellNode.attrs = attrs;
      return cellNode;
    })
  }));
}
function tiptapToTableData(node) {
  const rows = [];
  for (const rowNode of node.content ?? []) {
    if (rowNode.type !== "tableRow") continue;
    const cells = [];
    let isHeader = false;
    for (const cellNode of rowNode.content ?? []) {
      if (cellNode.type === "tableHeader") isHeader = true;
      if (cellNode.type !== "tableHeader" && cellNode.type !== "tableCell") continue;
      const paragraphs = [];
      let cellAlign;
      for (const child of cellNode.content ?? []) {
        if (child.type === "paragraph") {
          paragraphs.push(tiptapInlineToRichText(child.content ?? []));
          const ta = child.attrs?.textAlign;
          if (!cellAlign && (ta === "left" || ta === "center" || ta === "right")) {
            cellAlign = ta;
          }
        }
      }
      if (paragraphs.length === 0) paragraphs.push([]);
      const cell = { content: paragraphs };
      const colspan = cellNode.attrs?.colspan;
      const rowspan = cellNode.attrs?.rowspan;
      if (typeof colspan === "number" && colspan > 1) cell.colspan = colspan;
      if (typeof rowspan === "number" && rowspan > 1) cell.rowspan = rowspan;
      if (cellAlign) cell.align = cellAlign;
      const vAlign = cellNode.attrs?.vAlign;
      if (vAlign === "top" || vAlign === "middle" || vAlign === "bottom") {
        cell.vAlign = vAlign;
      }
      const colwidth = cellNode.attrs?.colwidth;
      if (Array.isArray(colwidth) && colwidth.length > 0) {
        cell.colwidth = colwidth.filter((w) => typeof w === "number");
      }
      cells.push(cell);
    }
    if (cells.length > 0) {
      rows.push({ isHeader, cells });
    }
  }
  return { rows };
}
export {
  tableDataToTiptap,
  tiptapToTableData
};
