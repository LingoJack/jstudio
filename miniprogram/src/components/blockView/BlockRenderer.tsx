import { View } from '@tarojs/components'

import type { Block } from '../../lib/blocks/types'
import { CodeBlockView } from './CodeBlock'
import { CollapsibleBlockView } from './CollapsibleBlock'
import { FileBlockView } from './FileBlock'
import { ImageBlockView } from './ImageBlock'
import { BulletListView, OrderedListView, TodoListView } from './ListBlock'
import { DiagramPlaceholderView, MathBlockView } from './MediaPlaceholder'
import { DividerView, HeadingView, QuoteView, TextView, UnknownBlockView } from './TextBlocks'
import { TableBlockView } from './TableBlock'
import { LinkBlockView } from './LinkBlock'

/**
 * 块分发器：Block[] → 各类型只读组件。
 *
 * 标题相邻性：桌面端用 CSS 兄弟选择器把「标题紧跟标题」的上下 margin 归零
 * （vscode-theme.css:1140-1145），WXSS 不支持兄弟选择器，这里在渲染前算好
 * 每个标题块的 noTop / noBottom 再传入。
 */

function isHeading(block: Block): boolean {
  return block.type.startsWith('heading-')
}

function BlockItem({ block, noTop, noBottom }: { block: Block; noTop?: boolean; noBottom?: boolean }) {
  switch (block.type) {
    case 'text':
      return <TextView block={block} />
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
    case 'heading-4':
    case 'heading-5':
    case 'heading-6':
      return <HeadingView block={block} noTop={noTop} noBottom={noBottom} />
    case 'quote':
      return <QuoteView block={block} />
    case 'code':
      return <CodeBlockView block={block} />
    case 'image':
      return <ImageBlockView block={block} />
    case 'file':
      return <FileBlockView block={block} />
    case 'table':
      return <TableBlockView block={block} />
    case 'bullet-list':
      return <BulletListView block={block} />
    case 'ordered-list':
      return <OrderedListView block={block} />
    case 'todo-list':
      return <TodoListView block={block} />
    case 'divider':
      return <DividerView />
    case 'collapsible':
      return <CollapsibleBlockView block={block} />
    case 'link':
      return <LinkBlockView block={block} />
    case 'diagram':
      return <DiagramPlaceholderView block={block} />
    case 'math':
      return <MathBlockView block={block} />
    default:
      return <UnknownBlockView block={block} />
  }
}

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <View>
      {blocks.map((block, i) => {
        const prev = blocks[i - 1]
        const next = blocks[i + 1]
        const heading = isHeading(block)
        return (
          <BlockItem
            key={block.id ?? i}
            block={block}
            noTop={heading && prev !== undefined && isHeading(prev)}
            noBottom={heading && next !== undefined && isHeading(next)}
          />
        )
      })}
    </View>
  )
}
