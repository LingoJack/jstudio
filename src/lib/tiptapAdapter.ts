/**
 * Data adapter — bidirectional conversion between our `Block[]` format
 * (Notion-like rich-text segments) and TipTap's `JSONContent[]` format
 * (ProseMirror-based document JSON).
 *
 * This is the single source of truth for format translation. Neither the
 * editor nor the store ever needs to know about the other's internal
 * representation.
 *
 * Mapping summary:
 *
 *   OUR BLOCK TYPES              →   TIPTAP NODE TYPES
 *   ─────────────────────────────────────────────────────────
 *   text                         →   paragraph
 *   heading-1/2/3                →   heading (attrs.level = 1/2/3)
 *   quote                        →   blockquote
 *   code                         →   codeBlock
 *   image                        →   image
 *   file                         →   fileBlock
 *   table                        →   table
 *   bullet-list                  →   bulletList
 *   ordered-list                 →   orderedList
 *
 *   OUR RICHTEXT ANNOTATIONS     →   TIPTAP MARKS
 *   ─────────────────────────────────────────────────────────
 *   bold                         →   bold
 *   italic                       →   italic
 *   underline                    →   underline
 *   strikethrough                →   strike
 *   color (≠ 'default')          →   textStyle (attrs.color)
 *   href                         →   link (attrs.href)
 */

import type { JSONContent } from '@tiptap/react';

import type { Block, BlockType, TableData, TableCellData, TableRowData } from '../types/document';
import type { RichText, RichTextAnnotations } from '../types/richText';

// ---------------------------------------------------------------------------
// Types (local helpers)
// ---------------------------------------------------------------------------

/** A TipTap mark with a concrete type and attrs. */
interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// RichText[]  ⟷  TipTap inline JSONContent[]
// ---------------------------------------------------------------------------

/**
 * Build the list of TipTap marks for a single `RichText` segment based on its
 * annotations.
 *
 * Order matters for rendering consistency: we emit marks in a stable order
 * (bold, italic, underline, strike, textStyle, link).
 */
function annotationsToMarks(ann: RichTextAnnotations): TiptapMark[] {
  const marks: TiptapMark[] = [];

  if (ann.bold) marks.push({ type: 'bold' });
  if (ann.italic) marks.push({ type: 'italic' });
  if (ann.underline) marks.push({ type: 'underline' });
  if (ann.strikethrough) marks.push({ type: 'strike' });

  if (ann.color && ann.color !== 'default') {
    marks.push({ type: 'textStyle', attrs: { color: ann.color } });
  }

  if (ann.href) {
    marks.push({ type: 'link', attrs: { href: ann.href } });
  }

  return marks;
}

/**
 * Convert our `RichText[]` to an array of TipTap inline `JSONContent` nodes.
 *
 * Each `RichText` segment becomes a text node with the appropriate marks.
 * Empty segments are skipped. If the array is empty an empty array is
 * returned (the caller can decide whether to emit an empty paragraph).
 */
export function richTextToTiptapInline(rich: RichText[]): JSONContent[] {
  if (!rich || rich.length === 0) return [];

  const result: JSONContent[] = [];

  for (const seg of rich) {
    if (!seg.text) continue;
    result.push({
      type: 'text',
      text: seg.text,
      marks: annotationsToMarks(seg.annotations ?? {}),
    });
  }

  return result;
}

/**
 * Convert an array of TipTap inline `JSONContent` nodes back to our
 * `RichText[]`.
 *
 * Handles text nodes and unwraps `link` nodes if present.
 */
export function tiptapInlineToRichText(nodes: JSONContent[]): RichText[] {
  if (!nodes || nodes.length === 0) return [];

  const result: RichText[] = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      const marks = (node.marks ?? []) as TiptapMark[];
      result.push({ text: node.text ?? '', annotations: marksToAnnotations(marks) });
    }
    // Other inline types (e.g. hardBreak) are ignored for now.
  }

  return result;
}

/** Map a list of TipTap marks back to our `RichTextAnnotations`. */
function marksToAnnotations(marks: TiptapMark[]): RichTextAnnotations {
  const annotations: RichTextAnnotations = {};

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        annotations.bold = true;
        break;
      case 'italic':
        annotations.italic = true;
        break;
      case 'underline':
        annotations.underline = true;
        break;
      case 'strike':
        annotations.strikethrough = true;
        break;
      case 'textStyle': {
        const color = mark.attrs?.color;
        if (typeof color === 'string') {
          annotations.color = color;
        }
        break;
      }
      case 'link': {
        const href = mark.attrs?.href;
        if (typeof href === 'string') {
          annotations.href = href;
        }
        break;
      }
      default:
        // Unknown marks are ignored.
        break;
    }
  }

  return annotations;
}

