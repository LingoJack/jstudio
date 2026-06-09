import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityBar, type ActivityKey, type ReaderTheme } from './ActivityBar'
import { FileTree } from './FileTree'
import { Toolbox } from './Toolbox'
import { TabBar } from './TabBar'
import { CloseConfirmDialog } from './CloseConfirmDialog'
import { QuitConfirmDialog } from './QuitConfirmDialog'
import { MarkdownEditor } from './editor/MarkdownEditor'
import { PlainTextEditor } from './PlainTextEditor'
import { ImageViewer } from './ImageViewer'
import { TableOfContents } from './TableOfContents'
import { extractHeadings } from './toc'
import { Toast } from './Toast'
import { VerticalSplitter } from './Splitter'
import { MarkdownBaseDirContext } from './MarkdownIR'
import { AlertTriangle } from './Icon'
import type { ImagePayload, ParsedDocument, Tab, ToolId } from './types'
import {
  createDir,
  createFile as createFileOnDisk,
  deletePath,
  getInitial,
  openDir,
  quitReaderWindow,
  readFile,
  renamePath,
  saveFile,
  showInFolder,
} from './services'
import {
  MAX_TABS,
  ACTIVITY_BAR_WIDTH,
  MAIN_CONTENT_MIN_RATIO,
  PINNED_TOC_WIDTH,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  LS_SIDEBAR_WIDTH,
  LS_THEME,
} from './constants'
import { EditorBar } from './app/reader/components/EditorBar'
import { EmptyState } from './app/reader/components/EmptyState'
import { ToolHost } from './app/reader/components/ToolHost'
import { useDirtyTitle } from './app/reader/hooks/useDirtyTitle'
import { docToTab, ingestDoc, filenameFromPath, isSameOrChildPath, rebasePath } from './utils/doc'

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' }

/** 工具 tab 标签上显示的名字。新增工具时在这里加一项。 */
const TOOL_TITLES: Record<ToolId, string> = {
  diff: '文本 Diff',
  json: 'JSON 查看器',
}

function readStoredTheme(): ReaderTheme {
  const stored = localStorage.getItem(LS_THEME)
  return stored === 'warm' ? 'warm' : 'aliyun'
}

