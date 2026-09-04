import Taro from '@tarojs/taro'
import { Text } from '@tarojs/components'
import type { CSSProperties } from 'react'

import { TOAST_DURATION_MS } from '../../constants'
import type { RichText, RichTextAnnotations } from '../../lib/blocks/types'

/**
 * 行内富文本渲染：RichText[] → 嵌套 <Text>（weapp 的 Text 支持嵌套与样式继承）。
 *
 * 与桌面端的刻意差异（平台限制）：
 * - 行内 code 没有左右 3px 内边距（Text 不支持 padding），保留底色/等宽/0.9em。
 * - color 只透传 #hex / rgb / hsl 字面值；'default' 或 CSS var 引用退回继承。
 *   （桌面端 color 本来就存 CSS 颜色串，richText.ts:155。）
 * - href 不可点开外部浏览器，点击复制链接并 toast 提示。
 * - inlineMath 无 KaTeX，等宽展示 LaTeX 源码（与块级 math 占位一致）。
 */

/** 行内 code 的字号缩放（桌面端 0.9em，vscode-theme.css:1676）。 */
const INLINE_CODE_FONT_SIZE = '0.9em'

function passthroughColor(color: string | undefined): string | undefined {
  if (!color || color === 'default') {
    return undefined
  }
  if (/^(#[0-9a-f]{3,8}|rgb|hsl)/i.test(color)) {
    return color
  }
  return undefined
}

function annotationStyle(a: RichTextAnnotations): CSSProperties {
  const style: CSSProperties = {}
  if (a.bold) {
    style.fontWeight = '700'
  }
  if (a.italic) {
    style.fontStyle = 'italic'
  }
  const decorations: string[] = []
  if (a.underline) {
    decorations.push('underline')
  }
  if (a.strikethrough) {
    decorations.push('line-through')
  }
  if (decorations.length > 0) {
    style.textDecorationLine = decorations.join(' ')
  }
  if (a.code || a.inlineMath) {
    style.fontFamily =
      "Monaco, 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, 'Courier New', monospace"
    style.fontSize = INLINE_CODE_FONT_SIZE
    style.backgroundColor = 'var(--vscode-textPreformat-background)'
    style.color = 'var(--vscode-textPreformat-foreground)'
    style.borderRadius = '3px'
  }
  const color = passthroughColor(a.color)
  if (color) {
    style.color = color
  }
  if (a.href) {
    style.color = 'var(--vscode-textLink-foreground)'
    style.textDecorationLine = 'underline'
  }
  return style
}

function copyLink(url: string): void {
  Taro.setClipboardData({
    data: url,
    success: () => {
      Taro.showToast({ title: '链接已复制', icon: 'none', duration: TOAST_DURATION_MS })
    },
  })
}

export function RichTextView({ richText }: { richText: RichText[] | undefined }) {
  if (!richText || richText.length === 0) {
    return null
  }
  return (
    <Text>
      {richText.map((seg, i) => {
        const style = annotationStyle(seg.annotations)
        if (seg.annotations.href) {
          return (
            <Text
              key={i}
              style={style}
              onClick={() => copyLink(seg.annotations.href as string)}
              userSelect
            >
              {seg.text}
            </Text>
          )
        }
        return (
          <Text key={i} style={style} userSelect>
            {seg.text}
          </Text>
        )
      })}
    </Text>
  )
}
