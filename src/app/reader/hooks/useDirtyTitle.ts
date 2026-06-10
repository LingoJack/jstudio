import { useEffect } from 'react'
import type { Tab } from '../../../types'

/** 同步 document.title 与 beforeunload 拦截。 */
export function useDirtyTitle(activeTab: Tab | null, anyDirty: boolean) {
  // title
  useEffect(() => {
    const base = activeTab ? `${activeTab.filename} · j reader` : 'j reader'
    document.title = (activeTab?.dirty ? '● ' : '') + base
  }, [activeTab, activeTab?.dirty])

  // beforeunload + shutdown beacon
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (anyDirty) {
        e.preventDefault()
        // Chrome 仍要求 returnValue 设值
        e.returnValue = ''
      } else {
        // sendBeacon 在某些 Chrome 版本（特别是 app 模式关窗口时）会被
        // cancel；用 keepalive fetch 替代，配合服务端心跳超时双保险。
        try {
          void fetch('./api/shutdown', {
            method: 'POST',
            keepalive: true,
          })
        } catch {
          /* 忽略 */
        }
        // 兜底：旧浏览器不支持 keepalive 时退化到 sendBeacon
        if (typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon('./api/shutdown')
        }
      }
    }
    function pageHideHandler() {
      if (!anyDirty) {
        try {
          navigator.sendBeacon?.('./api/shutdown')
        } catch {
          /* 忽略 */
        }
      }
    }
    window.addEventListener('beforeunload', handler)
    // pagehide 在 bfcache 关页时仍会 fire，比 beforeunload 更可靠
    window.addEventListener('pagehide', pageHideHandler)
    return () => {
      window.removeEventListener('beforeunload', handler)
      window.removeEventListener('pagehide', pageHideHandler)
    }
  }, [anyDirty])
}
