import { memo, useCallback } from 'react';
import type { Block, BlockType, RichText } from '../../types';
import type { BaseBlockProps, BlockRouterProps } from './types';
import TextBlock from './TextBlock';
import HeadingBlock from './HeadingBlock';
import CalloutBlock from './CalloutBlock';
import ToggleBlock from './ToggleBlock';
import ImageBlock from './ImageBlock';
import TableBlock from './TableBlock';
import CanvasBlock from './CanvasBlock';
import WhiteboardBlock from './WhiteboardBlock';
import CodeBlockWrapper from './CodeBlockWrapper';
import WebEmbedBlock from './WebEmbedBlock';
import AttachmentBlock from './AttachmentBlock';
import BlockHandle from './BlockHandle';

const HEADING_LEVELS: Record<string, 1 | 2 | 3> = {
  'heading-1': 1,
  'heading-2': 2,
  'heading-3': 3,
};

/** Block types that are pure text and participate in the surface editing. */
const TEXT_TYPES = new Set(['text', 'heading-1', 'heading-2', 'heading-3', 'callout', 'toggle']);

/**
 * The central dispatcher.
 *
 * **Surface architecture**: the parent container is one contentEditable.
 * Text blocks (text, heading, callout, toggle) are plain <div> children
 * that participate in the surface — enabling native cross-block selection.
 *
 * Non-text blocks (image, table, code, etc.) are wrapped in a
 * `contentEditable=false` island so the browser treats them as atomic
 * objects that can be selected/navigated as a unit.
 */
function BlockRouterInner({
  block,
  forwardedRef,
  onUpdateBlock,
  onDeleteBlock,
  onInsertBlockBelow,
  onDuplicateBlock,
  ...rest
}: BlockRouterProps) {
  const type = block.type as BlockType;
  const isTextBlock = TEXT_TYPES.has(type);

  // Stable callbacks bound to this block's ID — created once per block.
  // The parent passes stable (blockId, ...) callbacks so memo isn't broken.
  const boundUpdate = useCallback(
    (fields: Partial<Block>) => onUpdateBlock(block.id, fields),
    [block.id, onUpdateBlock],
  );
  const boundDelete = useCallback(
    (mergeContent?: RichText[]) => onDeleteBlock(block.id, mergeContent),
    [block.id, onDeleteBlock],
  );
  const boundInsertBelow = useCallback(
    (t: BlockType) => onInsertBlockBelow(block.id, t),
    [block.id, onInsertBlockBelow],
  );
  const boundDuplicate = useCallback(
    () => onDuplicateBlock?.(block.id),
    [block.id, onDuplicateBlock],
  );

  // Build the props that every block type needs.
  const blockProps: BaseBlockProps = {
    ...rest,
    block,
    onUpdateBlock: boundUpdate,
    onDeleteBlock: boundDelete,
    onInsertBlockBelow: boundInsertBelow,
  };

  let content: React.ReactNode;

  // Heading 1/2/3 → HeadingBlock with level
  if (type in HEADING_LEVELS) {
    content = (
      <HeadingBlock
        {...blockProps}
        level={HEADING_LEVELS[type]}
      />
    );
  } else {
    switch (type) {
      case 'text':
        content = <TextBlock {...blockProps} />;
        break;
      case 'callout':
        content = <CalloutBlock {...blockProps} />;
        break;
      case 'toggle':
        content = <ToggleBlock {...blockProps} />;
        break;
      case 'image':
        content = <ImageBlock {...blockProps} />;
        break;
      case 'table':
        content = <TableBlock {...blockProps} />;
        break;
      case 'canvas':
        content = <CanvasBlock {...blockProps} />;
        break;
      case 'whiteboard':
        content = <WhiteboardBlock {...blockProps} />;
        break;
      case 'code':
        content = <CodeBlockWrapper {...blockProps} />;
        break;
      case 'web-embed':
        content = (
          <WebEmbedBlock
            block={block}
            onUpdateBlock={boundUpdate}
          />
        );
        break;
      case 'attachment':
        content = (
          <AttachmentBlock
            block={block}
            onUpdateBlock={boundUpdate}
          />
        );
        break;
      default:
        content = <TextBlock {...blockProps} />;
    }
  }

  // Non-text blocks: wrap in contentEditable=false island
  if (!isTextBlock) {
    return (
      <div
        ref={forwardedRef}
        data-block-id={block.id}
        data-block-type={type}
        data-block-island="true"
        className="block-wrapper group/block relative"
      >
        <BlockHandle
          blockType={type}
          onAddBelow={() => boundInsertBelow('text')}
          onDelete={() => boundDelete()}
          onDuplicate={() => boundDuplicate()}
          onConvertTo={(newType) =>
            boundUpdate({ type: newType, properties: {} })
          }
        />
        <div contentEditable={false}>
          {content}
        </div>
      </div>
    );
  }

  // Text blocks: direct children of the surface
  return (
    <div
      ref={forwardedRef}
      data-block-id={block.id}
      data-block-type={type}
      className="block-wrapper group/block relative"
    >
      <BlockHandle
        blockType={type}
        onAddBelow={() => boundInsertBelow('text')}
        onDelete={() => boundDelete()}
        onDuplicate={() => boundDuplicate()}
        onConvertTo={(newType) =>
          boundUpdate({ type: newType, properties: {} })
        }
      />
      {content}
    </div>
  );
}

const BlockRouter = memo(BlockRouterInner);
export default BlockRouter;
