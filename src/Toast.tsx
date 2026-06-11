import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle, Close, Info } from './Icon'

interface Props {
  message: string
  /** 失败 / 成功 / 普通信息 */
  kind?: 'error' | 'info' | 'success'
  /** 自动关闭毫秒数；0 表示不自动关闭 */
  duration?: number
  onClose: () => void
}

/**
 * Typora 风 Toast：固定右上角，按 kind 选 icon + 颜色。
 * 用于替代 `alert(...)` 展示非阻塞错误/成功/信息。
 *
 * 关闭时播放退出动画（fade-out + slide-up）后再回调 onClose，
 * 避免突然消失的生硬感。
 */
export function Toast({ message, kind = 'error', duration = 3000, onClose }: Props) {
  const [exiting, setExiting] = useState(false)

  // 自动关闭：先触发退出动画，动画结束后回调 onClose
  useEffect(() => {
    if (duration <= 0) return
    const timer = window.setTimeout(() => setExiting(true), duration)
    return () => window.clearTimeout(timer)
  }, [duration])

  // 退出动画结束后回调
  useEffect(() => {
    if (!exiting) return
    const t = window.setTimeout(onClose, 280)
    return () => window.clearTimeout(t)
  }, [exiting, onClose])

  const handleClose = () => setExiting(true)

  return (
    <div
      className={`seeyue-toast group ${
        exiting
          ? 'animate-seeyue-fade-out-up'
          : 'animate-seeyue-slide-in'
      }`}
      data-tone={kind}
      role="status"
      onClick={handleClose}
    >
      <span className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/14 via-transparent to-transparent" />
      <span className="relative shrink-0 mt-0.5 inline-flex w-7 h-7 items-center justify-center rounded-full bg-seeyue-accent-soft text-seeyue-accent group-data-[tone=error]:text-seeyue-danger group-data-[tone=success]:text-seeyue-success group-data-[tone=info]:text-seeyue-accent">
        {kind === 'error' && <AlertTriangle size={16} />}
        {kind === 'success' && <CheckCircle size={16} />}
        {kind === 'info' && <Info size={16} />}
      </span>
      <span className="relative flex-1 whitespace-pre-wrap break-words leading-relaxed pt-0.5">
        {message}
      </span>
      <button
        className="relative shrink-0 cursor-pointer bg-transparent border-0 text-seeyue-fg-dim p-1 -mr-1 rounded-full inline-flex items-center justify-center transition-colors duration-150 hover:text-seeyue-fg-strong hover:bg-seeyue-elevated"
        onClick={(e) => {
          e.stopPropagation()
          handleClose()
        }}
        title="关闭"
      >
        <Close size={14} />
      </button>
    </div>
  )
}
