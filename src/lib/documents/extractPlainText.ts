/**
 * Extract plain text from a document's block tree for full-text search.
 *
 * Handles all 18 block types. Text content is spread across `Block.content`
 * and `Block.properties` depending on the block type – this function
 * normalises everything into a single searchable string.
 */

import type { Block } from '../../types/document';
import type { RichText } from '../../types/richText';
import type {
  ListItemData,
  TodoItemData,
  TableData,
} from '../../types/document';

/** Extract text from a `RichText[]` segment array. */
function richTextToText(segments: RichText[] | undefined | null): string {
  if (!segments || !Array.isArray(segments)) return '';
  return segments.map((rt) => rt?.text ?? '').join('');
}

/** Recursively extract text from list items (handles nested children). */
function listItemsToText(items: ListItemData[] | undefined): string {
  if (!items || !Array.isArray(items)) return '';
  const lines: string[] = [];
  for (const item of items) {
    const text = richTextToText(item.content);
    lines.push(text);
    if (item.children?.length) {
      lines.push(listItemsToText(item.children));
    }
  }
  return lines.join('\n');
}

/** Recursively extract text from todo items (handles nested children). */
function todoItemsToText(items: TodoItemData[] | undefined): string {
  if (!items || !Array.isArray(items)) return '';
  const lines: string[] = [];
  for (const item of items) {
    const text = richTextToText(item.richText);
    lines.push(text);
    if (item.children?.length) {
      lines.push(todoItemsToText(item.children));
    }
  }
  return lines.join('\n');
}

/** Extract text from table data (all cells, all rows). */
function tableToText(data: TableData | undefined): string {
  if (!data?.rows) return '';
  const lines: string[] = [];
  for (const row of data.rows) {
    const cellTexts = row.cells.map((cell) => {
      // cell.content is RichText[][] (paragraphs)
      if (!cell.content || !Array.isArray(cell.content)) return '';
      return cell.content
        .map((paragraph) => richTextToText(paragraph))
        .join(' ');
    });
    lines.push(cellTexts.join(' | '));
  }
  return lines.join('\n');
}

/**
 * Best-effort text extraction from an opaque TipTap JSONContent array
 * (used by collapsible children). Walks the node tree and collects text.
 */
function tiTapJsonToText(nodes: unknown[] | undefined): string {
  if (!nodes || !Array.isArray(nodes)) return '';
  const parts: string[] = [];
  for (const node of nodes) {
    if (typeof node !== 'object' || node === null) continue;
    const n = node as Record<string, unknown>;
    if (typeof n.text === 'string') {
      parts.push(n.text);
    }
    if (Array.isArray(n.content)) {
      parts.push(tiTapJsonToText(n.content as unknown[]));
    }
  }
  return parts.join('');
}

/** Extract searchable text from a single block. */
function blockToText(block: Block): string {
  switch (block.type) {
    case 'text':
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
    case 'heading-4':
    case 'heading-5':
    case 'heading-6':
    case 'quote':
    case 'code': {
      // content is RichText[] (or legacy string)
      if (typeof block.content === 'string') return block.content;
      return richTextToText(block.content);
    }

    case 'bullet-list':
    case 'ordered-list': {
      // Prefer listItems (supports nesting), fall back to flat content
      const props = block.properties;
      if (props?.listItems?.length) {
        return listItemsToText(props.listItems);
      }
      // Legacy flat fallback: content is RichText[][]
      if (Array.isArray(block.content)) {
        return (block.content as unknown as RichText[][])
          .map((para) => richTextToText(para))
          .join('\n');
      }
      return '';
    }

    case 'todo-list': {
      return todoItemsToText(block.properties?.todoItems);
    }

    case 'table': {
      return tableToText(block.properties?.tableData);
    }

    case 'collapsible': {
      const props = block.properties;
      const summary = props?.collapsibleSummary ?? '';
      const children = tiTapJsonToText(
        props?.collapsibleChildren as unknown[] | undefined,
      );
      return [summary, children].filter(Boolean).join('\n');
    }

    case 'link': {
      const props = block.properties;
      return [props?.linkTitle, props?.linkDescription]
        .filter(Boolean)
        .join(' ');
    }

    case 'math': {
      return block.properties?.mathLatex ?? '';
    }

    case 'image': {
      return block.properties?.caption ?? '';
    }

    case 'file': {
      return block.properties?.fileName ?? '';
    }

    // Blocks with no useful searchable text
    case 'divider':
    case 'diagram':
      return '';

    default:
      return '';
  }
}

/**
 * Extract a single plain-text string from a document's block array.
 *
 * Each block's text is joined with a newline so that snippet extraction
 * can use newline boundaries for cleaner context windows.
 */
export function extractPlainText(blocks: Block[] | undefined | null): string {
  if (!blocks || !Array.isArray(blocks)) return '';
  return blocks.map(blockToText).filter(Boolean).join('\n');
}
