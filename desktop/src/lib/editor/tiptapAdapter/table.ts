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
 * Walk a cell's children and collect every paragraph (including those nested
 * inside lists / blockquotes / other containers) as `RichText[][]`.
 *
 * Used to populate `TableCellData.content` for text-search and char-count
 * consumers when the cell holds non-paragraph block content stored
 * losslessly in `rawContent`.
 */
function collectCellParagraphs(nodes: JSONContent[]): RichText[][] {
  const paragraphs: RichText[][] = [];
  const walk = (node: JSONContent) => {
    if (node.type === 'paragraph') {
      paragraphs.push(tiptapInlineToRichText(node.content ?? []));
      return;
    }
    // Recurse into containers (bulletList, orderedList, taskList, listItem,
    // blockquote, etc.) so list-item text is still searchable / counted.
    if (node.content) {
      for (const child of node.content) walk(child);
    }
  };
  for (const n of nodes) walk(n);
  return paragraphs;
}

/**
 * Convert our `TableData` structure to TipTap nested table JSON.
 *
 * Cells with `rawContent` (non-paragraph block content like lists) are
 * restored verbatim; plain cells fall back to the `RichText[][]` paragraph
 * path.
 */
export function tableDataToTiptap(data: TableData): JSONContent[] {
  return data.rows.map((row) => ({
    type: 'tableRow',
    content: row.cells.map((cell) => {
      const cellType = row.isHeader ? 'tableHeader' : 'tableCell';
      const cellNode: JSONContent = {
        type: cellType,
      };

      if (cell.rawContent) {
        // Lossless path: preserve lists / headings / blockquotes in cells.
        cellNode.content = cell.rawContent;
      } else {
        // Plain paragraph path (backward compatible with old docs).
        cellNode.content = cell.content.map((paragraph) => {
          const paraNode: JSONContent = {
            type: 'paragraph',
            content: richTextToTiptapInline(paragraph),
          };
          if (cell.align) {
            paraNode.attrs = { textAlign: cell.align };
          }
          return paraNode;
        });
      }

      const attrs: Record<string, number | number[] | string> = {};
      if (cell.colspan && cell.colspan > 1) attrs.colspan = cell.colspan;
      if (cell.rowspan && cell.rowspan > 1) attrs.rowspan = cell.rowspan;
      if (cell.colwidth && cell.colwidth.length > 0) attrs.colwidth = cell.colwidth;
      if (cell.vAlign) attrs.vAlign = cell.vAlign;
      if (Object.keys(attrs).length > 0) cellNode.attrs = attrs;
      return cellNode;
    }),
  }));
}

/**
 * Convert TipTap nested table JSON back to our `TableData` structure.
 *
 * Cells with non-paragraph block content (lists, blockquotes, headings, etc.)
 * are stored losslessly in `rawContent`; their `content` is a best-effort
 * paragraph projection so text-search / char-count consumers keep working.
 * Plain paragraph cells use the original `RichText[][]` path (compact and
 * backward compatible with old docs).
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

      const children = cellNode.content ?? [];
      const hasNonParagraph = children.some((c) => c.type !== 'paragraph');

      const cell: TableCellData = { content: [] };

      if (hasNonParagraph) {
        // Lossless path: store full children, project paragraphs for search.
        cell.content = collectCellParagraphs(children);
        if (cell.content.length === 0) cell.content.push([]);
        cell.rawContent = children;
      } else {
        // Plain paragraph path (backward compatible, compact).
        let cellAlign: 'left' | 'center' | 'right' | undefined;
        for (const child of children) {
          if (child.type === 'paragraph') {
            cell.content.push(tiptapInlineToRichText(child.content ?? []));
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
        if (cell.content.length === 0) cell.content.push([]);
        if (cellAlign) cell.align = cellAlign;
      }

      const colspan = cellNode.attrs?.colspan;
      const rowspan = cellNode.attrs?.rowspan;
      if (typeof colspan === 'number' && colspan > 1) cell.colspan = colspan;
      if (typeof rowspan === 'number' && rowspan > 1) cell.rowspan = rowspan;
      // Preserve vertical alignment (cell-level attribute).
      const vAlign = cellNode.attrs?.vAlign;
      if (vAlign === 'top' || vAlign === 'middle' || vAlign === 'bottom') {
        cell.vAlign = vAlign;
      }
      // Preserve column widths set by the resize handle.
      const colwidth = cellNode.attrs?.colwidth;
      if (Array.isArray(colwidth) && colwidth.length > 0) {
        cell.colwidth = colwidth.filter((w) => typeof w === 'number');
      }
      cells.push(cell);
    }

    if (cells.length > 0) {
      rows.push({ isHeader, cells });
    }
  }

  return { rows };
}