import Taro from '@tarojs/taro'
import { useState } from 'react'
import { Text, View } from '@tarojs/components'

import { OPEN_DOCUMENT_FILE_TYPES, TOAST_DURATION_MS } from '../../constants'
import type { Block } from '../../lib/blocks/types'
import { formatSize } from '../../lib/format'
import { downloadAsset, useDocAssets } from './BlockViewContext'

/**
 * 文件附件块（卡片模式）。桌面端的 preview 模式（iframe 内联 HTML/PDF）
 * 小程序无法实现，统一走卡片 + 下载 + openDocument（支持 doc/docx/xls/xlsx/
 * ppt/pptx/pdf）。
 */

function extensionOf(fileName: string | undefined): string {
  if (!fileName) {
    return ''
  }
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
}

/** 图标盒文案：扩展名大写（桌面端是文件类型图标，本端以扩展名代替）。 */
function iconLabel(fileName: string | undefined): string {
  const ext = extensionOf(fileName)
  return ext.slice(0, 4).toUpperCase()
}

export function FileBlockView({ block }: { block: Block }) {
  const props = block.properties ?? {}
  const fileName = props.fileName ?? (typeof block.content === 'string' ? block.content : '')
  const ctx = useDocAssets()
  const [downloading, setDownloading] = useState(false)

  const openFile = async () => {
    if (downloading || !ctx || !fileName) {
      return
    }
    const ext = extensionOf(fileName)
    if (!(OPEN_DOCUMENT_FILE_TYPES as readonly string[]).includes(ext)) {
      Taro.showToast({ title: '该格式暂不支持预览', icon: 'none', duration: TOAST_DURATION_MS })
      return
    }
    setDownloading(true)
    try {
      const tempPath = await downloadAsset(ctx, fileName)
      await Taro.openDocument({
        filePath: tempPath,
        fileType: ext as (typeof OPEN_DOCUMENT_FILE_TYPES)[number],
        showMenu: true,
      })
    } catch (e) {
      Taro.showToast({
        title: e instanceof Error ? e.message : '打开失败',
        icon: 'none',
        duration: TOAST_DURATION_MS,
      })
    } finally {
      setDownloading(false)
    }
  }

  const sizeText = formatSize(props.fileSize)
  return (
    <View className='bv-file-figure'>
      <View className='bv-file-card' onClick={openFile}>
        <View className='bv-file-icon'>
          <Text>{iconLabel(fileName)}</Text>
        </View>
        <View className='bv-file-info'>
          <View className='bv-file-name'>
            <Text userSelect>{fileName || '未命名附件'}</Text>
          </View>
          <View className='bv-file-meta'>
            <Text className='bv-file-type'>
              {downloading ? '下载中' : (extensionOf(fileName) || 'FILE').toUpperCase()}
            </Text>
            {sizeText && <Text className='bv-file-dot'> · </Text>}
            {sizeText && <Text>{sizeText}</Text>}
          </View>
        </View>
      </View>
    </View>
  )
}
