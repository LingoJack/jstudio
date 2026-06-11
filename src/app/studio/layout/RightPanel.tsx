import type { Backlink, PageDoc, PluginManifest, SyncStatus } from '../model/workspace'

interface RightPanelProps {
  page: PageDoc | null
  backlinks: Backlink[]
  plugins: PluginManifest[]
  syncStatus: SyncStatus | null
}

function countText(page: PageDoc | null): number {
  if (!page) return 0
  const walk = (value: unknown): number => {
    if (typeof value === 'string') return value.length
    if (Array.isArray(value)) return value.reduce((sum, item) => sum + walk(item), 0)
    if (typeof value === 'object' && value) {
      return Object.values(value).reduce((sum, item) => sum + walk(item), 0)
    }
    return 0
  }
  return page.blocks.reduce((sum, block) => sum + walk(block.props), 0)
}

export function RightPanel({ page, backlinks, plugins, syncStatus }: RightPanelProps) {
  return (
    <aside className="hidden h-full w-80 shrink-0 flex-col border-l border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-950/70 xl:flex">
      <section className="border-b border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">页面信息</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
            <p>块</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{page?.blocks.length ?? 0}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
            <p>字符</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{countText(page)}</p>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">反向链接</h2>
        <div className="mt-3 space-y-2">
          {backlinks.map((link) => (
            <div key={`${link.pageId}-${link.blockId}`} className="rounded-xl bg-orange-50 p-3 text-sm dark:bg-orange-950/20">
              <p className="font-medium text-orange-700 dark:text-orange-300">{link.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{link.excerpt}</p>
            </div>
          ))}
          {backlinks.length === 0 && <p className="text-sm text-slate-500">暂无反链，试试输入 [[欢迎使用 JStudio]]。</p>}
        </div>
      </section>

      <section className="border-b border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">插件</h2>
        <div className="mt-3 space-y-2">
          {plugins.map((plugin) => (
            <div key={plugin.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{plugin.name}</p>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
                  {plugin.enabled ? '启用' : '禁用'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{plugin.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="p-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">同步</h2>
        <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          {syncStatus?.message ?? '等待工作区初始化'}
        </p>
      </section>
    </aside>
  )
}
