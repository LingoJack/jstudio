import { useEffect, useRef } from 'react'
import { AlertTriangle } from './Icon'

interface Props {
  title: string
  description?: string
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 非阻塞确认弹窗，用于删除等危险操作，替代浏览器原生 confirm。 */
export function ConfirmDialog({
  title,
  description,
  detail,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => confirmRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,22,27,0.55)] backdrop-blur-[4px] animate-seeyue-fade-in"
      onClick={onCancel}
    >
      <div
        className="min-w-[380px] max-w-[520px] bg-seeyue-panel border border-seeyue-border-strong rounded-[10px] shadow-[0_12px_40px_rgba(0,0,0,0.4)] px-5 py-5 pb-4 animate-seeyue-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h3
          id="confirm-dialog-title"
          className="m-0 mb-1.5 text-[15px] font-semibold text-seeyue-fg-strong flex items-center gap-2"
        >
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
              danger
                ? 'bg-[rgba(191,97,106,0.16)] text-seeyue-danger'
                : 'bg-seeyue-accent-soft text-seeyue-accent'
            }`}
          >
            <AlertTriangle size={15} />
          </span>
          {title}
        </h3>
        {description && (
          <p className="m-0 mb-3 text-[13px] text-seeyue-fg-muted leading-[1.7]">{description}</p>
        )}
        {detail && (
          <div className="rounded-md border border-seeyue-border bg-seeyue-bg-deep px-3 py-2 font-mono text-[12px] leading-5 text-seeyue-fg-muted break-all">
            {detail}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-[18px]">
          <button
            type="button"
            className="px-3.5 py-1.5 text-[12.5px] font-cjk rounded-md border border-transparent cursor-pointer bg-transparent text-seeyue-fg-muted transition-all duration-150 hover:text-seeyue-fg-strong hover:bg-seeyue-elevated"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="px-3.5 py-1.5 text-[12.5px] font-cjk rounded-md border border-transparent cursor-pointer bg-transparent text-seeyue-fg-muted transition-all duration-150 hover:text-seeyue-fg-strong hover:bg-seeyue-elevated data-[tone=primary]:bg-seeyue-accent-strong data-[tone=primary]:text-seeyue-fg-strong data-[tone=primary]:hover:bg-seeyue-accent data-[tone=primary]:hover:text-seeyue-bg data-[tone=danger]:text-seeyue-danger data-[tone=danger]:hover:bg-[rgba(191,97,106,0.18)]"
            data-tone={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
