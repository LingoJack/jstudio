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
  autoFocus?: boolean;
  onRequestFocusTitle?: () => boolean;
  onRequestFocusBlock?: (offset: number) => boolean;
}

/**
 * Props for the block wrapper (BlockRouter). Identical to BaseBlockProps
 * but also forwards a ref to the outer div.
 */
export interface BlockRouterProps extends BaseBlockProps {
  forwardedRef?: React.Ref<HTMLDivElement>;
}

/**
 * Props for text-like blocks (text, heading, callout, toggle) that use
 * the `useBlockEditor` hook.
 */
export type TextBlockProps = BaseBlockProps;
