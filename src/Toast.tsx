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
      className={`group fixed top-5 right-5 z-60 w-[min(420px,calc(100vw-40px))] flex items-start gap-3 px-4 py-3.5 rounded-2xl bg-seeyue-bg/88 backdrop-blur-xl border border-seeyue-border-dim shadow-[0_18px_55px_rgba(26,22,18,0.22),0_2px_10px_rgba(26,22,18,0.08)] text-[13px] text-seeyue-fg overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-seeyue-accent data-[tone=error]:before:bg-seeyue-danger data-[tone=success]:before:bg-seeyue-success data-[tone=info]:before:bg-seeyue-accent ${
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
