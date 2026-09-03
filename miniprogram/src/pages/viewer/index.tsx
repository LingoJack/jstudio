import Taro, { usePullDownRefresh, useRouter } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { Button, ScrollView, Text, View } from '@tarojs/components'

import {
  PAGE_HISTORY,
  PARAM_DOC_ID,
  PARAM_REVISION,
  PARAM_TITLE,
  VIEWER_CHUNK_SIZE,
} from '../../constants'
import { DocAssetsContext } from '../../components/blockView/BlockViewContext'
import { BlockRenderer } from '../../components/blockView/BlockRenderer'
import { useAuthGuard, handleAuthFailure } from '../../hooks/useAuthGuard'
import { parseSnapshotBody, type ParsedSnapshot } from '../../lib/blocks/snapshot'
import { formatDateTime, formatSize } from '../../lib/format'
import { createRemoteClient } from '../../lib/remote/client'
import { remoteErrorMessage, type RemoteError, type SnapshotResponse } from '../../lib/remote/types'
import { readAuth } from '../../lib/storage/authStorage'
import './index.scss'

const client = createRemoteClient()

interface ViewerData {
  snapshot: SnapshotResponse
  parsed: ParsedSnapshot
}

export default function ViewerPage() {
  useAuthGuard()
  const router = useRouter()
  const docId = router.params[PARAM_DOC_ID] ?? ''
  const paramTitle = router.params[PARAM_TITLE] ? decodeURIComponent(router.params[PARAM_TITLE] as string) : ''
  const revisionParam = router.params[PARAM_REVISION]
  const revision = revisionParam ? Number(revisionParam) : undefined

  const [data, setData] = useState<ViewerData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(VIEWER_CHUNK_SIZE)

  const load = async () => {
    const auth = readAuth()
    if (!auth || !docId) {
      return
    }
    try {
      const snap =
        revision !== undefined && !Number.isNaN(revision)
          ? await client.getSnapshot(auth.serverUrl, auth.token, docId, revision)
          : await client.getLatestSnapshot(auth.serverUrl, auth.token, docId)
      setData({ snapshot: snap, parsed: parseSnapshotBody(snap.body) })
      setError(null)
    } catch (e) {
      const err = e as RemoteError
      if (!handleAuthFailure(err)) {
        setError(remoteErrorMessage(err))
      }
    }
  }

  useEffect(() => {
    void load()
    // 依赖参数在页面生命周期内不变（navigateTo 新实例），只在挂载时拉一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePullDownRefresh(async () => {
    await load()
    Taro.stopPullDownRefresh()
  })

  const openHistory = () => {
    const title = encodeURIComponent(paramTitle)
    Taro.navigateTo({
      url: `${PAGE_HISTORY}?${PARAM_DOC_ID}=${encodeURIComponent(docId)}&${PARAM_TITLE}=${title}`,
    })
  }

  const snap = data?.snapshot
  const totalBlocks = data?.parsed.kind === 'blocks' ? data.parsed.blocks.length : 0
  const hasMore = totalBlocks > visibleCount
  const auth = readAuth()

  return (
    <View className='viewer-page'>
      <View className='viewer-meta'>
        <View className='viewer-meta-left'>
          <Text className='viewer-meta-title' userSelect>
            {snap?.title || paramTitle || '未命名'}
          </Text>
          {snap && (
            <Text className='viewer-meta-sub'>
              r{snap.revision} · {formatDateTime(snap.created_at)} · {formatSize(snap.size_bytes)}
            </Text>
          )}
        </View>
        <Text className='viewer-history-link' onClick={openHistory}>
          历史
        </Text>
      </View>

      {error && (
        <View className='viewer-error'>
          <Text>{error}</Text>
        </View>
      )}

      {!data && !error && (
        <View className='viewer-loading'>
          <Text>加载中...</Text>
        </View>
      )}

      {data && (
        <DocAssetsContext.Provider
          value={auth ? { serverUrl: auth.serverUrl, token: auth.token, docId } : null}
        >
          <ScrollView className='viewer-body' scrollY>
            {data.parsed.kind === 'blocks' ? (
              <>
                <BlockRenderer blocks={data.parsed.blocks.slice(0, visibleCount)} />
                {hasMore && (
                  <Button
                    className='viewer-more'
                    onClick={() => setVisibleCount((n) => n + VIEWER_CHUNK_SIZE)}
                  >
                    加载更多（{totalBlocks - visibleCount} 块）
                  </Button>
                )}
              </>
            ) : (
              <View className='viewer-raw'>
                <Text className='viewer-raw-text' userSelect selectable>
                  {data.parsed.text}
                </Text>
              </View>
            )}
          </ScrollView>
        </DocAssetsContext.Provider>
      )}
    </View>
  )
}
