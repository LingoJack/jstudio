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
 *   todo-list                    →   taskList
 *   divider                      →   horizontalRule
 *   collapsible                  →   collapsible
 *   diagram                      →   diagramBlock
 *
 *   OUR RICHTEXT ANNOTATIONS     →   TIPTAP MARKS
 *   ─────────────────────────────────────────────────────────
 *   bold                         →   bold
 *   italic                       →   italic
 *   underline                    →   underline
 *   strikethrough                →   strike
 *   code                         →   code
 *   color (≠ 'default')          →   textStyle (attrs.color)
 *   href                         →   link (attrs.href)
 */

import type { JSONContent } from '@tiptap/react';

import type { Block, BlockType, TableData, TableCellData, TableRowData, TodoItemData, ListItemData } from '../../types/document';
import type { RichText, RichTextAnnotations } from '../../types/richText';
import { isAssetPath } from '../content/assetUrl';

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
 * (bold, italic, underline, strike, code, textStyle, link).
 */
function annotationsToMarks(ann: RichTextAnnotations): TiptapMark[] {
  const marks: TiptapMark[] = [];

  if (ann.bold) marks.push({ type: 'bold' });
  if (ann.italic) marks.push({ type: 'italic' });
  if (ann.underline) marks.push({ type: 'underline' });
  if (ann.strikethrough) marks.push({ type: 'strike' });
  if (ann.code) marks.push({ type: 'code' });

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
    const marks = annotationsToMarks(seg.annotations ?? {});
    // A segment may contain soft line breaks (`\n`, from Shift+Enter). TipTap
    // represents these as `hardBreak` atom nodes, not as `\n` inside a text
    // node. Split on `\n` and interleave hardBreak nodes so the break
    // survives the round-trip instead of being silently dropped.
    const parts = seg.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) result.push({ type: 'hardBreak' });
      if (part) result.push({ type: 'text', text: part, marks });
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
    } else if (node.type === 'hardBreak') {
      // Soft line break (Shift+Enter). Encode as a `\n` segment so it
      // round-trips back to a hardBreak on the next load.
      result.push({ text: '\n', annotations: {} });
    }
    // Other inline types are ignored for now.
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
      case 'code':
        annotations.code = true;
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
    case 'todo-list':
      return 'taskList';
    case 'divider':
      return 'horizontalRule';
    case 'collapsible':
      return 'collapsible';
    case 'link':
      return 'linkBlock';
    case 'diagram':
      return 'diagramBlock';
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
    case 'taskList':
      return 'todo-list';
    case 'horizontalRule':
      return 'divider';
    case 'collapsible':
      return 'collapsible';
    case 'linkBlock':
      return 'link';
    case 'diagramBlock':
      return 'diagram';
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

// ---------------------------------------------------------------------------
// List helpers  (ListItemData[]  ⟷  TipTap bulletList/orderedList JSON)
//
// TipTap nests lists as:  listItem > [paragraph, (bulletList|orderedList)?]
// where the trailing sub-list holds the indented children. Our model mirrors
// this with `ListItemData { content, children }`. The nested sub-list kind
// follows the parent block type (we don't store a per-level kind).
// ---------------------------------------------------------------------------

/** Convert one `ListItemData` (and its descendants) to a TipTap `listItem`. */
function listItemToTiptap(
  item: ListItemData,
  listType: 'bulletList' | 'orderedList',
): JSONContent {
  const inline = richTextToTiptapInline(item.content ?? []);
  const content: JSONContent[] = [
    {
      type: 'paragraph',
      ...(inline.length > 0 ? { content: inline } : {}),
    },
  ];
  if (item.children && item.children.length > 0) {
    content.push({
      type: listType,
      content: item.children.map((child) => listItemToTiptap(child, listType)),
    });
  }
  return { type: 'listItem', content };
}

