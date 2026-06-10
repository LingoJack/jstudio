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
import { getToolTitle, ToolRegistryHost } from './toolRegistry'
import { Toast } from './Toast'
import { VerticalSplitter } from './Splitter'
import { MarkdownBaseDirContext } from './MarkdownIR'
import { AlertTriangle } from './Icon'
import type { ImagePayload, ParsedDocument, RenderedDoc, Tab, ToolId } from './types'
import {
  createDir,
  createFile as createFileOnDisk,
  deletePath,
  getInitial,
  openDir,
  openFileDialog,
  openFolderDialog,
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
import { ChevronRight, CopyPath, FileText, Save } from './Icon'

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' }

function moveRecordValue<T>(record: Record<string, T>, oldPath: string, newPath: string) {
  if (!Object.prototype.hasOwnProperty.call(record, oldPath)) return
  record[newPath] = record[oldPath]
  delete record[oldPath]
}

function deleteRecordValue<T>(record: Record<string, T>, path: string) {
  delete record[path]
}

function filenameFromPath(path: string): string {
  const normalized = path.replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

function isSameOrChildPath(path: string, dir: string): boolean {
  const normalizedDir = dir.replace(/\/+$/, '')
  return path === normalizedDir || path.startsWith(`${normalizedDir}/`)
}

function rebasePath(path: string, oldPrefix: string, newPrefix: string): string {
  const normalizedOld = oldPrefix.replace(/\/+$/, '')
  if (path === normalizedOld) return newPrefix
  return `${newPrefix}${path.slice(normalizedOld.length)}`
}

function selectNextActivePath(tabs: Tab[], closingPath: string): string | null {
  const idx = tabs.findIndex((tab) => tab.path === closingPath)
  if (idx < 0) return null
  return tabs[idx - 1]?.path ?? tabs[idx + 1]?.path ?? null
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

  const clearTabResources = useCallback((path: string) => {
    deleteRecordValue(sourcesRef.current, path)
    deleteRecordValue(originalSourcesRef.current, path)
    deleteRecordValue(docsRef.current, path)
    deleteRecordValue(imagesRef.current, path)
  }, [])

  const migrateRefKey = useCallback((oldPath: string, newPath: string) => {
    moveRecordValue(sourcesRef.current, oldPath, newPath)
    moveRecordValue(originalSourcesRef.current, oldPath, newPath)
    moveRecordValue(docsRef.current, oldPath, newPath)
    moveRecordValue(imagesRef.current, oldPath, newPath)
  }, [])

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
        filename: getToolTitle(toolId),
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
        return selectNextActivePath(prev, path)
      })
      return next
    })
    clearTabResources(path)
  }, [clearTabResources])

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
        clearTabResources(tab.path)
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

  // —— 全局快捷键：(⌘|⌃) S / W / O / ⌥← / ⌥→ / 1 / 2 ——
  const requestQuit = useCallback(() => setQuitting(true), [])
  const handlersRef = useRef({
    saveTab,
    requestCloseTab,
    cycleTab,
    activeTabPath,
    requestQuit,
    selectActivity,
    toggleSidebarCollapsed,
    openFile,
    setTreeRoot,
    setActiveActivity,
    setToast,
  })
  handlersRef.current = {
    saveTab,
    requestCloseTab,
    cycleTab,
    activeTabPath,
    requestQuit,
    selectActivity,
    toggleSidebarCollapsed,
    openFile,
    setTreeRoot,
    setActiveActivity,
    setToast,
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
      // ⌘O 打开文件（原生文件选择器）
      if (!e.shiftKey && k === 'o') {
        e.preventDefault()
        void (async () => {
          try {
            const path = await openFileDialog()
            if (path) handlersRef.current.openFile(path)
          } catch {
            // dialog 插件不可用时静默忽略
          }
        })()
        return
      }
      // ⌘⇧O 打开文件夹（原生文件夹选择器）
      if (e.shiftKey && k === 'o') {
        e.preventDefault()
        void (async () => {
          try {
            const dir = await openFolderDialog()
            if (dir) {
              handlersRef.current.setTreeRoot(dir)
              handlersRef.current.setActiveActivity('files')
            }
          } catch {
            // dialog 插件不可用时静默忽略
          }
        })()
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

  // —— EmptyState 的自定义事件（通过事件冒泡因为 EmptyState 无法直接访问 openFile） ——
  useEffect(() => {
    function onOpenFile(e: Event) {
      const path = (e as CustomEvent).detail as string
      if (path) void openFile(path)
    }
    function onOpenFolder(e: Event) {
      const dir = (e as CustomEvent).detail as string
      if (dir) {
        setTreeRoot(dir)
        setActiveActivity('files')
      }
    }
    window.addEventListener('jreader:open-file', onOpenFile)
    window.addEventListener('jreader:open-folder', onOpenFolder)
    return () => {
      window.removeEventListener('jreader:open-file', onOpenFile)
      window.removeEventListener('jreader:open-folder', onOpenFolder)
    }
  }, [openFile])

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
                  <ToolRegistryHost toolId={activeTab.toolId ?? null} />
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
                <EmptyState />
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

// ---------------------------------------------------------------------------
// helpers / sub-components
// ---------------------------------------------------------------------------

function docToTab(doc: RenderedDoc): Tab {
  return {
    path: doc.path,
    filename: doc.filename,
    kind:
      doc.kind === 'markdown' || doc.kind === 'plain_text' || doc.kind === 'image'
        ? doc.kind
        : 'plain_text',
    dirty: false,
    saving: 'idle',
  }
}

/**
 * 把一份 RenderedDoc 拆进 sources / docs / images 三个 ref 桶。
 * 与 docToTab 配套使用。
 *
 * sourcesRef：编辑器当前内容（会随按键更新）
 */
function ingestDoc(
  doc: RenderedDoc,
  sourcesRef: React.RefObject<Record<string, string>>,
  docsRef: React.RefObject<Record<string, ParsedDocument>>,
  imagesRef: React.RefObject<Record<string, ImagePayload>>,
  originalSourcesRef: React.RefObject<Record<string, string>>
) {
  sourcesRef.current![doc.path] = doc.source
  originalSourcesRef.current![doc.path] = doc.source
  if (doc.kind === 'markdown' && doc.payload) {
    docsRef.current![doc.path] = doc.payload as ParsedDocument
  } else if (doc.kind === 'image' && doc.payload) {
    imagesRef.current![doc.path] = doc.payload as ImagePayload
  }
}

/**
 * 编辑器顶栏：面包屑 + 状态徽章 + 保存 / 复制路径快捷按钮。
 *
 * 这块取代了「中央区只有 Tab 条」的潦草感，给用户：
 * - 当前文件的路径上下文
 * - 一眼可见的 dirty / saving 状态
 * - 不必去 menu bar 找的常用操作
 */
function EditorBar({
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

function EmptyState() {
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const mod = isMac ? '⌘' : 'Ctrl'

  const handleOpenFile = async () => {
    try {
      const path = await openFileDialog()
      if (path) {
        // EmptyState 在 Reader 组件内部，但无法直接调用 openFile
        // 通过自定义事件向上传递
        window.dispatchEvent(new CustomEvent('jreader:open-file', { detail: path }))
      }
    } catch {
      /* dialog 不可用时静默忽略 */
    }
  }

  const handleOpenFolder = async () => {
    try {
      const dir = await openFolderDialog()
      if (dir) {
        window.dispatchEvent(new CustomEvent('jreader:open-folder', { detail: dir }))
      }
    } catch {
      /* dialog 不可用时静默忽略 */
    }
  }

  return (
    <div className="h-full bg-seeyue-bg text-seeyue-fg-dim">
      <div className="mx-auto flex h-full max-w-[860px] flex-col justify-center px-16 pb-16">
        <div className="mb-8 flex items-center gap-3 text-seeyue-fg-strong">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-seeyue-border bg-seeyue-panel text-seeyue-accent">
            <FileText size={20} />
          </span>
          <div>
            <div className="text-[24px] font-semibold tracking-[-0.02em]">J Reader</div>
            <div className="mt-1 text-[13px] font-normal text-seeyue-fg-muted">
              选择左侧 Explorer 中的文件开始阅读或编辑
            </div>
          </div>
        </div>

        <div className="grid max-w-[640px] gap-7 md:grid-cols-2">
          <WelcomeSection title="开始">
            <button
              type="button"
              onClick={handleOpenFile}
              className="group flex min-h-8 items-center justify-between gap-4 rounded-md px-2 py-1.5 text-[13px] text-seeyue-fg-muted transition-colors hover:bg-seeyue-elevated hover:text-seeyue-fg cursor-pointer w-full text-left"
            >
              <span>打开文件…</span>
              <kbd className="shrink-0 rounded border border-seeyue-border bg-seeyue-panel px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-seeyue-fg-dim shadow-[inset_0_-1px_0_var(--color-seeyue-border)]">
                {mod}O
              </kbd>
            </button>
            <button
              type="button"
              onClick={handleOpenFolder}
              className="group flex min-h-8 items-center justify-between gap-4 rounded-md px-2 py-1.5 text-[13px] text-seeyue-fg-muted transition-colors hover:bg-seeyue-elevated hover:text-seeyue-fg cursor-pointer w-full text-left"
            >
              <span>打开文件夹…</span>
              <kbd className="shrink-0 rounded border border-seeyue-border bg-seeyue-panel px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-seeyue-fg-dim shadow-[inset_0_-1px_0_var(--color-seeyue-border)]">
                {mod}⇧O
              </kbd>
            </button>
            <WelcomeAction label="打开工具面板" hint={`${mod} 2`} />
            <WelcomeAction label="切回文件面板" hint={`${mod} 1`} />
          </WelcomeSection>
          <WelcomeSection title="快捷键">
            <WelcomeAction label="保存当前文件" hint={`${mod} S`} />
            <WelcomeAction label="关闭当前编辑器" hint={`${mod} W`} />
            <WelcomeAction label="切换前后 Tab" hint={`${mod} Alt ←/→`} />
          </WelcomeSection>
        </div>
      </div>
    </div>
  )
}

function WelcomeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-seeyue-fg-dim">
        {title}
      </h2>
      <div className="grid gap-1.5">{children}</div>
    </section>
  )
}

function WelcomeAction({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="group flex min-h-8 items-center justify-between gap-4 rounded-md px-2 py-1.5 text-[13px] text-seeyue-fg-muted transition-colors hover:bg-seeyue-elevated hover:text-seeyue-fg">
      <span>{label}</span>
      <kbd className="shrink-0 rounded border border-seeyue-border bg-seeyue-panel px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-seeyue-fg-dim shadow-[inset_0_-1px_0_var(--color-seeyue-border)]">
        {hint}
      </kbd>
    </div>
  )
}

function breadcrumb(p: string): string[] {
  if (!p) return ['(empty)']
  const parts = p.split('/').filter(Boolean)
  if (parts.length <= 4) return parts
  return ['…', ...parts.slice(-3)]
}

/** 同步 document.title 与 beforeunload 拦截。 */
function useDirtyTitle(activeTab: Tab | null, anyDirty: boolean) {
  // title
  useEffect(() => {
    const base = activeTab ? `${activeTab.filename} · j reader` : 'j reader'
    document.title = (activeTab?.dirty ? '● ' : '') + base
  }, [activeTab, activeTab?.dirty])

  // beforeunload + shutdown beacon
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (anyDirty) {
        e.preventDefault()
        // Chrome 仍要求 returnValue 设值
        e.returnValue = ''
      } else {
        // sendBeacon 在某些 Chrome 版本（特别是 app 模式关窗口时）会被
        // cancel；用 keepalive fetch 替代，配合服务端心跳超时双保险。
        try {
          void fetch('./api/shutdown', {
            method: 'POST',
            keepalive: true,
          })
        } catch {
          /* 忽略 */
        }
        // 兜底：旧浏览器不支持 keepalive 时退化到 sendBeacon
        if (typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon('./api/shutdown')
        }
      }
    }
    window.addEventListener('beforeunload', handler)
    // pagehide 在 bfcache 关页时仍会 fire，比 beforeunload 更可靠
    window.addEventListener('pagehide', () => {
      if (!anyDirty) {
        try {
          navigator.sendBeacon?.('./api/shutdown')
        } catch {
          /* 忽略 */
        }
      }
    })
    return () => window.removeEventListener('beforeunload', handler)
  }, [anyDirty])
}


