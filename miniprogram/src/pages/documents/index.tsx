import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'

import {
  PAGE_LOGIN,
  PAGE_VIEWER,
  PARAM_DOC_ID,
  PARAM_TITLE,
} from '../../constants'
import { useAuthGuard, handleAuthFailure } from '../../hooks/useAuthGuard'
import { formatDateTime } from '../../lib/format'
import { createRemoteClient } from '../../lib/remote/client'
import { remoteErrorMessage, type DocumentMeta, type RemoteError } from '../../lib/remote/types'
import { clearAuth, readAuth } from '../../lib/storage/authStorage'
import './index.scss'

const client = createRemoteClient()

export default function DocumentsPage() {
  useAuthGuard()
  const [docs, setDocs] = useState<DocumentMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const auth = readAuth()
    if (!auth) {
      return
    }
    try {
      const res = await client.listDocuments(auth.serverUrl, auth.token)
      setDocs(res.documents)
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

  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

  const logout = () => {
    clearAuth()
    Taro.reLaunch({ url: PAGE_LOGIN })
  }

  const openDoc = (doc: DocumentMeta) => {
    const title = encodeURIComponent(doc.title || '未命名')
    Taro.navigateTo({
      url: `${PAGE_VIEWER}?${PARAM_DOC_ID}=${encodeURIComponent(doc.doc_id)}&${PARAM_TITLE}=${title}`,
    })
  }

  return (
    <View className='docs-page'>
      <View className='docs-header'>
        <Text className='docs-header-title'>文档</Text>
        <Text className='docs-logout' onClick={logout}>
          退出
        </Text>
      </View>

      {error && (
        <View className='docs-error'>
          <Text>{error}</Text>
        </View>
      )}

      {docs !== null && docs.length === 0 && !error && (
        <View className='docs-empty'>
          <Text>暂无远程文档</Text>
          <Text className='docs-empty-sub'>在桌面端保存到远程后会出现在这里</Text>
        </View>
      )}

      <ScrollView className='docs-list' scrollY enableFlex>
        {(docs ?? []).map((doc) => (
          <View key={doc.doc_id} className='docs-item' onClick={() => openDoc(doc)}>
            <View className='docs-item-title'>
              <Text userSelect>{doc.title || '未命名'}</Text>
            </View>
            <View className='docs-item-meta'>
              <Text>r{doc.latest_revision}</Text>
              <Text className='docs-item-dot'> · </Text>
              <Text>{formatDateTime(doc.updated_at)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