// ---------------------------------------------------------------------------
// Block  ⟷  TipTap JSONContent
// ---------------------------------------------------------------------------

/** Map our BlockType to a TipTap node type string. */
function ourTypeToTiptapType(type: BlockType): string {
  switch (type) {
    case 'text':
      return 'paragraph';
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
      return 'heading';
    case 'quote':
      return 'blockquote';
    case 'code':
      return 'codeBlock';
    case 'image':
      return 'image';
    case 'file':
      return 'fileBlock';
    case 'table':
      return 'table';
    case 'bullet-list':
      return 'bulletList';
    case 'ordered-list':
      return 'orderedList';
    case 'divider':
      return 'horizontalRule';
    default:
      return 'paragraph';
  }
}

/** Extract heading level (1/2/3) from our block type. */
function headingLevel(type: BlockType): 1 | 2 | 3 {
  if (type === 'heading-1') return 1;
  if (type === 'heading-2') return 2;
  return 3;
}

/** Map a TipTap node type string back to our BlockType. */
function tiptapTypeToOurType(
  nodeType: string,
  attrs?: Record<string, unknown>,
): BlockType {
  switch (nodeType) {
    case 'paragraph':
      return 'text';
    case 'heading': {
      const level = (attrs?.level as number) ?? 1;
      if (level <= 1) return 'heading-1';
      if (level === 2) return 'heading-2';
      return 'heading-3';
    }
    case 'blockquote':
      return 'quote';
    case 'codeBlock':
      return 'code';
    case 'image':
      return 'image';
    case 'fileBlock':
      return 'file';
    case 'table':
      return 'table';
    case 'bulletList':
      return 'bullet-list';
    case 'orderedList':
      return 'ordered-list';
    case 'horizontalRule':
      return 'divider';
    default:
      return 'text';
  }
}

// ---------------------------------------------------------------------------
// Table helpers  (TableData  ⟷  TipTap table JSON)
// ---------------------------------------------------------------------------

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
function tableDataToTiptap(data: TableData): JSONContent[] {
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
function tiptapToTableData(node: JSONContent): TableData {
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

/**
 * Convert one of our `Block`s to a TipTap `JSONContent` node.
 *
 * - Text-type blocks (text, heading-*) store `RichText[]` → inline text nodes.
 * - Code blocks store `RichText[]` (single segment) → inline text node with
 *   the raw code, and `language` in `attrs`.
 * - Image blocks store a string URL → `attrs.src` / `attrs.alt`.
 */
export function ourBlockToTiptapJSON(block: Block): JSONContent {
  const nodeType = ourTypeToTiptapType(block.type);

  const json: JSONContent = {
    type: nodeType,
  };

  switch (block.type) {
    case 'text': {
      const inline = richTextToTiptapInline(block.content as RichText[]);
      if (inline.length > 0) {
        json.content = inline;
      }
      break;
    }
    case 'heading-1':
    case 'heading-2':
    case 'heading-3': {
      json.attrs = { level: headingLevel(block.type) };
      const inline = richTextToTiptapInline(block.content as RichText[]);
      if (inline.length > 0) {
        json.content = inline;
      }
      break;
    }
    case 'quote': {
      // TipTap blockquote is a container whose content is one or more
      // paragraph nodes. We store our content as RichText[] (single
      // paragraph) and wrap it in a paragraph inside the blockquote.
      const inline = richTextToTiptapInline(block.content as RichText[]);
      json.content = [
        {
          type: 'paragraph',
          ...(inline.length > 0 ? { content: inline } : {}),
        },
      ];
      break;
    }
    case 'code': {
      const rich = block.content as RichText[];
      const code = rich[0]?.text ?? '';
      json.content = [{ type: 'text', text: code }];
      json.attrs = {
        language: block.properties?.language ?? 'plaintext',
      };
      break;
    }
    case 'image': {
      const src = typeof block.content === 'string' ? block.content : '';
      json.attrs = {
        src,
        alt: block.properties?.caption ?? '',
        width: block.properties?.width ?? null,
        height: block.properties?.height ?? null,
        align: block.properties?.align ?? 'center',
      };
      break;
    }
    case 'file': {
      const src = typeof block.content === 'string' ? block.content : '';
      json.attrs = {
        src,
        fileName: block.properties?.fileName ?? '',
        fileSize: block.properties?.fileSize ?? 0,
        fileType: block.properties?.fileType ?? '',
        displayMode: block.properties?.fileDisplayMode ?? 'card',
        width: block.properties?.fileWidth ?? null,
      };
      break;
    }
    case 'table': {
      const tableData = block.properties?.tableData;
      if (tableData) {
        json.content = tableDataToTiptap(tableData);
      }
      break;
    }
    case 'bullet-list':
    case 'ordered-list': {
      // content is RichText[][] — each element is one list item (paragraph).
      const items = block.content as unknown as RichText[][];
      json.content = items.map((item) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            ...(item.length > 0
              ? { content: richTextToTiptapInline(item) }
              : {}),
          },
        ],
      }));
      break;
    }
    case 'divider': {
      // horizontalRule is an atom node — no content needed.
      break;
    }
    default:
      // Fallback: treat as plain paragraph.
      break;
  }

  return json;
}

