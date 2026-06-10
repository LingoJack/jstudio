/**
 * 弹窗按钮：统一 ConfirmDialog / CloseConfirmDialog / QuitConfirmDialog 的按钮样式。
 *
 * tone:
 *  - 'default' — 透明背景文字按钮（取消等）
 *  - 'primary' — 强调色填充（确认）
 *  - 'danger'  — 红色文字 + hover 红色背景（删除）
 */
interface Props {
  tone?: 'default' | 'primary' | 'danger'
  children: React.ReactNode
  onClick: () => void
  ref?: React.Ref<HTMLButtonElement>
}

export function DialogButton({ tone = 'default', children, onClick, ref }: Props) {
  return (
    <button
      ref={ref}
      type="button"
      className="px-3.5 py-1.5 text-[12.5px] font-cjk rounded-md border border-transparent cursor-pointer bg-transparent text-seeyue-fg-muted transition-all duration-150 hover:text-seeyue-fg-strong hover:bg-seeyue-elevated data-[tone=primary]:bg-seeyue-accent-strong data-[tone=primary]:text-seeyue-fg-strong data-[tone=primary]:hover:bg-seeyue-accent data-[tone=primary]:hover:text-seeyue-bg data-[tone=danger]:text-seeyue-danger data-[tone=danger]:hover:bg-[rgba(191,97,106,0.18)]"
      data-tone={tone}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
