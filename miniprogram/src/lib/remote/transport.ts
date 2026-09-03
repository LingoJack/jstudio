import Taro from '@tarojs/taro'

import { REMOTE_REQUEST_TIMEOUT_MS } from './constants'
import { networkError, type TransportRequest, type TransportResponse } from './types'

export type { TransportRequest, TransportResponse } from './types'

/**
 * 基于 Taro.request 的传输实现。要点：
 * - dataType 设为 'text'：任何非 'json' 的值都不会被自动 JSON.parse，拿到原始文本。
 * - 小程序里**任何 HTTP 状态码都走 success 回调**（fail 只覆盖网络层失败），
 *   状态码判断全部放在 success 分支。
 * - 超时由 Taro.request 的 timeout 参数承担（没有 AbortController）。
 */
export function taroTransport(url: string, req: TransportRequest): Promise<TransportResponse> {
  return new Promise((resolve, reject) => {
    Taro.request({
      url,
      method: req.method,
      header: req.headers,
      data: req.body,
      timeout: req.timeoutMs || REMOTE_REQUEST_TIMEOUT_MS,
      dataType: 'text',
      responseType: 'text',
      success: (res) => {
        resolve({
          status: res.statusCode,
          bodyText: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
        })
      },
      fail: (err) => {
        const msg = err.errMsg || 'request failed'
        reject(networkError(msg.includes('timeout') ? 'request timed out' : 'server unreachable'))
      },
    })
  })
}
