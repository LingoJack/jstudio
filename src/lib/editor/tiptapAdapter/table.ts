/**
 * Table data ↔ TipTap table JSON bidirectional conversion.
 *
 * Our `TableData` (rows with cells containing `RichText[][]` paragraphs) ↔
 * TipTap nested table JSON (`table > tableRow > (tableHeader|tableCell) > paragraph`).
 */

import type { JSONContent } from '@tiptap/react';
import type { TableData, TableRowData, TableCellData } from '../../../types/document';
import type { RichText } from '../../../types/richText';
import { richTextToTiptapInline, tiptapInlineToRichText } from './richText';

/**
 * Convert our `TableData` structure to TipTap nested table JSON.
 *
 * TableData.rows → tableNode.content: [
 *   { type: 'tableRow', content: [
 *     { type: 'tableHeader'|'tableCell', attrs: { colspan, rowspan },
 *       content: [ { type: 'paragraph', content: RichText→inline } ] }
 *   ]}
 * ]
 */
export function tableDataToTiptap(data: TableData): JSONContent[] {
  return data.rows.map((row) => ({
    type: 'tableRow',
    content: row.cells.map((cell) => {
      const cellType = row.isHeader ? 'tableHeader' : 'tableCell';
      const cellNode: JSONContent = {
        type: cellType,
        content: cell.content.map((paragraph) => {
          const paraNode: JSONContent = {
            type: 'paragraph',
            content: richTextToTiptapInline(paragraph),
          };
          if (cell.align) {
            paraNode.attrs = { textAlign: cell.align };
          }
          return paraNode;
        }),
      };
      const attrs: Record<string, number> = {};
      if (cell.colspan && cell.colspan > 1) attrs.colspan = cell.colspan;
      if (cell.rowspan && cell.rowspan > 1) attrs.rowspan = cell.rowspan;
      if (Object.keys(attrs).length > 0) cellNode.attrs = attrs;
      return cellNode;
    }),
  }));
}

/**
 * Convert TipTap nested table JSON back to our `TableData` structure.
 */
export function tiptapToTableData(node: JSONContent): TableData {
  const rows: TableRowData[] = [];

  for (const rowNode of node.content ?? []) {
    if (rowNode.type !== 'tableRow') continue;

    const cells: TableCellData[] = [];
    let isHeader = false;

    for (const cellNode of rowNode.content ?? []) {
      if (cellNode.type === 'tableHeader') isHeader = true;
      if (cellNode.type !== 'tableHeader' && cellNode.type !== 'tableCell') continue;

      const paragraphs: RichText[][] = [];
      let cellAlign: 'left' | 'center' | 'right' | undefined;
      for (const child of cellNode.content ?? []) {
        if (child.type === 'paragraph') {
          paragraphs.push(tiptapInlineToRichText(child.content ?? []));
          // Capture textAlign from the first paragraph that has it.
          const ta = child.attrs?.textAlign;
          if (
            !cellAlign &&
            (ta === 'left' || ta === 'center' || ta === 'right')
          ) {
            cellAlign = ta;
          }
        }
      }
      // Ensure at least one paragraph so empty cells stay editable.
      if (paragraphs.length === 0) paragraphs.push([]);

      const cell: TableCellData = { content: paragraphs };
      const colspan = cellNode.attrs?.colspan;
      const rowspan = cellNode.attrs?.rowspan;
      if (typeof colspan === 'number' && colspan > 1) cell.colspan = colspan;
      if (typeof rowspan === 'number' && rowspan > 1) cell.rowspan = rowspan;
      if (cellAlign) cell.align = cellAlign;
      cells.push(cell);
    }

    if (cells.length > 0) {
      rows.push({ isHeader, cells });
    }
  }

  return { rows };
}