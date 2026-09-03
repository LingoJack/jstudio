import { ScrollView, Text, View } from '@tarojs/components'

import type { Block } from '../../lib/blocks/types'

/**
 * diagram / math 占位块。
 * - diagram：桌面端是 jgraph/Excalidraw 交互画布（canvas），小程序端不做渲染，
 *   以 16px 圆角容器 + 点阵背景 + 居中提示占位。
 * - math：KaTeX 依赖 DOM，无法渲染；以居中等宽排版展示 LaTeX 源码
 *   （桌面端 min-height 48px、padding 16px 20px、横向滚动）。
 */

export function DiagramPlaceholderView({ block }: { block: Block }) {
  const hasSnapshot = Boolean(block.properties?.diagramSnapshot)
  return (
    <View className='bv-diagram-figure'>
      <View className='bv-diagram-inner'>
        <Text>画板内容请在桌面端查看</Text>
        {!hasSnapshot && <Text className='bv-diagram-sub'>（空画板）</Text>}
      </View>
    </View>
  )
}

export function MathBlockView({ block }: { block: Block }) {
  const latex = block.properties?.mathLatex ?? ''
  return (
    <View className='bv-math-figure'>
      <ScrollView className='bv-math-scroll' scrollX>
        <Text className='bv-math-text' userSelect>
          {latex || '（空公式）'}
        </Text>
      </ScrollView>
    </View>
  )
}
