import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'

import {
  PAGE_VIEWER,
  PARAM_DOC_ID,
  PARAM_REVISION,
  PARAM_TITLE,
  SNAPSHOT_LIST_LIMIT,
} from '../../constants'
import { useAuthGuard, handleAuthFailure } from '../../hooks/useAuthGuard'
import { formatDateTime, formatSize } from '../../lib/format'
import { createRemoteClient } from '../../lib/remote/client'
import {
  remoteErrorMessage,
  type RemoteError,
  type SnapshotMeta,
} from '../../lib/remote/types'
import { readAuth } from '../../lib/storage/authStorage'
import './index.scss'

const client = createRemoteClient()

export default function HistoryPage() {
  useAuthGuard()
  const router = useRouter()
  const docId = router.params[PARAM_DOC_ID] ?? ''
  const paramTitle = router.params[PARAM_TITLE]
    ? decodeURIComponent(router.params[PARAM_TITLE] as string)
    : ''

  const [items, setItems] = useState<SnapshotMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const auth = readAuth()
    if (!auth || !docId) {
      return
    }
    try {
      const res = await client.listSnapshots(auth.serverUrl, auth.token, docId, SNAPSHOT_LIST_LIMIT)
      setItems(res.snapshots)
      setError(null)
    } catch (e) {
      const err = e as RemoteError
      if (!handleAuthFailure(err)) {
        setError(remoteErrorMessage(err))
      }
    }
  }

  useDidShow(() => {
    void load()
  })

  const openRevision = (item: SnapshotMeta) => {
    const title = encodeURIComponent(item.title || paramTitle)
    Taro.redirectTo({
      url: `${PAGE_VIEWER}?${PARAM_DOC_ID}=${encodeURIComponent(docId)}&${PARAM_REVISION}=${item.revision}&${PARAM_TITLE}=${title}`,
    })
  }

  return (
    <View className='history-page'>
      {error && (
        <View className='history-error'>
          <Text>{error}</Text>
        </View>
      )}

      {items !== null && items.length === 0 && !error && (
        <View className='history-empty'>
          <Text>暂无历史快照</Text>
        </View>
      )}

      <ScrollView className='history-list' scrollY>
        {(items ?? []).map((item) => (
          <View key={item.revision} className='history-item' onClick={() => openRevision(item)}>
            <View className='history-item-title'>
              <Text userSelect>{item.title || paramTitle || '未命名'}</Text>
            </View>
            <View className='history-item-meta'>
              <Text>r{item.revision}</Text>
              <Text className='history-item-dot'> · </Text>
              <Text>{formatDateTime(item.created_at)}</Text>
              <Text className='history-item-dot'> · </Text>
              <Text>{formatSize(item.size_bytes)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
