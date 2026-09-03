import Taro from '@tarojs/taro'
import { createContext, useContext } from 'react'

import { normalizeServerUrl } from '../../lib/remote/client'
import { API_PATH_ASSET, BEARER_PREFIX } from '../../lib/remote/constants'

/**
 * 块渲染所需的文档上下文：<Image> / openDocument 带不了 Authorization header，
 * asset 类资源必须走 Taro.downloadFile，因此渲染组件需要 serverUrl / token / docId。
 * viewer 页面提供，块组件消费。
 */
export interface DocAssetsContextValue {
  serverUrl: string
  token: string
  docId: string
}

export const DocAssetsContext = createContext<DocAssetsContextValue | null>(null)

/** 缺 context 时（如脱离 viewer 单独预览）asset 块只能显示占位。 */
export function useDocAssets(): DocAssetsContextValue | null {
  return useContext(DocAssetsContext)
}

/** 拼出资产下载地址（需带 Bearer，不能直接当 <Image> src 用）。 */
export function assetDownloadUrl(ctx: DocAssetsContextValue, fileName: string): string {
  return normalizeServerUrl(ctx.serverUrl) + API_PATH_ASSET(ctx.docId, fileName)
}

export function bearerHeader(token: string): Record<string, string> {
  return { Authorization: `${BEARER_PREFIX} ${token}` }
}

/** 下载资产到本地临时文件，返回 tempFilePath。非 200 视为失败。 */
export function downloadAsset(ctx: DocAssetsContextValue, fileName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Taro.downloadFile({
      url: assetDownloadUrl(ctx, fileName),
      header: bearerHeader(ctx.token),
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.tempFilePath)
        } else {
          reject(new Error(`下载失败（HTTP ${res.statusCode}）`))
        }
      },
      fail: (err) => {
        reject(new Error(err.errMsg || '下载失败'))
      },
    })
  })
}
