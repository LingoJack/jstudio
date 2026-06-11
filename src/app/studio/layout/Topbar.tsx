import type { SyncStatus } from '../model/workspace'

interface TopbarProps {
  title: string
  dirty: boolean
  saving: boolean
  darkMode: boolean
  syncStatus: SyncStatus | null
  onTitleChange: (title: string) => void
  onSave: () => void
  onToggleTheme: () => void
  onToggleGraph: () => void
}

export function Topbar({
  title,
  dirty,
  saving,
  darkMode,
  syncStatus,
  onTitleChange,
  onSave,
  onToggleTheme,
  onToggleGraph,
}: TopbarProps) {
  return (
    <header className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <input
        className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-slate-950 outline-none placeholder:text-slate-400 dark:text-white"
        value={title}
        placeholder="未命名页面"
        onChange={(event) => onTitleChange(event.target.value)}
      />
      <span className="hidden max-w-72 truncate text-xs text-slate-500 md:inline">
        {syncStatus?.message ?? '本地优先，离线可用'}
      </span>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        {saving ? '保存中' : dirty ? '未保存' : '已保存'}
      </span>
      <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900" onClick={onToggleGraph}>
        图谱
      </button>
      <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900" onClick={onToggleTheme}>
        {darkMode ? '浅色' : '暗黑'}
      </button>
      <button className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600" onClick={onSave}>
        保存
      </button>
    </header>
  )
}
