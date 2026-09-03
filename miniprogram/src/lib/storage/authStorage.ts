import Taro from '@tarojs/taro'

import type { AuthUser } from '../remote/types'

/** 登录态（对应 desktop 的 authSlice 持久化字段）。 */
export interface AuthState {
  serverUrl: string
  token: string
  expiresAt: string
  user: AuthUser
}

/** 存储键。前缀统一，避免与其他小程序数据冲突。 */
const STORAGE_KEY_AUTH = 'jstudio.auth'

export function saveAuth(auth: AuthState): void {
  Taro.setStorageSync(STORAGE_KEY_AUTH, JSON.stringify(auth))
}

/** 读取登录态；无记录或损坏时返回 null。 */
export function readAuth(): AuthState | null {
  try {
    const raw = Taro.getStorageSync(STORAGE_KEY_AUTH)
    if (typeof raw !== 'string' || raw.length === 0) {
      return null
    }
    const parsed = JSON.parse(raw) as Partial<AuthState>
    if (
      typeof parsed.serverUrl === 'string' &&
      typeof parsed.token === 'string' &&
      typeof parsed.expiresAt === 'string' &&
      typeof parsed.user === 'object' &&
      parsed.user !== null
    ) {
      return {
        serverUrl: parsed.serverUrl,
        token: parsed.token,
        expiresAt: parsed.expiresAt,
        user: parsed.user,
      }
    }
    return null
  } catch {
    return null
  }
}

export function clearAuth(): void {
  Taro.removeStorageSync(STORAGE_KEY_AUTH)
}
