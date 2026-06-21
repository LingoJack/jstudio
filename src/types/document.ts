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
  | 'divider'
  | 'collapsible'
  | 'link'
  | 'diagram';

export interface BlockProperties {
  language?: string; // code block syntax
  caption?: string; // image block caption
  imageType?: 'url' | 'base64' | 'asset';
  width?: number; // image display width (px)
  height?: number; // image display height (px)
  align?: 'left' | 'center'; // image alignment
  /** File attachment: MIME type of the uploaded file. */
  fileType?: string;
  /** File attachment: original file name. */
  fileName?: string;
  /** File attachment: file size in bytes. */
  fileSize?: number;
  /** File attachment: display mode — compact card or inline preview. */
  fileDisplayMode?: 'card' | 'preview';
  /** File attachment: preview display width (px). Undefined = auto. */
  fileWidth?: number;
  /** Table block: serialized table structure. */
  tableData?: TableData;
  /** Collapsible block: whether the body is expanded. */
  collapsibleOpen?: boolean;
  /** Collapsible block: the always-visible summary/title text. */
  collapsibleSummary?: string;
  /** Collapsible block: serialized TipTap JSONContent[] of child nodes. */
  collapsibleChildren?: unknown[];
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
  /** Link block: alignment. */
  linkAlign?: 'left' | 'center';
  /** Diagram block: serialized excalidraw scene JSON string. */
  diagramSnapshot?: string;
  /** Diagram block: display width (px). Undefined = auto. */
  diagramWidth?: number;
  /** Diagram block: display height (px). Undefined = default 320. */
  diagramHeight?: number;
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
