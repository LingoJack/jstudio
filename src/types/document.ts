/** Block and document domain types */

import type { RichText } from './richText';

export type BlockType =
  | 'text'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'code'
  | 'image'
  | 'file';

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
}
