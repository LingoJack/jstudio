import { useEffect } from 'react'
import { AlertTriangle } from './Icon'
import { DialogButton } from './DialogButton'

interface Props {
  filename: string
  onSave: () => void | Promise<void>
  onDiscard: () => void
  onCancel: () => void
}

export function CloseConfirmDialog({ filename, onSave, onDiscard, onCancel }: Props) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,22,27,0.55)] backdrop-blur-[4px] animate-seeyue-fade-in"
      onClick={onCancel}
    >
      <div
        className="min-w-[380px] max-w-[480px] bg-seeyue-panel border border-seeyue-border-strong rounded-[10px] shadow-[0_12px_40px_rgba(0,0,0,0.4)] px-5 py-5 pb-4 animate-seeyue-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <h3 className="m-0 mb-1.5 text-[15px] font-semibold text-seeyue-fg-strong flex items-center gap-2">
          <span className="text-seeyue-warn">
            <AlertTriangle size={16} />
          </span>
          有未保存的改动
        </h3>
        <p className="m-0 mb-4 text-[13px] text-seeyue-fg-muted leading-[1.7]">
          <span className="text-seeyue-fg">{filename}</span> 已修改但未保存，是否保存？
        </p>
        <div className="flex justify-end gap-2 mt-[18px]">
          <DialogButton onClick={onCancel}>取消</DialogButton>
          <DialogButton tone="danger" onClick={onDiscard}>
            不保存
          </DialogButton>
          <DialogButton tone="primary" onClick={() => void onSave()}>
            保存
          </DialogButton>
        </div>
      </div>
    </div>
  )
}
