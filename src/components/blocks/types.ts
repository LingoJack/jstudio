import type { Block, BlockType, Document } from '../../types';

/**
 * Props shared by every block-type component.
 *
 * Each block component receives the `block` data plus the editing callbacks
 * it needs. The `useBlockEditor` hook (used by text-like blocks) also needs
 * `documents`, `onDeleteBlock`, `onInsertBlockBelow`, and focus callbacks —
 * these are passed through `TextBlockProps`.
 */
export interface BaseBlockProps {
  block: Block;
  documents: Document[];
  onUpdateBlock: (updatedFields: Partial<Block>) => void;
  onDeleteBlock: (mergeContent?: string) => void;
  onNavigateToDoc: (docId: string) => void;
  onInsertBlockBelow: (type: BlockType) => void;
  onDuplicateBlock?: () => void;
  autoFocus?: boolean;
  onRequestFocusTitle?: () => boolean;
  onRequestFocusBlock?: (offset: number) => boolean;
}

export interface BlockRouterProps {
  block: Block;
  documents: Document[];
  onUpdateBlock: (blockId: string, updatedFields: Partial<Block>) => void;
  onDeleteBlock: (blockId: string, mergeContent?: string) => void;
  onNavigateToDoc: (docId: string) => void;
  onInsertBlockBelow: (blockId: string, type: BlockType) => void;
  onDuplicateBlock?: (blockId: string) => void;
  autoFocus?: boolean;
  forwardedRef?: (node: HTMLElement | null) => void;
  onRequestFocusTitle?: () => boolean;
  onRequestFocusBlock?: (offset: number) => boolean;
}

/**
 * Props for text-like blocks (text, heading, callout, toggle) that use
 * the `useBlockEditor` hook.
 */
export type TextBlockProps = BaseBlockProps;
