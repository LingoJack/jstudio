import { useState } from 'react'
import { Text, View } from '@tarojs/components'

import type { Block } from '../../lib/blocks/types'
import { flattenTiptapText } from '../../lib/blocks/snapshot'
import { RichTextView } from './RichTextView'

/**
 * 折叠块。桌面端（CollapsibleView.tsx）的 children 是 TipTap JSONContent[]，
 * 小程序无 ProseMirror，经 flattenTiptapText 降级为段落/标题文本行。
 * 视觉对齐：figure 16px 圆角 + 1px block-line-strong、header 16px 10px 内边距 +
 * block-line 底线、右侧 chevron 展开时旋转 90 度、body 16px 12px 内边距。
 */

export function CollapsibleBlockView({ block }: { block: Block }) {
  const props = block.properties ?? {}
  const [open, setOpen] = useState(props.collapsibleOpen === true)
  const lines = flattenTiptapText(props.collapsibleChildren ?? [])
  return (
    <View className='bv-collapsible'>
      <View
        className={`bv-collapsible-header${open ? '' : ' bv-collapsible-header-closed'}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Text className={`bv-collapsible-chevron${open ? ' bv-collapsible-chevron-open' : ''}`}>
          {'\u203a'}
        </Text>
        <View className='bv-collapsible-summary'>
          <Text userSelect>{props.collapsibleSummary ?? ''}</Text>
        </View>
      </View>
      {open && (
        <View className='bv-collapsible-body'>
          {lines.length === 0 ? (
            <Text className='bv-collapsible-empty'>（无内容）</Text>
          ) : (
            lines.map((line, i) => (
              <View
                key={i}
                className={`bv-p${line.level > 0 ? ` bv-inline-heading-${line.level}` : ''}`}
              >
                <RichTextView richText={line.richText} />
              </View>
            ))
          )}
        </View>
      )}
    </View>
  )
}
