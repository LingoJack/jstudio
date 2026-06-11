import { useCallback, useEffect, useMemo, useState } from 'react'
import { BlockEditor } from './editor/BlockEditor'
import { Sidebar } from './layout/Sidebar'
import { Topbar } from './layout/Topbar'
import { RightPanel } from './layout/RightPanel'
import type {
  Backlink,
  KnowledgeGraph,
  PageDoc,
  PageSummary,
  PluginManifest,
  SyncStatus,
  WorkspaceMeta,
} from './model/workspace'
import {
  createPage,
  deletePage,
  getBacklinks,
  getGraph,
  getPage,
  getSyncStatus,
  listPlugins,
  openWorkspace,
  savePage,
} from './services/studio-api'
import { makeBlock } from './editor/block-registry'
import { KnowledgeGraphView } from './graph/KnowledgeGraphView'

interface ToastState {
  message: string
  kind: 'success' | 'error' | 'info'
}

export function StudioApp() {
  const [workspace, setWorkspace] = useState<WorkspaceMeta | null>(null)
  const [pages, setPages] = useState<PageSummary[]>([])
  const [activePage, setActivePage] = useState<PageDoc | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [darkMode, setDarkMode] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [backlinks, setBacklinks] = useState<Backlink[]>([])
  const [plugins, setPlugins] = useState<PluginManifest[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [graph, setGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] })
  const [showGraph, setShowGraph] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const nextWorkspace = await openWorkspace(null)
        if (cancelled) return
        setWorkspace(nextWorkspace)
        setPages(nextWorkspace.pages)
        const [nextPlugins, nextSync, nextGraph] = await Promise.all([
          listPlugins(),
          getSyncStatus(nextWorkspace.path),
          getGraph(nextWorkspace.path),
        ])
        if (cancelled) return
        setPlugins(nextPlugins)
        setSyncStatus(nextSync)
        setGraph(nextGraph)
        const firstPage = nextWorkspace.pages[0]
        if (firstPage) {
          const doc = await getPage(nextWorkspace.path, firstPage.id)
          if (!cancelled) setActivePage(doc)
        }
      } catch (error) {
        setToast({ message: `初始化失败：${String(error)}`, kind: 'error' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const workspacePath = workspace?.path ?? ''

  const refreshGraphAndBacklinks = useCallback(
    async (pageId?: string) => {
      if (!workspacePath) return
      const [nextGraph, nextBacklinks] = await Promise.all([
        getGraph(workspacePath),
        pageId ? getBacklinks(workspacePath, pageId) : Promise.resolve([]),
      ])
      setGraph(nextGraph)
      setBacklinks(nextBacklinks)
    },
    [workspacePath]
  )

  useEffect(() => {
    if (!activePage?.id || !workspacePath) return
    void refreshGraphAndBacklinks(activePage.id)
  }, [activePage?.id, refreshGraphAndBacklinks, workspacePath])

  const openPageById = useCallback(
    async (pageId: string) => {
      if (!workspacePath) return
      if (dirty && !window.confirm('当前页面尚未保存，确定切换页面吗？')) return
      try {
        const doc = await getPage(workspacePath, pageId)
        setActivePage(doc)
        setDirty(false)
      } catch (error) {
        setToast({ message: `打开页面失败：${String(error)}`, kind: 'error' })
      }
    },
    [dirty, workspacePath]
  )

  const handleCreatePage = useCallback(async () => {
    if (!workspacePath) return
    try {
      const doc = await createPage(workspacePath, '未命名页面')
      setActivePage(doc)
      setDirty(false)
      setPages((prev) => [
        { id: doc.id, title: doc.title, icon: doc.icon, parentId: doc.parentId, createdAt: doc.createdAt, updatedAt: doc.updatedAt },
        ...prev,
      ])
      await refreshGraphAndBacklinks(doc.id)
    } catch (error) {
      setToast({ message: `新建失败：${String(error)}`, kind: 'error' })
    }
  }, [refreshGraphAndBacklinks, workspacePath])

  const handleDeletePage = useCallback(
    async (pageId: string) => {
      if (!workspacePath) return
      if (!window.confirm('确定删除这个页面吗？此操作不可恢复。')) return
      try {
        const nextPages = await deletePage(workspacePath, pageId)
        setPages(nextPages)
        if (activePage?.id === pageId) {
          const next = nextPages[0]
          setActivePage(next ? await getPage(workspacePath, next.id) : null)
          setDirty(false)
        }
        await refreshGraphAndBacklinks(activePage?.id)
      } catch (error) {
        setToast({ message: `删除失败：${String(error)}`, kind: 'error' })
      }
    },
    [activePage?.id, refreshGraphAndBacklinks, workspacePath]
  )

  const handleSave = useCallback(async () => {
    if (!workspacePath || !activePage) return
    setSaving(true)
    try {
      const saved = await savePage(workspacePath, activePage)
      setActivePage(saved)
      setPages((prev) =>
        prev.map((page) =>
          page.id === saved.id
            ? { ...page, title: saved.title, icon: saved.icon, updatedAt: saved.updatedAt }
            : page
        )
      )
      setDirty(false)
      await refreshGraphAndBacklinks(saved.id)
      setToast({ message: '页面已保存', kind: 'success' })
    } catch (error) {
      setToast({ message: `保存失败：${String(error)}`, kind: 'error' })
    } finally {
      setSaving(false)
    }
  }, [activePage, refreshGraphAndBacklinks, workspacePath])

  const stats = useMemo(() => {
    const pageCount = pages.length
    const edgeCount = graph.edges.length
    return { pageCount, edgeCount }
  }, [graph.edges.length, pages.length])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        正在初始化本地工作区…
      </div>
    )
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-100 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
      <div className="flex h-full">
        <Sidebar
          workspace={workspace}
          pages={pages}
          activePageId={activePage?.id ?? null}
          onOpenPage={openPageById}
          onCreatePage={handleCreatePage}
          onDeletePage={handleDeletePage}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-white dark:bg-slate-950">
          <Topbar
            title={activePage?.title ?? ''}
            dirty={dirty}
            saving={saving}
            darkMode={darkMode}
            syncStatus={syncStatus}
            onTitleChange={(title) => {
              setActivePage((prev) => (prev ? { ...prev, title } : prev))
              setDirty(true)
            }}
            onSave={handleSave}
            onToggleTheme={() => setDarkMode((prev) => !prev)}
            onToggleGraph={() => setShowGraph((prev) => !prev)}
          />

          {showGraph ? (
            <KnowledgeGraphView graph={graph} pages={pages} onOpenPage={openPageById} />
          ) : activePage ? (
            <div className="min-h-0 flex-1 overflow-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.8),rgba(255,255,255,1))] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.8),rgba(2,6,23,1))]">
              <div className="mx-auto max-w-4xl px-8 pt-10">
                <div className="mb-6 flex items-center gap-3">
                  <input
                    className="w-16 bg-transparent text-4xl outline-none"
                    value={activePage.icon ?? ''}
                    onChange={(event) => {
                      setActivePage((prev) => (prev ? { ...prev, icon: event.target.value || null } : prev))
                      setDirty(true)
                    }}
                  />
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Local-first page</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {stats.pageCount} 个页面 · {stats.edgeCount} 条知识连接 · 输入 / 插入内容块
                    </p>
                  </div>
                </div>
              </div>
              <BlockEditor
                blocks={activePage.blocks.length ? activePage.blocks : [makeBlock('paragraph')]}
                pages={pages}
                onChange={(blocks) => {
                  setActivePage((prev) => (prev ? { ...prev, blocks } : prev))
                  setDirty(true)
                }}
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-slate-500">
              <button className="rounded-2xl bg-orange-500 px-4 py-2 text-white" onClick={handleCreatePage}>
                创建第一个页面
              </button>
            </div>
          )}
        </main>

        <RightPanel page={activePage} backlinks={backlinks} plugins={plugins} syncStatus={syncStatus} />
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-4 py-3 text-sm shadow-2xl ${
            toast.kind === 'error'
              ? 'bg-red-600 text-white'
              : toast.kind === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