export function Reader() {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' })
  const [theme, setThemeState] = useState<ReaderTheme>(readStoredTheme)
  const [fontScale, setFontScaleState] = useState<number>(() => {
    const v = parseFloat(localStorage.getItem('jreader.fontScale') ?? '')
    return Number.isFinite(v) && v >= 0.7 && v <= 2.0 ? v : 1.0
  })
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [treeRoot, setTreeRoot] = useState<string>('')
  /**
   * 左侧"活动栏"当前选中的视图。文件 / 工具箱二选一。
   * 持久化到 localStorage —— 用户上次留在工具箱，下次打开还是工具箱。
   */
  const [activeActivity, setActiveActivity] = useState<ActivityKey>(() => {
    const v = localStorage.getItem('jreader.activity')
    return v === 'toolbox' ? 'toolbox' : 'files'
  })
  /** 关闭 dirty Tab 时弹出三选项确认 */
  const [closing, setClosing] = useState<{ path: string } | null>(null)
  /**
   * 关闭整个 reader 前的二次确认。痛点：dirty tab 弹窗里连按"不保存"，
   * 最后一下落到空态再触发 ⌘W 时会直接 quitReader 关掉窗口，用户措手不及。
   * 现在所有触发 quitReader 的入口都先打开这个 modal。
   */
  const [quitting, setQuitting] = useState(false)
  /** 错误 / 成功提示（替代 alert） */
  const [toast, setToast] = useState<{
    message: string
    kind: 'error' | 'success' | 'info'
  } | null>(null)
  /** TOC 是否固定展开；未固定时仅 hover/focus 临时展开。 */
  const [tocPinned, setTocPinned] = useState<boolean>(() => {
    return localStorage.getItem('jreader.tocPinned') === '1'
  })
  /**
   * 侧栏宽度（活动栏右侧那一列）—— 用户可拖动调节，持久化到 localStorage。
   * 初值会被夹紧到 [SIDEBAR_MIN, SIDEBAR_MAX]，防止上一次恶意 / 意外的 0 值。
   */
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const raw = localStorage.getItem(LS_SIDEBAR_WIDTH)
    const n = raw ? Number(raw) : SIDEBAR_DEFAULT
    if (!Number.isFinite(n)) return SIDEBAR_DEFAULT
    return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, n))
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => localStorage.getItem('jreader.sidebarCollapsed') === '1'
  )
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('jreader.sidebarCollapsed', next ? '1' : '0')
      return next
    })
  }, [])
  const handleSidebarResize = useCallback((next: number) => {
    setSidebarWidth(next)
    localStorage.setItem(LS_SIDEBAR_WIDTH, String(Math.round(next)))
  }, [])
  /** 监听 doc 更新（每次解析完成就 +1）—— 给 TOC 触发重算 */
  const [docVersion, setDocVersion] = useState(0)

  // —— 高频内容用 ref 而不是 state，避免按键触发整树 re-render ——
  /** 每个 tab 的最新文本内容；按 path 索引 */
  const sourcesRef = useRef<Record<string, string>>({})
  /** 每个文件的原始内容（打开/保存时快照），用于 dirty 判断 */
  const originalSourcesRef = useRef<Record<string, string>>({})
  /** 每个 markdown tab 的最新 IR；按 path 索引 */
  const docsRef = useRef<Record<string, ParsedDocument>>({})
  /** 每个 image tab 的元信息（mime / size）；按 path 索引 */
  const imagesRef = useRef<Record<string, ImagePayload>>({})

  const toggleTocPinned = useCallback(() => {
    setTocPinned((prev) => {
      const next = !prev
      localStorage.setItem('jreader.tocPinned', next ? '1' : '0')
      return next
    })
  }, [])

  const selectActivity = useCallback((key: ActivityKey) => {
    setActiveActivity(key)
    localStorage.setItem('jreader.activity', key)
  }, [])

  // —— 初始化：读取 Tauri 后端初始路径 → （如果有 initial_path）打开 initial tab ——
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const initial = await getInitial()

        if (cancelled) return
        setTreeRoot(initial.root_dir)

        if (!initial.initial_path) {
          // 目录入口：仅显示文件树，不预选文件
          setLoadState({ kind: 'ready' })
          return
        }

        const doc = await readFile(initial.initial_path)
        if (cancelled) return

        ingestDoc(doc, sourcesRef, docsRef, imagesRef, originalSourcesRef)
        setTabs([docToTab(doc)])
        setActiveTabPath(doc.path)
        setLoadState({ kind: 'ready' })
      } catch (e) {
        if (!cancelled) setLoadState({ kind: 'error', message: String(e) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const activeTab = useMemo(
    () => tabs.find((t) => t.path === activeTabPath) ?? null,
    [tabs, activeTabPath]
  )
  const anyDirty = tabs.some((t) => t.dirty)
  /** 当前文档所在目录（用于解析 markdown 里的相对图片路径） */
  const baseDir = useMemo(() => {
    if (!activeTab) return null
    const i = activeTab.path.lastIndexOf('/')
    return i >= 0 ? activeTab.path.slice(0, i) : null
  }, [activeTab])

  // —— 标题栏 + beforeunload 同步 ——
  useDirtyTitle(activeTab, anyDirty)

  // —— Tab 操作 ——
  const updateTab = useCallback((path: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, ...patch } : t)))
  }, [])

  const setTheme = useCallback((nextTheme: ReaderTheme) => {
    setThemeState(nextTheme)
    localStorage.setItem(LS_THEME, nextTheme)
  }, [])

  const setFontScale = useCallback((next: number) => {
    const clamped = Math.round(Math.max(0.7, Math.min(2.0, next)) * 100) / 100
    setFontScaleState(clamped)
    localStorage.setItem('jreader.fontScale', String(clamped))
    document.documentElement.style.setProperty('--jreader-font-scale', String(clamped))
  }, [])

  // 首次渲染时同步 fontScale 到 CSS 变量（从 localStorage 恢复的值）
  useEffect(() => {
    document.documentElement.style.setProperty('--jreader-font-scale', String(fontScale))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 编辑器报告 source 变化。这是高频回调（按键级别）。
   * 只把内容写进 ref；只有 dirty 翻转时才碰 setState。
   * 对比原始 source 判断是否真的脏了：内容恢复原样时自动清除 dirty。
   */
  const handleSourceChange = useCallback((path: string, source: string) => {
    sourcesRef.current[path] = source
    const isDirty = source !== (originalSourcesRef.current[path] ?? '')
    setTabs((prev) => {
      const t = prev.find((x) => x.path === path)
      if (!t) return prev
      if (t.dirty === isDirty) return prev // 状态没变化，不 setState
      return prev.map((x) => (x.path === path ? { ...x, dirty: isDirty } : x))
    })
  }, [])

  /**
   * MarkdownEditor 内部 debounce 调 /api/parse 后回调，更新 IR。
   * 同样写 ref，再 bump docVersion 触发 TOC 重算（TOC 依赖 path + version）。
   */
  const handleDocParsed = useCallback((path: string, doc: ParsedDocument) => {
    docsRef.current[path] = doc
    setDocVersion((v) => v + 1)
  }, [])

  const openFile = useCallback(
    async (path: string) => {
      // 已存在则切到该 tab
      if (tabs.some((t) => t.path === path)) {
        setActiveTabPath(path)
        return
      }
      if (tabs.length >= MAX_TABS) {
        setToast({
          message: `已打开 ${MAX_TABS} 个 Tab，关闭一些再试`,
          kind: 'info',
        })
        return
      }
      try {
        const doc = await readFile(path)
        ingestDoc(doc, sourcesRef, docsRef, imagesRef, originalSourcesRef)
        setTabs((prev) => [...prev, docToTab(doc)])
        setActiveTabPath(doc.path)
      } catch (e) {
        setToast({ message: `打开失败：${String(e)}`, kind: 'error' })
      }
    },
    [tabs]
  )

  /**
   * 打开一个内置工具作为 tab。每个工具同时只允许一个实例 —— 二次点击只是切回去。
   * 工具 tab 的 path 用伪 URI（`tool://<id>`）作为唯一 key，跟磁盘文件路径
   * 永远不会冲突。
   */
  const openTool = useCallback(
    (toolId: ToolId) => {
      const path = `tool://${toolId}`
      if (tabs.some((t) => t.path === path)) {
        setActiveTabPath(path)
        return
      }
      if (tabs.length >= MAX_TABS) {
        setToast({
          message: `已打开 ${MAX_TABS} 个 Tab，关闭一些再试`,
          kind: 'info',
        })
        return
      }
      const tab: Tab = {
        path,
        filename: TOOL_TITLES[toolId] ?? toolId,
        kind: 'tool',
        toolId,
        dirty: false,
        saving: 'idle',
      }
      setTabs((prev) => [...prev, tab])
      setActiveTabPath(path)
    },
    [tabs]
  )

  const requestCloseTab = useCallback(
    (path: string) => {
      const t = tabs.find((x) => x.path === path)
      if (!t) return
      if (t.dirty) {
        setClosing({ path })
        return
      }
      forceCloseTab(path)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabs]
  )

  const forceCloseTab = useCallback((path: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path)
      if (idx < 0) return prev
      const next = prev.filter((t) => t.path !== path)
      setActiveTabPath((currentActivePath) => {
        if (currentActivePath !== path) return currentActivePath
        // 切换 active：优先左邻（上一个 tab）→ 右邻 → null
        return prev[idx - 1]?.path ?? prev[idx + 1]?.path ?? null
      })
      return next
    })
    // 清掉 ref 桶里的内容，不让已关 tab 占内存
    delete sourcesRef.current[path]
    delete originalSourcesRef.current[path]
    delete docsRef.current[path]
    delete imagesRef.current[path]
  }, [])

  // 关闭除指定 tab 以外的所有非 dirty tab；dirty tab 保留
  const closeOthers = useCallback(
    (keepPath: string) => {
      setTabs((prev) => {
        const kept = prev.filter((t) => t.path === keepPath || t.dirty)
        // 清理 ref 桶
        for (const t of prev) {
          if (!kept.some((k) => k.path === t.path)) {
            delete sourcesRef.current[t.path]
            delete originalSourcesRef.current[t.path]
            delete docsRef.current[t.path]
            delete imagesRef.current[t.path]
          }
        }
        if (!kept.some((t) => t.path === activeTabPath)) {
          setActiveTabPath(keepPath)
        }
        return kept
      })
    },
    [activeTabPath]
  )

  // 关闭全部非 dirty tab；dirty tab 保留
  const closeAll = useCallback(() => {
    setTabs((prev) => {
      const kept = prev.filter((t) => t.dirty)
      for (const t of prev) {
        if (!kept.some((k) => k.path === t.path)) {
          delete sourcesRef.current[t.path]
          delete originalSourcesRef.current[t.path]
          delete docsRef.current[t.path]
          delete imagesRef.current[t.path]
        }
      }
      if (kept.length > 0) {
        if (!kept.some((t) => t.path === activeTabPath)) {
          setActiveTabPath(kept[0].path)
        }
      } else {
        setActiveTabPath(null)
      }
      return kept
    })
  }, [activeTabPath])

  // 仅关闭已保存（非 dirty）的 tab
  const closeSaved = useCallback(() => {
    setTabs((prev) => {
      const kept = prev.filter((t) => t.dirty)
      for (const t of prev) {
        if (!kept.some((k) => k.path === t.path)) {
          delete sourcesRef.current[t.path]
          delete originalSourcesRef.current[t.path]
          delete docsRef.current[t.path]
          delete imagesRef.current[t.path]
        }
      }
      if (!kept.some((t) => t.path === activeTabPath)) {
        setActiveTabPath(kept[0]?.path ?? null)
      }
      return kept
    })
  }, [activeTabPath])

  const saveTab = useCallback(
    async (path: string) => {
      const t = tabs.find((x) => x.path === path)
      if (!t) return
      // 图片是只读视图：⌘S 直接 no-op，避免把空 source 覆盖回去毁掉文件
      // 工具 tab 没有"文件内容"概念，⌘S 同样直接忽略
      if (t.kind === 'image' || t.kind === 'tool') return
      const source = sourcesRef.current[path] ?? ''
      updateTab(path, { saving: 'saving', error: undefined })
      try {
        await saveFile(t.path, source)
        sourcesRef.current[path] = source
        originalSourcesRef.current[path] = source
        updateTab(path, { saving: 'idle', dirty: false, error: undefined })
        setToast({ message: '已保存', kind: 'success' })
      } catch (e) {
        updateTab(path, { saving: 'error', error: String(e) })
        setToast({ message: `保存失败：${String(e)}`, kind: 'error' })
      }
    },
    [tabs, updateTab]
  )

  const copyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      setToast({ message: '已复制路径', kind: 'success' })
    } catch (e) {
      setToast({ message: `复制失败：${String(e)}`, kind: 'error' })
    }
  }, [])

  const createFile = useCallback(async (dir: string, name: string): Promise<string> => {
    return createFileOnDisk(dir, name)
  }, [])

  /** 在指定父目录里创建一个新文件夹，成功返回新目录绝对路径。 */
  const createFolder = useCallback(async (dir: string, name: string): Promise<string> => {
    return createDir(dir, name)
  }, [])

  const migrateRefKey = useCallback((oldPath: string, newPath: string) => {
    if (Object.prototype.hasOwnProperty.call(sourcesRef.current, oldPath)) {
      sourcesRef.current[newPath] = sourcesRef.current[oldPath]
      delete sourcesRef.current[oldPath]
    }
    if (Object.prototype.hasOwnProperty.call(originalSourcesRef.current, oldPath)) {
      originalSourcesRef.current[newPath] = originalSourcesRef.current[oldPath]
      delete originalSourcesRef.current[oldPath]
    }
    if (Object.prototype.hasOwnProperty.call(docsRef.current, oldPath)) {
      docsRef.current[newPath] = docsRef.current[oldPath]
      delete docsRef.current[oldPath]
    }
    if (Object.prototype.hasOwnProperty.call(imagesRef.current, oldPath)) {
      imagesRef.current[newPath] = imagesRef.current[oldPath]
      delete imagesRef.current[oldPath]
    }
  }, [])

  const renamePathAction = useCallback(
    async (path: string, newName: string): Promise<string> => {
      const { old_path: oldPath, new_path: newPath } = await renamePath(path, newName)
      setTabs((prev) =>
        prev.map((tab) => {
          if (!isSameOrChildPath(tab.path, oldPath)) return tab
          const rebased = rebasePath(tab.path, oldPath, newPath)
          migrateRefKey(tab.path, rebased)
          return {
            ...tab,
            path: rebased,
            filename: filenameFromPath(rebased),
          }
        })
      )
      setActiveTabPath((current) =>
        current && isSameOrChildPath(current, oldPath)
          ? rebasePath(current, oldPath, newPath)
          : current
      )
      setToast({ message: '已重命名', kind: 'success' })
      return newPath
    },
    [migrateRefKey]
  )

  const deletePathAction = useCallback(async (path: string): Promise<void> => {
    await deletePath(path)
    setTabs((prev) => {
      const removed = prev.filter((tab) => isSameOrChildPath(tab.path, path))
      for (const tab of removed) {
        delete sourcesRef.current[tab.path]
        delete originalSourcesRef.current[tab.path]
        delete docsRef.current[tab.path]
        delete imagesRef.current[tab.path]
      }
      const next = prev.filter((tab) => !isSameOrChildPath(tab.path, path))
      setActiveTabPath((current) => {
        if (!current || !isSameOrChildPath(current, path)) return current
        return next[0]?.path ?? null
      })
      return next
    })
    setToast({ message: '已删除', kind: 'success' })
  }, [])

  const showInFolderAction = useCallback(async (path: string): Promise<void> => {
    await showInFolder(path)
  }, [])

  const openRootAction = useCallback(async (dir: string): Promise<void> => {
    const path = await openDir(dir)
    setTreeRoot(path)
    setActiveActivity('files')
    setToast({ message: '已打开目录', kind: 'success' })
  }, [])

  /** 关掉整个 reader 窗口。 */
  const quitReader = useCallback(() => {
    void quitReaderWindow().catch(() => {
      document.title = 'reader 已退出'
      const root = document.getElementById('reader-root')
      if (root) {
        root.innerHTML =
          '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#8a7e72;font-family:system-ui;font-size:14px;">reader 已退出，可以关闭此页面</div>'
      }
    })
  }, [])

  /** 切到相对当前 active 的下一个/上一个 tab；环形 */
  const cycleTab = useCallback(
    (delta: 1 | -1) => {
      setTabs((prev) => {
        if (prev.length === 0) return prev
        const idx = prev.findIndex((t) => t.path === activeTabPath)
        const baseIdx = idx < 0 ? 0 : idx
        const next = (baseIdx + delta + prev.length) % prev.length
        setActiveTabPath(prev[next].path)
        return prev
      })
    },
    [activeTabPath]
  )

  // —— 全局快捷键：(⌘|⌃) S / W / ⌥← / ⌥→ / 1 / 2 ——
  const requestQuit = useCallback(() => setQuitting(true), [])
  const handlersRef = useRef({
    saveTab,
    requestCloseTab,
    cycleTab,
    activeTabPath,
    requestQuit,
    selectActivity,
    toggleSidebarCollapsed,
  })
  handlersRef.current = {
    saveTab,
    requestCloseTab,
    cycleTab,
    activeTabPath,
    requestQuit,
    selectActivity,
    toggleSidebarCollapsed,
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const k = e.key.toLowerCase()

      // ⌘S 保存
      if (!e.shiftKey && k === 's') {
        e.preventDefault()
        const p = handlersRef.current.activeTabPath
        if (p) void handlersRef.current.saveTab(p)
        return
      }
      // ⌘W 关 tab；没有 tab 时弹关闭确认（不直接关窗，防误触）
      if (!e.shiftKey && k === 'w') {
        e.preventDefault()
        const p = handlersRef.current.activeTabPath
        if (p) {
          handlersRef.current.requestCloseTab(p)
        } else {
          handlersRef.current.requestQuit()
        }
        return
      }
      // VS Code 风格：⌘⌥← / ⌘⌥→ 切 tab（Win/Linux 用 Ctrl+Alt+←/→）
      if (e.altKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        handlersRef.current.cycleTab(e.key === 'ArrowLeft' ? -1 : 1)
        return
      }
      // ⌘B 切换侧边栏（VSCode 习惯）
      if (!e.shiftKey && !e.altKey && k === 'b') {
        e.preventDefault()
        handlersRef.current.toggleSidebarCollapsed()
        return
      }
      // ⌘1 / ⌘2 切活动栏（VSCode 习惯）
      if (!e.shiftKey && (k === '1' || k === '2')) {
        e.preventDefault()
        handlersRef.current.selectActivity(k === '1' ? 'files' : 'toolbox')
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // —— TOC ——
  const headings = useMemo(() => {
    if (!activeTab || activeTab.kind !== 'markdown') return []
    const doc = docsRef.current[activeTab.path]
    if (!doc) return []
    return extractHeadings(doc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.path, docVersion])

  /** 当前激活 tab 是否是工具 tab —— 工具 tab 没有 TOC，把右栏整列收掉 */
  const showToc = activeTab?.kind === 'markdown'

  /** 当前活跃工具 id（用于 Toolbox 高亮选中态） */
  const activeToolId = activeTab?.kind === 'tool' ? (activeTab.toolId ?? null) : null

  /** 主编辑区最小占比：避免侧栏 + 固定目录挤压核心内容。 */
  const editorMinWidth = useMemo(() => {
    const tocWidth = showToc && tocPinned ? PINNED_TOC_WIDTH : 0
    const sidebarTotalWidth = sidebarCollapsed ? 0 : sidebarWidth + 1
    const reservedWidth = ACTIVITY_BAR_WIDTH + sidebarTotalWidth + tocWidth
    return `max(0px, calc(${MAIN_CONTENT_MIN_RATIO * 100}vw - ${reservedWidth}px))`
  }, [showToc, tocPinned, sidebarCollapsed, sidebarWidth])

  // —— Loading / Error 屏 ——
  if (loadState.kind === 'loading') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-seeyue-fg-dim">
        <div className="relative h-10 w-10">
          <span className="absolute inset-0 rounded-full border-2 border-seeyue-border" />
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-seeyue-accent animate-spin" />
        </div>
        <span className="text-[13px] tracking-wide">加载中…</span>
      </div>
    )
  }
  if (loadState.kind === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(191,97,106,0.12)] text-seeyue-danger">
          <AlertTriangle size={22} />
        </span>
        <div className="text-center">
          <div className="text-[15px] font-medium text-seeyue-fg-strong mb-1">加载失败</div>
          <div className="text-[13px] text-seeyue-fg-muted font-mono whitespace-pre-wrap break-all max-w-[480px]">
            {loadState.message}
          </div>
        </div>
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-seeyue-border bg-seeyue-panel px-3.5 py-1.5 text-[13px] text-seeyue-fg-strong cursor-pointer transition-all duration-150 hover:border-seeyue-accent hover:text-seeyue-accent"
          onClick={() => window.location.reload()}
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <MarkdownBaseDirContext.Provider value={baseDir}>
      <div
        className="h-full grid bg-seeyue-bg text-seeyue-fg"
        data-theme={theme}
        style={{
          gridTemplateColumns: sidebarCollapsed
            ? `${ACTIVITY_BAR_WIDTH}px minmax(0, 1fr)`
            : `${ACTIVITY_BAR_WIDTH}px ${sidebarWidth}px 1px minmax(${editorMinWidth}, 1fr)`,
        }}
      >
        {/* 最左：垂直活动栏 */}
        <ActivityBar
          active={activeActivity}
          theme={theme}
          fontScale={fontScale}
          onSelect={selectActivity}
          onThemeChange={setTheme}
          onFontScaleChange={setFontScale}
        />

        {/* 左：侧栏（按 activeActivity 切换内容）—— 折叠时隐藏 */}
        {!sidebarCollapsed && (
          <aside className="overflow-hidden">
            {activeActivity === 'files' ? (
              <FileTree
                root={treeRoot}
                activePath={activeTabPath}
                onOpen={openFile}
                onCreateFile={createFile}
                onCreateFolder={createFolder}
                onRenamePath={renamePathAction}
                onDeletePath={deletePathAction}
                onShowInFolder={showInFolderAction}
                onOpenRoot={openRootAction}
              />
            ) : (
              <Toolbox activeToolId={activeToolId} onOpen={openTool} />
            )}
          </aside>
        )}

        {/* 侧栏宽度调节 splitter —— 折叠时隐藏 */}
        {!sidebarCollapsed && (
          <VerticalSplitter
            width={sidebarWidth}
            min={SIDEBAR_MIN}
            max={SIDEBAR_MAX}
            defaultWidth={SIDEBAR_DEFAULT}
            onResize={handleSidebarResize}
            ariaLabel="调节侧栏宽度"
          />
        )}

        {/* 中：Tab 条 + 编辑器顶栏 + 编辑区（TOC 浮于其上） */}
        <main className="flex flex-col overflow-hidden relative">
          <TabBar
            tabs={tabs}
            activePath={activeTabPath}
            onActivate={setActiveTabPath}
            onClose={requestCloseTab}
            onCloseOthers={closeOthers}
            onCloseAll={closeAll}
            onCloseSaved={closeSaved}
            copyPath={copyPath}
          />
          {activeTab && activeTab.kind !== 'tool' && (
            <EditorBar
              tab={activeTab}
              onSave={() => saveTab(activeTab.path)}
              onCopyPath={() => copyPath(activeTab.path)}
            />
          )}
          <div
            className={
              'flex-1 overflow-hidden relative ' +
              (showToc && tocPinned
                ? 'grid grid-cols-[minmax(0,1fr)_clamp(208px,18vw,248px)] bg-seeyue-bg'
                : 'block')
            }
          >
            <div className="h-full min-w-0 overflow-hidden relative">
              {activeTab ? (
                activeTab.kind === 'tool' ? (
                  <ToolHost toolId={activeTab.toolId ?? null} />
                ) : activeTab.kind === 'markdown' ? (
                  <MarkdownEditor
                    key={activeTab.path}
                    path={activeTab.path}
                    baseDir={baseDir}
                    initialSource={sourcesRef.current[activeTab.path] ?? ''}
                    initialDoc={docsRef.current[activeTab.path] ?? { blocks: [] }}
                    onChange={handleSourceChange}
                    onParsed={handleDocParsed}
                    onSave={() => saveTab(activeTab.path)}
                  />
                ) : activeTab.kind === 'image' ? (
                  <ImageViewer
                    key={activeTab.path}
                    path={activeTab.path}
                    filename={activeTab.filename}
                    payload={imagesRef.current[activeTab.path] ?? null}
                  />
                ) : (
                  <PlainTextEditor
                    key={activeTab.path}
                    path={activeTab.path}
                    initialSource={sourcesRef.current[activeTab.path] ?? ''}
                    onChange={handleSourceChange}
                  />
                )
              ) : (
                <EmptyState onOpenRoot={() => void openRootAction(treeRoot ?? '')} />
              )}
            </div>
            {/* TOC：未固定时浮于内容区右侧；固定后成为右侧占位栏，不遮挡正文 */}
            {showToc && (
              <TableOfContents
                headings={headings}
                pinned={tocPinned}
                onTogglePinned={toggleTocPinned}
              />
            )}
          </div>
        </main>

        {/* 关闭确认 */}
        {closing && (
          <CloseConfirmDialog
            filename={tabs.find((t) => t.path === closing.path)?.filename ?? ''}
            onSave={async () => {
              await saveTab(closing.path)
              setClosing(null)
              setTabs((prev) => {
                const t = prev.find((x) => x.path === closing.path)
                if (t && !t.dirty) {
                  queueMicrotask(() => forceCloseTab(closing.path))
                }
                return prev
              })
            }}
            onDiscard={() => {
              forceCloseTab(closing.path)
              setClosing(null)
            }}
            onCancel={() => setClosing(null)}
          />
        )}

        {quitting && (
          <QuitConfirmDialog
            dirtyCount={tabs.filter((t) => t.dirty).length}
            onConfirm={() => {
              setQuitting(false)
              quitReader()
            }}
            onCancel={() => setQuitting(false)}
          />
        )}

        {toast && (
          <Toast message={toast.message} kind={toast.kind} onClose={() => setToast(null)} />
        )}
      </div>
    </MarkdownBaseDirContext.Provider>
  )
}
