import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { Image, Text, View } from '@tarojs/components'

import { TOAST_DURATION_MS } from '../../constants'
import type { Block } from '../../lib/blocks/types'
import { downloadAsset, useDocAssets } from './BlockViewContext'

/**
 * 图片块。桌面端约定（assetUrl.ts:16）：asset 引用是 'assets/<fileName>' 相对路径；
 * url / base64 直接作 src。asset 需要 Bearer，走 downloadFile → tempFilePath。
 * 桌面端不渲染 caption（ImageView 无 caption），本端保持一致。
 */

/** asset 引用前缀（desktop isAssetPath）。 */
const ASSET_PATH_PREFIX = 'assets/'

/** 加载占位最小高度，避免下载期间高度塌陷。 */
const IMAGE_PLACEHOLDER_MIN_HEIGHT_PX = 120

type LoadState =
  | { phase: 'loading' }
  | { phase: 'done'; src: string }
  | { phase: 'error'; message: string }

function isAssetRef(content: string): boolean {
  return content.startsWith(ASSET_PATH_PREFIX)
}

function fileNameOf(content: string): string {
  return content.slice(ASSET_PATH_PREFIX.length)
}

export function ImageBlockView({ block }: { block: Block }) {
  const content = typeof block.content === 'string' ? block.content : ''
  const props = block.properties ?? {}
  const ctx = useDocAssets()
  const [state, setState] = useState<LoadState>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false
    if (!content) {
      setState({ phase: 'error', message: '空图片' })
      return
    }
    if (!isAssetRef(content)) {
      setState({ phase: 'done', src: content })
      return
    }
    if (!ctx) {
      setState({ phase: 'error', message: '缺少下载上下文' })
      return
    }
    setState({ phase: 'loading' })
    downloadAsset(ctx, fileNameOf(content))
      .then((tempPath) => {
        if (!cancelled) {
          setState({ phase: 'done', src: tempPath })
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setState({ phase: 'error', message: e.message })
        }
      })
    return () => {
      cancelled = true
    }
  }, [content, ctx])

  const alignCls = props.align === 'left' ? ' bv-image-left' : ' bv-image-center'
  const widthStyle = props.widthPct !== undefined ? { width: `${props.widthPct}%` } : undefined

  if (state.phase === 'error') {
    return (
      <View className={`bv-image-figure${alignCls}`}>
        <View className='bv-image-error'>
          <Text>图片加载失败：{state.message}</Text>
        </View>
      </View>
    )
  }

  if (state.phase === 'loading') {
    return (
      <View className={`bv-image-figure${alignCls}`}>
        <View className='bv-image-loading' style={{ minHeight: IMAGE_PLACEHOLDER_MIN_HEIGHT_PX }}>
          <Text>图片加载中...</Text>
        </View>
      </View>
    )
  }

  return (
    <View className={`bv-image-figure${alignCls}`}>
      <View className='bv-image-img-box' style={widthStyle}>
        <Image
          className='bv-image-img'
          src={state.src}
          mode='widthFix'
          lazyLoad
          onError={() => {
            Taro.showToast({ title: '图片显示失败', icon: 'none', duration: TOAST_DURATION_MS })
          }}
        />
      </View>
    </View>
  )
}
