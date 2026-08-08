/** Block and document domain types */

import type { RichText } from './richText';

export type BlockType =
  | 'text'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'heading-5'
  | 'heading-6'
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
  | 'diagram'
  | 'math';

// ---------------------------------------------------------------------------
// Block property interfaces (split by block type for better organization)
// ---------------------------------------------------------------------------

/** Code block properties. */
export interface CodeBlockProperties {
  /** Syntax language for highlighting. */
  language?: string;
  /** Whether the code body is collapsed (header still visible). */
  codeCollapsed?: boolean;
  /** Whether HTML preview is shown instead of source. */
  codeHtmlPreview?: boolean;
  /** Max body height as viewport percentage (legacy). */
  codeMaxHeightPct?: number;
  /** Display width in px (legacy). */
  codeWidth?: number;
  /** Width as percentage of editor surface (0-100). Preferred. */
  codeWidthPct?: number;
  /** Body/preview height in px (legacy). */
  codeHeight?: number;
  /** Height as percentage of editor surface (0-100). Preferred. */
  codeHeightPct?: number;
  /** Optional title/label shown in the header (visible even when collapsed). */
  codeTitle?: string;
}

/** Image block properties. */
export interface ImageBlockProperties {
  /** Image caption text. */
  caption?: string;
  /** Source type: external URL, base64 data, or local asset path. */
  imageType?: 'url' | 'base64' | 'asset';
  /** Display width in px (legacy). */
  width?: number;
  /** Width as percentage of editor surface (0-100). Preferred. */
  widthPct?: number;
  /** Display height in px (legacy). */
  height?: number;
  /** Height as percentage of editor surface (0-100). Preferred. */
  heightPct?: number;
  /** Horizontal alignment. */
  align?: 'left' | 'center';
}

/** File attachment block properties. */
export interface FileBlockProperties {
  /** MIME type of the uploaded file. */
  fileType?: string;
  /** Original file name. */
  fileName?: string;
  /** File size in bytes. */
  fileSize?: number;
  /** Display mode: compact card or inline preview. */
  fileDisplayMode?: 'card' | 'preview';
  /** Preview width in px (legacy). */
  fileWidth?: number;
  /** Width as percentage of editor surface (0-100). Preferred. */
  fileWidthPct?: number;
  /** Preview height in px (legacy). */
  fileHeight?: number;
  /** Height as percentage of editor surface (0-100). Preferred. */
  fileHeightPct?: number;
  /** Horizontal alignment. */
  fileAlign?: 'left' | 'center';
}

/** Table block properties. */
export interface TableBlockProperties {
  /** Serialized table structure (rows with cells). */
  tableData?: TableData;
}

/** Collapsible (toggle) block properties. */
export interface CollapsibleBlockProperties {
  /** Whether the body is expanded. */
  collapsibleOpen?: boolean;
  /** Always-visible summary/title text. */
  collapsibleSummary?: string;
  /** Serialized TipTap JSONContent[] of child nodes. */
  collapsibleChildren?: unknown[];
}

/** Bullet/ordered list block properties. */
export interface ListBlockProperties {
  /**
   * Nested item tree.
   *
   * Preferred over the flat `RichText[][]` stored in `Block.content`, which
   * cannot represent nested (indented) sub-lists. When present, this is the
   * source of truth; `content` is kept only as a flat fallback for legacy
   * documents and non-editor consumers.
   */
  listItems?: ListItemData[];
}

/** Todo (task) list block properties. */
export interface TodoBlockProperties {
  /** Items array, each with checked state and richText content. */
  todoItems?: TodoItemData[];
}

/** Link preview block properties. */
export interface LinkBlockProperties {
  /** Target URL. */
  linkUrl?: string;
  /** Page title (from OG metadata or <title>). */
  linkTitle?: string;
  /** Meta description. */
  linkDescription?: string;
  /** Favicon URL. */
  linkFavicon?: string;
  /** OpenGraph image URL. */
  linkOgImage?: string;
  /** Site name (from OG metadata). */
  linkSiteName?: string;
  /** Display mode: card or inline preview. */
  linkDisplayMode?: 'card' | 'preview';
  /** Preview width in px. */
  linkWidth?: number;
  /** Width as percentage of editor surface (0-100). Preferred over px. */
  linkWidthPct?: number;
  /** Horizontal alignment. */
  linkAlign?: 'left' | 'center';
}

/** Diagram (jgraph) block properties. */
export interface DiagramBlockProperties {
  /** Serialized diagram snapshot JSON string. */
  diagramSnapshot?: string;
  /** Display width in px (legacy). */
  diagramWidth?: number;
  /** Width as percentage of editor surface (0-100). Preferred. */
  diagramWidthPct?: number;
  /** Display height in px (legacy). */
  diagramHeight?: number;
  /** Height as percentage of editor surface (0-100). Preferred. */
  diagramHeightPct?: number;
  /** Horizontal alignment. */
  diagramAlign?: 'left' | 'center';
}

/** Math (LaTeX formula) block properties. */
export interface MathBlockProperties {
  /** LaTeX source string rendered via KaTeX. */
  mathLatex?: string;
}

/**
 * Aggregate block properties type.
 *
 * Combines all specialized property interfaces. Each block type only uses
 * a subset of these fields, but TypeScript doesn't enforce which subset
 * corresponds to which block type. This is a trade-off for simplicity:
 * the type system doesn't need to know the exact mapping, and the codebase
 * already has runtime guards for block type.
 *
 * New block types should add their properties to the corresponding interface
 * above, then include it in this aggregate type.
 */
export type BlockProperties =
  & CodeBlockProperties
  & ImageBlockProperties
  & FileBlockProperties
  & TableBlockProperties
  & CollapsibleBlockProperties
  & ListBlockProperties
  & TodoBlockProperties
  & LinkBlockProperties
  & DiagramBlockProperties
  & MathBlockProperties;

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
  /** Vertical alignment of cell content. */
  vAlign?: 'top' | 'middle' | 'bottom';
  /**
   * Column width(s) in pixels, set by dragging the column resize handle.
   *
   * When `colspan === 1` this is a single-element array `[width]`.
   * For spanned cells it contains one entry per spanned column.
   * Undefined means the column auto-sizes.
   */
  colwidth?: number[];
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
  /**
   * Whether the table body is collapsed (only the first row is visible).
   *
   * The first row acts as a "header bar" – a chevron toggle in its top-left
   * corner expands/collapses the remaining rows. Defaults to false.
   */
  collapsed?: boolean;
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