/**
 * Convert an array of our `Block`s to TipTap `JSONContent[]` (for use with
 * `editor.commands.setContent`).
 */
export function ourBlocksToTiptapJSON(blocks: Block[]): JSONContent[] {
  if (!blocks || blocks.length === 0) {
    // TipTap requires at least one block in the document.
    return [{ type: 'paragraph' }];
  }
  return blocks.map(ourBlockToTiptapJSON);
}

/**
 * Convert a single TipTap `JSONContent` node back to our `Block` format.
 */
export function tiptapJSONToOurBlock(node: JSONContent): Block {
  const nodeType = node.type ?? 'paragraph';
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const ourType = tiptapTypeToOurType(nodeType, attrs);

  const block: Block = {
    id: typeof node.attrs?.id === 'string' ? node.attrs.id : crypto.randomUUID(),
    type: ourType,
    content: [],
  };

  switch (ourType) {
    case 'text':
    case 'heading-1':
    case 'heading-2':
    case 'heading-3': {
      block.content = tiptapInlineToRichText(node.content ?? []);
      break;
    }
    case 'quote': {
      // TipTap blockquote contains paragraph nodes. We flatten all
      // paragraphs into a single RichText[] (our model stores one
      // paragraph per quote block).
      const allInline: RichText[] = [];
      for (const child of node.content ?? []) {
        if (child.type === 'paragraph') {
          const seg = tiptapInlineToRichText(child.content ?? []);
          allInline.push(...seg);
        }
      }
      block.content = allInline;
      break;
    }
    case 'code': {
      // Code block: extract raw text from inline text nodes.
      const children = node.content ?? [];
      const codeText = children
        .map((c) => (c.type === 'text' ? c.text ?? '' : ''))
        .join('');
      block.content = [{ text: codeText, annotations: {} }];
      block.properties = {
        language: (attrs.language as string) ?? 'plaintext',
      };
      break;
    }
    case 'image': {
      const src = typeof attrs.src === 'string' ? attrs.src : '';
      const alt = typeof attrs.alt === 'string' ? attrs.alt : '';
      const width = typeof attrs.width === 'number' ? attrs.width : undefined;
      const height = typeof attrs.height === 'number' ? attrs.height : undefined;
      const align = attrs.align === 'left' || attrs.align === 'center' ? attrs.align : 'center';
      block.content = src;
      block.properties = {
        caption: alt,
        imageType: 'url',
        width,
        height,
        align,
      };
      break;
    }
    case 'file': {
      const src = typeof attrs.src === 'string' ? attrs.src : '';
      block.content = src;
      block.properties = {
        fileName: typeof attrs.fileName === 'string' ? attrs.fileName : '',
        fileSize: typeof attrs.fileSize === 'number' ? attrs.fileSize : 0,
        fileType: typeof attrs.fileType === 'string' ? attrs.fileType : '',
        fileDisplayMode:
          attrs.displayMode === 'preview' ? 'preview' : 'card',
        fileWidth: typeof attrs.width === 'number' ? attrs.width : undefined,
      };
      break;
    }
    case 'table': {
      block.content = [];
      block.properties = {
        tableData: tiptapToTableData(node),
      };
      break;
    }
    case 'bullet-list':
    case 'ordered-list': {
      // TipTap: bulletList/orderedList > listItem > paragraph > inline text
      // Our model: RichText[][] — each item is one paragraph.
      const items: RichText[][] = [];
      for (const listItem of node.content ?? []) {
        if (listItem.type !== 'listItem') continue;
        for (const child of listItem.content ?? []) {
          if (child.type === 'paragraph') {
            items.push(tiptapInlineToRichText(child.content ?? []));
          }
        }
        // Ensure empty list items still get an entry
        if ((listItem.content ?? []).length === 0) {
          items.push([]);
        }
      }
      block.content = items as unknown as RichText[] | string;
      break;
    }
    case 'divider': {
      block.content = [];
      break;
    }
    default:
      // Unknown types default to an empty text block.
      break;
  }

  return block;
}

/**
 * Convert TipTap doc-level children (from `editor.getJSON().content`) to our
 * `Block[]` format.
 */
export function tiptapJSONToOurBlocks(nodes: JSONContent[]): Block[] {
  if (!nodes || nodes.length === 0) return [];
  return nodes.map(tiptapJSONToOurBlock);
}