/** Read the children of a TipTap bulletList/orderedList node into our model. */
function tiptapToListItems(node: JSONContent): ListItemData[] {
  const items: ListItemData[] = [];
  for (const listItem of node.content ?? []) {
    if (listItem.type !== 'listItem') continue;

    const paragraphs: RichText[] = [];
    let children: ListItemData[] = [];
    for (const child of listItem.content ?? []) {
      if (child.type === 'paragraph') {
        // Merge multiple paragraphs in one item with a soft break so no text
        // is lost (rare, but possible after some edits / markdown imports).
        if (paragraphs.length > 0) paragraphs.push({ text: '\n', annotations: {} });
        paragraphs.push(...tiptapInlineToRichText(child.content ?? []));
      } else if (child.type === 'bulletList' || child.type === 'orderedList') {
        children = children.concat(tiptapToListItems(child));
      }
    }
    items.push({ content: paragraphs, children });
  }
  return items;
}

/**
 * Read flat legacy list content (`RichText[][]`) into the nested model.
 * Used when a document predates `properties.listItems`.
 */
function legacyFlatListToItems(flat: RichText[][]): ListItemData[] {
  return flat.map((content) => ({ content }));
}

/** Flatten the nested model back to legacy `RichText[][]` (top level only). */
function listItemsToFlat(items: ListItemData[]): RichText[][] {
  return items.map((item) => item.content ?? []);
}

// ---------------------------------------------------------------------------
// Todo helpers  (TodoItemData[]  ⟷  TipTap taskList JSON)
//
// TaskItem is configured `nested: true`, so TipTap nests as:
//   taskItem > [paragraph, taskList > taskItem...]
// We mirror that with `TodoItemData.children`.
// ---------------------------------------------------------------------------

/** Convert one `TodoItemData` (and descendants) to a TipTap `taskItem`. */
function todoItemToTiptap(item: TodoItemData): JSONContent {
  // Backward compat: old documents stored `text: string` instead of richText.
  const legacyText = (item as { text?: string }).text;
  const rich =
    item.richText ??
    (legacyText ? [{ text: legacyText, annotations: {} }] : []);
  const inline = richTextToTiptapInline(rich);
  const content: JSONContent[] = [
    {
      type: 'paragraph',
      ...(inline.length > 0 ? { content: inline } : {}),
    },
  ];
  if (item.children && item.children.length > 0) {
    content.push({
      type: 'taskList',
      content: item.children.map(todoItemToTiptap),
    });
  }
  return { type: 'taskItem', attrs: { checked: item.checked }, content };
}

