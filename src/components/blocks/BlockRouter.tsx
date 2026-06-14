import { memo } from 'react';
import type { BlockType } from '../../types';
import type { BlockRouterProps } from './types';
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
  onDuplicateBlock,
  ...rest
}: BlockRouterProps) {
  const type = block.type as BlockType;
  const isTextBlock = TEXT_TYPES.has(type);

  let content: React.ReactNode;

  // Heading 1/2/3 → HeadingBlock with level
  if (type in HEADING_LEVELS) {
    content = (
      <HeadingBlock {...rest} block={block} level={HEADING_LEVELS[type]} />
    );
  } else {
    switch (type) {
      case 'text':
        content = <TextBlock {...rest} block={block} />;
        break;
      case 'callout':
        content = <CalloutBlock {...rest} block={block} />;
        break;
      case 'toggle':
        content = <ToggleBlock {...rest} block={block} />;
        break;
      case 'image':
        content = <ImageBlock {...rest} block={block} />;
        break;
      case 'table':
        content = <TableBlock {...rest} block={block} />;
        break;
      case 'canvas':
        content = <CanvasBlock {...rest} block={block} />;
        break;
      case 'whiteboard':
        content = <WhiteboardBlock {...rest} block={block} />;
        break;
      case 'code':
        content = <CodeBlockWrapper {...rest} block={block} />;
        break;
      case 'web-embed':
        content = <WebEmbedBlock block={block} onUpdateBlock={rest.onUpdateBlock} />;
        break;
      case 'attachment':
        content = <AttachmentBlock block={block} onUpdateBlock={rest.onUpdateBlock} />;
        break;
      default:
        content = <TextBlock {...rest} block={block} />;
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
          onAddBelow={() => rest.onInsertBlockBelow('text')}
          onDelete={() => rest.onDeleteBlock()}
          onDuplicate={() => onDuplicateBlock?.()}
          onConvertTo={(newType) =>
            rest.onUpdateBlock({ type: newType, properties: {} })
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
        onAddBelow={() => rest.onInsertBlockBelow('text')}
        onDelete={() => rest.onDeleteBlock()}
        onDuplicate={() => onDuplicateBlock?.()}
        onConvertTo={(newType) =>
          rest.onUpdateBlock({ type: newType, properties: {} })
        }
      />
      {content}
    </div>
  );
}

const BlockRouter = memo(BlockRouterInner);
export default BlockRouter;
