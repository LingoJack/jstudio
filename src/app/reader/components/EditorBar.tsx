/**
 * 编辑器顶栏：面包屑 + 状态徽章 + 保存 / 复制路径快捷按钮。
 *
 * 这块取代了「中央区只有 Tab 条」的潦草感，给用户：
 * - 当前文件的路径上下文
 * - 一眼可见的 dirty / saving 状态
 * - 不必去 menu bar 找的常用操作
 */
import { ChevronRight, CopyPath, Save } from '../../../Icon'
import type { Tab } from '../../../types'

/** 将路径拆成面包屑段，过长时只保留尾部 3 段 + 省略号。 */
export function breadcrumb(p: string): string[] {
  if (!p) return ['(empty)']
  const parts = p.split('/').filter(Boolean)
  if (parts.length <= 4) return parts
  return ['…', ...parts.slice(-3)]
}

export function EditorBar({
  tab,
  onSave,
  onCopyPath,
}: {
  tab: Tab
  onSave: () => void
  onCopyPath: () => void
}) {
  const segs = breadcrumb(tab.path)
  // 图片是只读视图：不显示 dirty / 保存按钮（一旦触发 /api/save 会用空 source 覆盖原文件）
  const editable = tab.kind !== 'image'
  return (
    <div className="flex items-center h-8 px-2.5 bg-seeyue-bg text-xs text-seeyue-fg-dim gap-1.5 border-b border-seeyue-border-dim">
      <div className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden" title={tab.path}>
        {segs.map((s, i) => (
          <span key={i} className="inline-flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight size={13} className="shrink-0 opacity-45" />}
            <span
              className={`whitespace-nowrap overflow-hidden text-ellipsis ${i === segs.length - 1 ? 'text-seeyue-fg font-medium' : ''}`}
            >
              {s}
            </span>
          </span>
        ))}
      </div>
      {editable && tab.dirty && (
        <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 text-seeyue-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-current" /> 未保存
        </span>
      )}
      {editable && tab.saving === 'saving' && (
        <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 text-seeyue-accent">
          保存中…
        </span>
      )}
      {editable && tab.saving === 'error' && (
        <span
          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 text-seeyue-danger"
          title={tab.error}
        >
          保存失败
        </span>
      )}
      <button
        className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-md text-seeyue-fg-dim bg-transparent border border-transparent cursor-pointer transition-all duration-150 hover:text-seeyue-fg-strong hover:bg-seeyue-elevated hover:border-seeyue-border disabled:opacity-30 disabled:cursor-not-allowed"
        onClick={onCopyPath}
        title="复制路径"
        aria-label="复制当前文件路径"
      >
        <CopyPath size={14} />
      </button>
      {editable && (
        <button
          className="inline-flex items-center justify-center w-[26px] h-[26px] rounded text-seeyue-fg-dim bg-transparent border border-transparent cursor-pointer transition-all duration-150 hover:text-seeyue-fg-strong hover:bg-seeyue-elevated disabled:opacity-35 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-seeyue-fg-dim data-[dirty=true]:text-seeyue-accent data-[dirty=true]:hover:bg-seeyue-accent-mute"
          onClick={onSave}
          disabled={!tab.dirty || tab.saving === 'saving'}
          data-dirty={tab.dirty ? 'true' : undefined}
          title={tab.dirty ? '保存（⌘S）' : '无更改'}
          aria-label={tab.dirty ? '保存当前文件' : '当前文件无更改'}
        >
          <Save size={14} />
        </button>
      )}
    </div>
  )
}
