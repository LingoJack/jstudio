import Taro from '@tarojs/taro'
import { Image, Text, View } from '@tarojs/components'

import { TOAST_DURATION_MS } from '../../constants'
import type { Block } from '../../lib/blocks/types'

/**
 * 链接卡片块。对齐桌面端 vscode-theme.css:2556-2699：figure 8px 圆角 +
 * 1px widget-border、卡片 12px 16px 内边距、favicon 16px、标题 13px/500、
 * 描述 12px 两行截断、URL 11px 链接色、右侧缩略图 64px。
 * 点击行为：小程序不能开外部浏览器，复制链接并 toast。
 */

export function LinkBlockView({ block }: { block: Block }) {
  const props = block.properties ?? {}
  const url = props.linkUrl ?? ''
  if (!url) {
    return null
  }
  const copy = () => {
    Taro.setClipboardData({
      data: url,
      success: () => {
        Taro.showToast({ title: '链接已复制', icon: 'none', duration: TOAST_DURATION_MS })
      },
    })
  }
  return (
    <View className='bv-link-figure'>
      <View className='bv-link-card' onClick={copy}>
        <View className='bv-link-left'>
          {props.linkFavicon ? (
            <Image className='bv-link-favicon' src={props.linkFavicon} mode='aspectFill' />
          ) : (
            <View className='bv-link-favicon-fallback'>
              <Text className='bv-link-favicon-letter'>
                {(props.linkSiteName ?? url).charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View className='bv-link-info'>
            <View className='bv-link-title'>
              <Text>{props.linkTitle ?? url}</Text>
            </View>
            {props.linkDescription && (
              <View className='bv-link-desc'>
                <Text>{props.linkDescription}</Text>
              </View>
            )}
            <View className='bv-link-url'>
              <Text>{url}</Text>
            </View>
          </View>
        </View>
        {props.linkOgImage && (
          <Image className='bv-link-thumb' src={props.linkOgImage} mode='aspectFill' />
        )}
      </View>
    </View>
  )
}
