/**
 * Block ↔ TipTap node JSON bidirectional conversion.
 *
 * Core conversion functions:
 * - `ourBlockToTiptapJSON(block)` → single TipTap node
 * - `tiptapJSONToOurBlock(node)` → single Block
 * - `ourBlocksToTiptapJSON(blocks)` → TipTap document content array
 * - `tiptapJSONToOurBlocks(nodes)` → Block array
 *
 * Plus type mapping helpers:
 * - `ourTypeToTiptapType(type)` → TipTap node type string
 * - `tiptapTypeToOurType(nodeType, attrs)` → our BlockType
 */

import type { JSONContent } from '@tiptap/react';
import type { Block, BlockType } from '../../../types/document';
import type { RichText } from '../../../types/richText';
import { isAssetPath } from '../content/assetUrl';
import { richTextToTiptapInline, tiptapInlineToRichText } from './richText';
import { tableDataToTiptap, tiptapToTableData } from './table';
import { listItemToTiptap, tiptapToListItems, legacyFlatListToItems, listItemsToFlat } from './list';
import { todoItemToTiptap, tiptapToTodoItems } from './todo';

// ---------------------------------------------------------------------------
// Type mapping helpers
// ---------------------------------------------------------------------------

/** Extract heading level from our heading-* type. */
export function headingLevel(type: BlockType): number {
  switch (type) {
    case 'heading-1':
      return 1;
    case 'heading-2':
      return 2;
    case 'heading-3':
      return 3;
    case 'heading-4':
      return 4;
    case 'heading-5':
      return 5;
    case 'heading-6':
      return 6;
    default:
      return 1;
  }
}

/** Map our `BlockType` to the corresponding TipTap node type string. */
function ourTypeToTiptapType(type: BlockType): string {
  switch (type) {
    case 'text':
      return 'paragraph';
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
    case 'heading-4':
    case 'heading-5':
    case 'heading-6':
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
    case 'math':
      return 'mathBlock';
    default:
      return 'paragraph';
  }
}

/** Map a TipTap node type (and attrs) back to our `BlockType`. */
function tiptapTypeToOurType(nodeType: string, attrs: Record<string, unknown>): BlockType {
  switch (nodeType) {
    case 'paragraph':
      return 'text';
    case 'heading':
      const level = attrs.level as number | undefined;
      if (level === 1) return 'heading-1';
      if (level === 2) return 'heading-2';
      if (level === 3) return 'heading-3';
      if (level === 4) return 'heading-4';
      if (level === 5) return 'heading-5';
      if (level === 6) return 'heading-6';
      return 'heading-1';
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
    case 'mathBlock':
      return 'math';
    default:
      return 'text';
  }
}

// ---------------------------------------------------------------------------
// Block → TipTap node
// ---------------------------------------------------------------------------

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
    case 'heading-3':
    case 'heading-4':
    case 'heading-5':
    case 'heading-6': {
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
      // ProseMirror rejects text nodes with an empty string ("RangeError:
      // Empty text nodes are not allowed"), which throws inside
      // createNodeFromContent and aborts the WHOLE section's setContent call
      // — not just this block. Only emit the text node when there's actual
      // text, same as the text/heading cases above (an empty codeBlock is a
      // valid ProseMirror node with zero children).
      if (code) {
        json.content = [{ type: 'text', text: code }];
      }
      json.attrs = {
        ...json.attrs,
        language: block.properties?.language ?? 'plaintext',
        collapsed: block.properties?.codeCollapsed ?? false,
        htmlPreview: block.properties?.codeHtmlPreview ?? false,
        maxHeightPct: block.properties?.codeMaxHeightPct ?? null,
        width: block.properties?.codeWidth ?? null,
        widthPct: block.properties?.codeWidthPct ?? null,
        height: block.properties?.codeHeight ?? null,
        heightPct: block.properties?.codeHeightPct ?? null,
        title: block.properties?.codeTitle ?? '',
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
    case 'math': {
      json.attrs = {
        ...json.attrs,
        latex: block.properties?.mathLatex ?? '',
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

// ---------------------------------------------------------------------------
// TipTap node → Block
// ---------------------------------------------------------------------------

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
    case 'heading-3':
    case 'heading-4':
    case 'heading-5':
    case 'heading-6': {
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
        codeCollapsed: attrs.collapsed === true ? true : undefined,
        codeHtmlPreview: attrs.htmlPreview === true ? true : undefined,
        codeMaxHeightPct:
          typeof attrs.maxHeightPct === 'number' ? attrs.maxHeightPct : undefined,
        codeWidth: typeof attrs.width === 'number' ? attrs.width : undefined,
        codeWidthPct: typeof attrs.widthPct === 'number' ? attrs.widthPct : undefined,
        codeHeight: typeof attrs.height === 'number' ? attrs.height : undefined,
        codeHeightPct:
          typeof attrs.heightPct === 'number' ? attrs.heightPct : undefined,
        codeTitle:
          typeof attrs.title === 'string' && attrs.title.length > 0
            ? attrs.title
            : undefined,
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
    case 'math': {
      block.content = [];
      block.properties = {
        mathLatex: typeof attrs.latex === 'string' ? attrs.latex : '',
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

/**
 * Strip the trailing empty paragraph that TrailingNode (StarterKit) auto-adds
 * at the end of each section's editor.
 *
 * In the sectioned editor architecture, each section is an independent TipTap
 * instance with its own TrailingNode. Without stripping, the auto-added
 * trailing paragraph gets persisted as a block. When multiple sections' blocks
 * are combined (or the document is reloaded), these trailing paragraphs from
 * non-last sections end up BETWEEN blocks — appearing as mysterious blank
 * lines between consecutive headings.
 *
 * Only strips the LAST block if it is an empty text block (paragraph with no
 * content). User-added empty paragraphs in the middle of the document are
 * never affected. If the section contains only a single empty paragraph, it
 * is preserved (to avoid empty sections).
 */
export function stripTrailingEmptyParagraph(blocks: Block[]): Block[] {
  if (blocks.length <= 1) return blocks;
  const last = blocks[blocks.length - 1];
  if (last.type !== 'text') return blocks;
  const content = last.content as RichText[];
  if (!content || content.length === 0) {
    return blocks.slice(0, -1);
  }
  return blocks;
}