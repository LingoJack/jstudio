import { Text, View } from '@tarojs/components'

import type { Block, RichText } from '../../lib/blocks/types'
import { RichTextView } from './RichTextView'

/**
 * 文本同构块：text / heading-1..6 / quote。
 * 样式规格逐值对齐桌面端 vscode-theme.css：
 * - 段落 p 的 margin 为 0（Tailwind preflight），段间距完全由 1.7 行高的步进提供。
 * - 标题 margin 上大下小（h1: 56/14px → h6: 14.4/7.2px），相邻标题之间 margin 归零
 *   （桌面端用 :is(h1..h6)+:is(h1..h6) 选择器实现，WXSS 无兄弟选择器，
 *   由 BlockRenderer 计算相邻性后传 noTop / noBottom）。
 * - quote：左侧 3px 边框 + 12px 16px 内边距 + descriptionForeground 文字。
 */

export interface TextBlockProps {
  block: Block
  /** 上一块也是标题 → 本块 margin-top 归零。 */
  noTop?: boolean
  /** 下一块也是标题 → 本块 margin-bottom 归零。 */
  noBottom?: boolean
}

/** 兼容遗留 content 为纯字符串的文档。 */
export function richTextOf(content: RichText[] | string): RichText[] {
  if (typeof content === 'string') {
    return [{ text: content, annotations: {} }]
  }
  return content
}

export function TextView({ block }: { block: Block }) {
  return (
    <View className='bv-p'>
      <RichTextView richText={richTextOf(block.content)} />
    </View>
  )
}

export function HeadingView({ block, noTop, noBottom }: TextBlockProps) {
  const level = Number(block.type.replace('heading-', ''))
  const cls = ['bv-h', `bv-h${level}`]
  if (noTop) {
    cls.push('bv-h-no-top')
  }
  if (noBottom) {
    cls.push('bv-h-no-bottom')
  }
  return (
    <View className={cls.join(' ')}>
      <RichTextView richText={richTextOf(block.content)} />
    </View>
  )
}

export function QuoteView({ block }: { block: Block }) {
  return (
    <View className='bv-blockquote'>
      <RichTextView richText={richTextOf(block.content)} />
    </View>
  )
}

export function DividerView() {
  return <View className='bv-hr' />
}

/** 未支持的块类型（桌面端未来新增）占位。 */
export function UnknownBlockView({ block }: { block: Block }) {
  return (
    <View className='bv-unknown'>
      <Text>暂不支持的块类型：{block.type}</Text>
    </View>
  )
}
