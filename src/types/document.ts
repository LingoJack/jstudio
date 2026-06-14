/** Block and document domain types */

import type { RichText } from './richText';

export type BlockType =
  | 'text'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'code'
  | 'table'
  | 'canvas'
  | 'callout'
  | 'image'
  | 'toggle'
  | 'web-embed'
  | 'attachment'
  | 'whiteboard';

export interface CanvasPath {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export interface BlockProperties {
  language?: string;
  caption?: string;
  isOpen?: boolean; // toggle state
  tableData?: string[][]; // rows x columns for table type
  drawingPaths?: CanvasPath[]; // canvas drawing vector state
  emoji?: string; // callout block icon
  imageType?: 'url' | 'base64' | 'asset';
  /** URL input value of the web-embed block. When non-empty, the preview
   *  iframe loads this URL (auto-prefixed with `https://` if missing). */
  embedUrl?: string;
  /** File name of the attachment block. */
  attachmentName?: string;
  /** MIME type of the attachment block. */
  attachmentType?: string;
  /** Human-readable size of the attachment block (e.g. "12 KB"). */
  attachmentSize?: string;
  /** Display mode of the attachment block. */
  attachmentMode?: 'preview' | 'card';
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
   * - Media blocks (image, attachment, web-embed): `string` resource path / URL.
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
}
