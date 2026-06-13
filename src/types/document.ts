/** Block and document domain types */

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
  imageType?: 'url' | 'base64';
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
  content: string; // raw code for code blocks, file data URL for attachments, or markdown text
  properties?: BlockProperties;
}

export interface Document {
  id: string;
  title: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
  blocks: Block[];
  isFavorite?: boolean;
}

export interface Backlink {
  sourceId: string;
  sourceTitle: string;
  sourceEmoji: string;
}
