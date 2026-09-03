import Taro, { useDidShow } from '@tarojs/taro'

import { PAGE_LOGIN } from '../constants'
import { isAuthRejected, type RemoteError } from '../lib/remote/types'
import { clearAuth, readAuth } from '../lib/storage/authStorage'

/**
 * 页面级鉴权守卫：页面每次显示（含从后台切回、从下级页面返回）时检查登录态，
 * 无 token 则整体重定向到登录页。login 页以外的页面都要调用。
 *
 * 放在页面而不是 app.ts onLaunch：onLaunch 只跑一次，后台切回不触发。
 */
export function useAuthGuard(): void {
  useDidShow(() => {
    if (!readAuth()) {
      Taro.reLaunch({ url: PAGE_LOGIN })
    }
  })
}

/** 请求 401（UNAUTHORIZED / TOKEN_EXPIRED）时统一清登录态并回登录页。 */
export function handleAuthFailure(e: RemoteError): boolean {
  if (!isAuthRejected(e)) {
    return false
  }
  clearAuth()
  Taro.reLaunch({ url: PAGE_LOGIN })
  return true
}
