import type { PageSummary, WorkspaceMeta } from '../model/workspace'

interface SidebarProps {
  workspace: WorkspaceMeta | null
  pages: PageSummary[]
  activePageId: string | null
  onOpenPage: (pageId: string) => void
  onCreatePage: () => void
  onDeletePage: (pageId: string) => void
}

export function Sidebar({ workspace, pages, activePageId, onOpenPage, onCreatePage, onDeletePage }: SidebarProps) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/80">
      <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">JStudio</p>
        <h1 className="mt-1 truncate text-lg font-semibold text-slate-950 dark:text-slate-50">
          {workspace?.name ?? '本地工作区'}
        </h1>
        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{workspace?.path ?? '正在初始化'}</p>
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">页面</span>
        <button
          className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-950"
          onClick={onCreatePage}
        >
          新建
        </button>
      </div>

      <div className="flex-1 space-y-1 overflow-auto px-2 pb-4">
        {pages.map((page) => (
          <div key={page.id} className="group flex items-center gap-1">
            <button
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                activePageId === page.id
                  ? 'bg-white text-orange-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-orange-300 dark:ring-slate-800'
                  : 'text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
              }`}
              onClick={() => onOpenPage(page.id)}
            >
              <span className="text-slate-400">{page.icon ?? 'doc'}</span>
              <span className="truncate">{page.title || '未命名页面'}</span>
            </button>
            <button
              className="hidden rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover:block dark:hover:bg-red-950/40"
              onClick={() => onDeletePage(page.id)}
            >
              删除
            </button>
          </div>
        ))}
        {pages.length === 0 && <div className="px-3 py-8 text-center text-sm text-slate-500">暂无页面</div>}
      </div>
    </aside>
  )
}
