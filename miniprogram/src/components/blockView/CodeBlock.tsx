import { ScrollView, Text, View } from '@tarojs/components'

import type { Block } from '../../lib/blocks/types'
import { richTextOf } from './TextBlocks'

/**
 * 代码块（只读，不做语法高亮——桌面端的 hljs token 色板不移植，
 * 源码以等宽 13px / 行高 1.6 白底呈现，横向滚动）。
 * 样式规格对齐 vscode-theme.css:1736-1935：容器 16px 圆角、
 * 1px block-line-strong 边框、header 6px 8px + 底部 block-line 分割线、
 * 语言徽章 11px 大写字距 0.04em。
 */

/** code 块的源码存于 content[0].text（见 desktop types/document.ts:208）。 */
function codeSource(block: Block): string {
  const rich = richTextOf(block.content)
  return rich.map((seg) => seg.text).join('')
}

export function CodeBlockView({ block }: { block: Block }) {
  const props = block.properties ?? {}
  const collapsed = props.codeCollapsed === true
  const hasHeader = Boolean(props.codeTitle) || Boolean(props.language)
  return (
    <View className={`bv-code-wrapper${collapsed ? ' bv-code-collapsed' : ''}`}>
      <View className='bv-code-figure'>
        {hasHeader && (
          <View className='bv-code-header'>
            <View className='bv-code-title'>
              <Text userSelect>{props.codeTitle ?? ''}</Text>
            </View>
            {props.language && (
              <View className='bv-code-lang'>
                <Text>{props.language}</Text>
              </View>
            )}
          </View>
        )}
        {!collapsed && (
          <ScrollView className='bv-code-body' scrollX enableFlex>
            <Text className='bv-code-text' userSelect selectable>
              {codeSource(block)}
            </Text>
          </ScrollView>
        )}
      </View>
    </View>
  )
}
