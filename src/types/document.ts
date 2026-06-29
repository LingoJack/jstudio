/** Block and document domain types */

import type { RichText } from './richText';

export type BlockType =
  | 'text'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'quote'
  | 'code'
  | 'image'
  | 'file'
  | 'table'
  | 'bullet-list'
  | 'ordered-list'
  | 'todo-list'
  | 'divider'
  | 'collapsible'
  | 'link'
  | 'diagram';

export interface BlockProperties {
  /** Code block: syntax language. */
  language?: string;
  /** Code block (HTML): whether the rendered preview is shown instead of the source. */
  codeHtmlPreview?: boolean;
  /** Code block: maximum body height as percentage of viewport height (0-100). Legacy, parsed for backward-compat only. */
  codeMaxHeightPct?: number;
  /** Code block: display width in px (legacy). */
  codeWidth?: number;
  /** Code block: width as percentage of editor surface (0-100). Preferred. */
  codeWidthPct?: number;
  /** Code block: body/preview height in px (legacy). */
  codeHeight?: number;
  /** Code block: height as percentage of editor surface (0-100). Preferred. */
  codeHeightPct?: number;
  caption?: string; // image block caption
  imageType?: 'url' | 'base64' | 'asset';
  width?: number; // image display width (px, legacy)
  /** Image block: width as percentage of editor surface (0-100). Preferred. */
  widthPct?: number;
  height?: number; // image display height (px, legacy)
  /** Image block: height as percentage of editor surface (0-100). Preferred. */
  heightPct?: number;
  align?: 'left' | 'center'; // image alignment
  /** File attachment: MIME type of the uploaded file. */
  fileType?: string;
  /** File attachment: original file name. */
  fileName?: string;
  /** File attachment: file size in bytes. */
  fileSize?: number;
  /** File attachment: display mode — compact card or inline preview. */
  fileDisplayMode?: 'card' | 'preview';
  /** File attachment: preview display width (px, legacy). Undefined = auto. */
  fileWidth?: number;
  /** File attachment: width as percentage of editor surface (0-100). Preferred. */
  fileWidthPct?: number;
  /** File attachment: preview area height (px, legacy). Undefined = auto. */
  fileHeight?: number;
  /** File attachment: height as percentage of editor surface (0-100). Preferred. */
  fileHeightPct?: number;
  /** File attachment: alignment. */
  fileAlign?: 'left' | 'center';
  /** Table block: serialized table structure. */
  tableData?: TableData;
  /** Collapsible block: whether the body is expanded. */
  collapsibleOpen?: boolean;
  /** Collapsible block: the always-visible summary/title text. */
  collapsibleSummary?: string;
  /** Collapsible block: serialized TipTap JSONContent[] of child nodes. */
  collapsibleChildren?: unknown[];
  /**
   * Bullet / ordered list block: nested item tree.
   *
   * Preferred over the flat `RichText[][]` stored in `Block.content`, which
   * cannot represent nested (indented) sub-lists. When present, this is the
   * source of truth; `content` is kept only as a flat fallback for legacy
   * documents and non-editor consumers.
   */
  listItems?: ListItemData[];
  /** Todo list block: items array, each with checked state and text content. */
  todoItems?: TodoItemData[];
  /** Link block: target URL. */
  linkUrl?: string;
  /** Link block: page title. */
  linkTitle?: string;
  /** Link block: meta description. */
  linkDescription?: string;
  /** Link block: favicon URL. */
  linkFavicon?: string;
  /** Link block: OpenGraph image URL. */
  linkOgImage?: string;
  /** Link block: site name (from OG metadata). */
  linkSiteName?: string;
  /** Link block: display mode — card or inline preview. */
  linkDisplayMode?: 'card' | 'preview';
  /** Link block: preview display width (px). Undefined = auto. */
  linkWidth?: number;
  /** Link block: width as percentage of editor surface (0-100). Preferred over px. */
  linkWidthPct?: number;
  /** Link block: alignment. */
  linkAlign?: 'left' | 'center';
  /** Diagram block: serialized excalidraw scene JSON string. */
  diagramSnapshot?: string;
  /** Diagram block: display width (px, legacy). Undefined = auto. */
  diagramWidth?: number;
  /** Diagram block: width as percentage of editor surface (0-100). Preferred. */
  diagramWidthPct?: number;
  /** Diagram block: display height (px, legacy). Undefined = default 320. */
  diagramHeight?: number;
  /** Diagram block: height as percentage of editor surface (0-100). Preferred. */
  diagramHeightPct?: number;
  /** Diagram block: alignment. */
  diagramAlign?: 'left' | 'center';
}

export interface Block {
  id: string;
  type: BlockType;
  /**
   * Block content.
   *
   * - Text-type blocks (text, heading-*, callout, toggle): `RichText[]`
   *   — inline formatting is stored as an array of annotated text segments,
   *     not raw HTML.
   * - Code blocks: `RichText[]` where `content[0].text` holds the raw code.
   * - Media blocks (image): `string` resource path / URL.
   *
   * Legacy documents may still have `content` as a raw HTML string — the
   * migration layer (`migrate.ts`) converts these to `RichText[]` on load.
   */
  content: RichText[] | string;
  /**
   * Child block IDs — enables a block tree (nested blocks).
   * Undefined / empty means this block has no children (leaf block).
   */
  children?: string[];
  properties?: BlockProperties;
}

export interface Document {
  id: string;
  title: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
  blocks: Block[];
  isFavorite?: boolean; // deprecated, kept for backward compat
  folderId?: string | null;
}

// ---------------------------------------------------------------------------
// Table types
// ---------------------------------------------------------------------------

/** A single table cell. */
export interface TableCellData {
  /** Paragraphs inside the cell (each paragraph is a `RichText[]`). */
  content: RichText[][];
  /** Horizontal span (default 1). */
  colspan?: number;
  /** Vertical span (default 1). */
  rowspan?: number;
  /** Text alignment for all paragraphs in this cell. */
  align?: 'left' | 'center' | 'right';
}

/** A single table row. */
export interface TableRowData {
  /** Whether this row is a header row. */
  isHeader: boolean;
  /** Cells in this row. */
  cells: TableCellData[];
}

/** Serialized table structure stored in `BlockProperties.tableData`. */
export interface TableData {
  rows: TableRowData[];
}

/** A single todo list item, stored in `BlockProperties.todoItems`. */
export interface TodoItemData {
  /** Whether this item is checked off. */
  checked: boolean;
  /**
   * The rich text content of this todo item.
   *
   * Inline annotations (bold, italic, code, …) are stored per-segment so
   * they persist across save/load cycles — see `RichText`.
   *
   * For backward compatibility with old documents that stored a plain
   * `text: string`, loaders should detect `item.text` and wrap it.
   */
  richText: RichText[];
  /**
   * Nested sub-items (indented todos). Empty / undefined means a leaf item.
   * TaskItem is configured with `nested: true`, so the editor lets users
   * indent todos; this field is what makes that nesting survive a save.
   */
  children?: TodoItemData[];
}

/**
 * A single bullet / ordered list item, stored in `BlockProperties.listItems`.
 *
 * `content` is the item's own paragraph text; `children` are nested sub-list
 * items (indented). The nested list's ordered/bullet kind follows the parent
 * block type — we don't store a per-level kind because TipTap re-derives it.
 */
export interface ListItemData {
  /** The item's own inline text (one paragraph). */
  content: RichText[];
  /** Nested sub-items (indented). Empty / undefined means a leaf item. */
  children?: ListItemData[];
}