/** Read the children of a TipTap taskList node into our model. */
function tiptapToTodoItems(node: JSONContent): TodoItemData[] {
  const items: TodoItemData[] = [];
  for (const taskItem of node.content ?? []) {
    if (taskItem.type !== 'taskItem') continue;
    const checked = taskItem.attrs?.checked === true;
    let richText: RichText[] = [];
    let children: TodoItemData[] = [];
    for (const child of taskItem.content ?? []) {
      if (child.type === 'paragraph') {
        if (richText.length > 0) richText.push({ text: '\n', annotations: {} });
        richText = richText.concat(tiptapInlineToRichText(child.content ?? []));
      } else if (child.type === 'taskList') {
        children = children.concat(tiptapToTodoItems(child));
      }
    }
    items.push({ checked, richText, children });
  }
  return items;
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
    attrs: {
      id: block.id,
    },
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
      json.attrs = { ...json.attrs, level: headingLevel(block.type) };
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
        ...json.attrs,
        language: block.properties?.language ?? 'plaintext',
        htmlPreview: block.properties?.codeHtmlPreview ?? false,
        maxHeightPct: block.properties?.codeMaxHeightPct ?? null,
        width: block.properties?.codeWidth ?? null,
        widthPct: block.properties?.codeWidthPct ?? null,
        height: block.properties?.codeHeight ?? null,
        heightPct: block.properties?.codeHeightPct ?? null,
      };
      break;
    }
    case 'image': {
      const src = typeof block.content === 'string' ? block.content : '';
      json.attrs = {
        ...json.attrs,
        src,
        alt: block.properties?.caption ?? '',
        width: block.properties?.width ?? null,
        widthPct: block.properties?.widthPct ?? null,
        height: block.properties?.height ?? null,
        heightPct: block.properties?.heightPct ?? null,
        align: block.properties?.align ?? 'center',
      };
      break;
    }
    case 'file': {
      const src = typeof block.content === 'string' ? block.content : '';
      json.attrs = {
        ...json.attrs,
        src,
        fileName: block.properties?.fileName ?? '',
        fileSize: block.properties?.fileSize ?? 0,
        fileType: block.properties?.fileType ?? '',
        displayMode: block.properties?.fileDisplayMode ?? 'card',
        width: block.properties?.fileWidth ?? null,
        widthPct: block.properties?.fileWidthPct ?? null,
        height: block.properties?.fileHeight ?? null,
        heightPct: block.properties?.fileHeightPct ?? null,
        align: block.properties?.fileAlign ?? 'center',
      };
      break;
    }
    case 'link': {
      const url = typeof block.content === 'string' ? block.content : '';
      json.attrs = {
        ...json.attrs,
        url,
        title: block.properties?.linkTitle ?? '',
        description: block.properties?.linkDescription ?? '',
        favicon: block.properties?.linkFavicon ?? '',
        ogImage: block.properties?.linkOgImage ?? '',
        siteName: block.properties?.linkSiteName ?? '',
        displayMode: block.properties?.linkDisplayMode ?? 'card',
        width: block.properties?.linkWidth ?? null,
        widthPct: block.properties?.linkWidthPct ?? null,
        align: block.properties?.linkAlign ?? 'center',
      };
      break;
    }
    case 'diagram': {
      json.attrs = {
        ...json.attrs,
        snapshot: block.properties?.diagramSnapshot ?? '',
        width: block.properties?.diagramWidth ?? null,
        widthPct: block.properties?.diagramWidthPct ?? null,
        height: block.properties?.diagramHeight ?? null,
        heightPct: block.properties?.diagramHeightPct ?? null,
        align: block.properties?.diagramAlign ?? 'center',
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
      const listType = block.type === 'bullet-list' ? 'bulletList' : 'orderedList';
      // Prefer the nested `listItems` model (source of truth). Fall back to
      // the flat `RichText[][]` in `content` for legacy documents that have
      // no `listItems` yet.
      const items =
        block.properties?.listItems ??
        legacyFlatListToItems(block.content as unknown as RichText[][]);
      json.content = items.map((item) => listItemToTiptap(item, listType));
      break;
    }
    case 'todo-list': {
      // Each todo item becomes a taskItem (with nested taskLists for children).
      const items = block.properties?.todoItems ?? [];
      json.content = items.map(todoItemToTiptap);
      break;
    }
    case 'divider': {
      // horizontalRule is an atom node — no content needed.
      break;
    }
    case 'collapsible': {
      json.attrs = {
        ...json.attrs,
        open: block.properties?.collapsibleOpen ?? true,
        summary: block.properties?.collapsibleSummary ?? '',
      };
      const children = block.properties?.collapsibleChildren as JSONContent[] | undefined;
      if (children && children.length > 0) {
        json.content = children;
      } else {
        json.content = [{ type: 'paragraph' }];
      }
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
      // paragraph per quote block), separating them with a line break so
      // multi-paragraph quotes don't get their text run together.
      const allInline: RichText[] = [];
      for (const child of node.content ?? []) {
        if (child.type === 'paragraph') {
          if (allInline.length > 0) allInline.push({ text: '\n', annotations: {} });
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
        codeHtmlPreview: attrs.htmlPreview === true ? true : undefined,
        codeMaxHeightPct:
          typeof attrs.maxHeightPct === 'number' ? attrs.maxHeightPct : undefined,
        codeWidth: typeof attrs.width === 'number' ? attrs.width : undefined,
        codeWidthPct: typeof attrs.widthPct === 'number' ? attrs.widthPct : undefined,
        codeHeight: typeof attrs.height === 'number' ? attrs.height : undefined,
        codeHeightPct:
          typeof attrs.heightPct === 'number' ? attrs.heightPct : undefined,
      };
      break;
    }
    case 'image': {
      const src = typeof attrs.src === 'string' ? attrs.src : '';
      const alt = typeof attrs.alt === 'string' ? attrs.alt : '';
      const width = typeof attrs.width === 'number' ? attrs.width : undefined;
      const widthPct = typeof attrs.widthPct === 'number' ? attrs.widthPct : undefined;
      const height = typeof attrs.height === 'number' ? attrs.height : undefined;
      const heightPct = typeof attrs.heightPct === 'number' ? attrs.heightPct : undefined;
      const align = attrs.align === 'left' || attrs.align === 'center' ? attrs.align : 'center';
      block.content = src;
      block.properties = {
        caption: alt,
        imageType: isAssetPath(src)
          ? 'asset'
          : src.startsWith('data:')
            ? 'base64'
            : 'url',
        width,
        widthPct,
        height,
        heightPct,
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
        fileWidthPct: typeof attrs.widthPct === 'number' ? attrs.widthPct : undefined,
        fileHeight: typeof attrs.height === 'number' ? attrs.height : undefined,
        fileHeightPct: typeof attrs.heightPct === 'number' ? attrs.heightPct : undefined,
        fileAlign:
          attrs.align === 'left' || attrs.align === 'center'
            ? attrs.align
            : 'center',
      };
      break;
    }
    case 'link': {
      const url = typeof attrs.url === 'string' ? attrs.url : '';
      block.content = url;
      block.properties = {
        linkTitle: typeof attrs.title === 'string' ? attrs.title : '',
        linkDescription:
          typeof attrs.description === 'string' ? attrs.description : '',
        linkFavicon: typeof attrs.favicon === 'string' ? attrs.favicon : '',
        linkOgImage: typeof attrs.ogImage === 'string' ? attrs.ogImage : '',
        linkSiteName: typeof attrs.siteName === 'string' ? attrs.siteName : '',
        linkDisplayMode:
          attrs.displayMode === 'preview' ? 'preview' : 'card',
        linkWidth:
          typeof attrs.width === 'number' ? attrs.width : undefined,
        linkWidthPct:
          typeof attrs.widthPct === 'number' ? attrs.widthPct : undefined,
        linkAlign:
          attrs.align === 'left' || attrs.align === 'center'
            ? attrs.align
            : 'center',
      };
      break;
    }
    case 'diagram': {
      block.content = [];
      block.properties = {
        diagramSnapshot:
          typeof attrs.snapshot === 'string' ? attrs.snapshot : '',
        diagramWidth:
          typeof attrs.width === 'number' ? attrs.width : undefined,
        diagramWidthPct:
          typeof attrs.widthPct === 'number' ? attrs.widthPct : undefined,
        diagramHeight:
          typeof attrs.height === 'number' ? attrs.height : undefined,
        diagramHeightPct:
          typeof attrs.heightPct === 'number' ? attrs.heightPct : undefined,
        diagramAlign:
          attrs.align === 'left' || attrs.align === 'center'
            ? attrs.align
            : 'center',
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
      // Read the full nested tree into `listItems` (source of truth), and
      // keep a flat `content` (top-level paragraphs) for backward compat with
      // legacy consumers that still read `Block.content`.
      const listItems = tiptapToListItems(node);
      block.properties = { listItems };
      block.content = listItemsToFlat(listItems) as unknown as RichText[] | string;
      break;
    }
    case 'todo-list': {
      // TipTap: taskList > taskItem(attrs.checked) > [paragraph, taskList?]
      // Our model: todoItems: { checked, richText, children }[]
      block.content = [];
      block.properties = { todoItems: tiptapToTodoItems(node) };
      break;
    }
    case 'divider': {
      block.content = [];
      break;
    }
    case 'collapsible': {
      block.content = [];
      block.properties = {
        collapsibleOpen: typeof attrs.open === 'boolean' ? attrs.open : true,
        collapsibleSummary: typeof attrs.summary === 'string' ? attrs.summary : '',
        // Store the full child node JSON so it round-trips losslessly.
        collapsibleChildren: node.content ?? [],
      };
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
