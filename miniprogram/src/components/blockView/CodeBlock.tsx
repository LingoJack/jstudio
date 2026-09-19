import { useMemo } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'

import type { Block } from '../../lib/blocks/types'
import { layoutSequenceDiagram } from '../../lib/mermaid/sequenceLayout'
import { parseSequenceDiagram } from '../../lib/mermaid/sequenceParser'
import { MermaidSequenceView } from './MermaidSequenceView'
import { richTextOf } from './TextBlocks'

/**
 * 代码块（只读，不做语法高亮——桌面端的 hljs token 色板不移植，
 * 源码以等宽 13px / 行高 1.6 白底呈现，横向滚动）。
 * 样式规格对齐 vscode-theme.css:1736-1935：容器 16px 圆角、
 * 1px block-line-strong 边框、header 6px 8px + 底部 block-line 分割线、
 * 语言徽章 11px 大写字距 0.04em。
 *
 * mermaid 语言块：桌面端 CodeBlockView.tsx:130 判定 isMermaid 后用 mermaid 库
 * 渲染预览；小程序端跑不了 mermaid（依赖 DOM），改用自研时序图渲染
 * （sequenceParser + sequenceLayout + MermaidSequenceView），仅支持
 * sequenceDiagram，其余图类型与解析失败时降级为源码展示。
 */

/** mermaid 的 language 取值（desktop codeBlockLanguages）。 */
const MERMAID_LANGUAGE = 'mermaid'

/** code 块的源码存于 content[0].text（见 desktop types/document.ts:208）。 */
function codeSource(block: Block): string {
  const rich = richTextOf(block.content)
  return rich.map((seg) => seg.text).join('')
}

export function CodeBlockView({ block }: { block: Block }) {
  const props = block.properties ?? {}
  const collapsed = props.codeCollapsed === true
  const hasHeader = Boolean(props.codeTitle) || Boolean(props.language)
  const source = codeSource(block)
  const isMermaid = (props.language ?? '').trim().toLowerCase() === MERMAID_LANGUAGE
  const mermaidLayout = useMemo(() => {
    if (!isMermaid) return null
    const model = parseSequenceDiagram(source)
    return model ? layoutSequenceDiagram(model) : null
  }, [isMermaid, source])
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
          mermaidLayout
            ? (
              <View className='bv-mermaid-body'>
                <MermaidSequenceView layout={mermaidLayout} />
              </View>
            )
            : (
              <ScrollView className='bv-code-body' scrollX enableFlex>
                <Text className='bv-code-text' userSelect selectable>
                  {source}
                </Text>
              </ScrollView>
            )
        )}
      </View>
    </View>
  )
}
