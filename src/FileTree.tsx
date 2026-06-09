import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DirEntry } from './types'
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FileGeneric,
  FileImage,
  FileMd,
  FileText,
  FilePlus,
  FolderClosed,
  FolderOpen,
  Search,
} from './Icon'
import { pickFileIconKind } from './fileIconKind'
import { PromptDialog } from './PromptDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { listDir } from './api'

interface Props {
  root: string
  activePath: string | null
  onOpen: (path: string) => void
  /** 新建文件请求：父级把空文件创建在 dir 下，并把新建的绝对路径回传打开。 */
  onCreateFile?: (dir: string, name: string) => Promise<string>
  /** 新建文件夹请求：父级把新目录创建在 dir 下，并返回新目录绝对路径。 */
  onCreateFolder?: (dir: string, name: string) => Promise<string>
  onRenamePath?: (path: string, newName: string) => Promise<string>
  onDeletePath?: (path: string) => Promise<void>
  onShowInFolder?: (path: string) => Promise<void>
  /** 切换文件树根目录。 */
  onOpenRoot?: (dir: string) => Promise<void> | void
}

type CreateKind = 'file' | 'folder'

interface CreateTarget {
  dir: string
  kind: CreateKind
}

interface RenameTarget {
  entry: DirEntry
  parentDir: string
}

interface DeleteTarget {
  entry: DirEntry
  parentDir: string
}

interface ContextMenuState {
  x: number
  y: number
  dir: string
  entry?: DirEntry
}

/** 每个目录节点维护的状态 */
interface NodeState {
  loading: boolean
  expanded: boolean
  entries: DirEntry[] | null
  truncated: boolean
  error: string | null
}

/**
 * VS Code 风文件树。
 *
 * - 顶部保留根路径面包屑和过滤框，不额外放置操作按钮
 * - 主体：层级文件树，文件夹折叠/展开有 caret + folder icon 双重提示
 * - 目录行的新建文件入口仅在 hover/focus 时出现，避免常驻工具栏干扰
 */
export function FileTree(props: Props) {
  const {
    root,
    activePath,
    onOpen,
    onCreateFile,
    onCreateFolder,
    onRenamePath,
    onDeletePath,
    onShowInFolder,
    onOpenRoot,
  } = props
  // 以路径为 key 存储每个已访问目录的状态
  const [nodes, setNodes] = useState<Record<string, NodeState>>({})
  const [filter, setFilter] = useState('')
  /** 新建对话框：null 表示未打开；非 null 时记录目标父目录和创建类型 */
  const [creating, setCreating] = useState<CreateTarget | null>(null)
  const [creatingError, setCreatingError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renaming, setRenaming] = useState<RenameTarget | null>(null)
  const [renamingError, setRenamingError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [openingRoot, setOpeningRoot] = useState(false)
  const [openingRootError, setOpeningRootError] = useState<string | null>(null)

  const loadDir = useCallback(async (dir: string) => {
    setNodes((prev) => ({
      ...prev,
      [dir]: {
        loading: true,
        expanded: true,
        entries: prev[dir]?.entries ?? null,
        truncated: prev[dir]?.truncated ?? false,
        error: null,
      },
    }))
    try {
      const data = await listDir(dir, false)
      setNodes((prev) => ({
        ...prev,
        [dir]: {
          loading: false,
          expanded: true,
          entries: data.entries,
          truncated: data.truncated,
          error: null,
        },
      }))
    } catch (e) {
      setNodes((prev) => ({
        ...prev,
        [dir]: {
          loading: false,
          expanded: true,
          entries: null,
          truncated: false,
          error: String(e),
        },
      }))
    }
  }, [])

  // 切根目录 → 重载根目录
  useEffect(() => {
    if (!root) return
    void loadDir(root)
    setNodes((prev) => {
      return {
        [root]: prev[root] ?? {
          loading: true,
          expanded: true,
          entries: null,
          truncated: false,
          error: null,
        },
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root])

  const toggleDir = useCallback(
    (dir: string) => {
      const state = nodes[dir]
      if (!state || !state.entries) {
        void loadDir(dir)
        return
      }
      setNodes((prev) => ({
        ...prev,
        [dir]: { ...state, expanded: !state.expanded },
      }))
    },
    [nodes, loadDir]
  )

  const openCreateDialog = useCallback((dir: string, kind: CreateKind) => {
    setContextMenu(null)
    setCreatingError(null)
    setCreating({ dir, kind })
  }, [])

  /**
   * 「新建」对话框确认后实际调用。
   *
   * 失败：把错误回写到 dialog 上方红字提示，dialog 不关，方便用户改名重试。
   * 成功：刷新目标父目录的列表；新文件直接打开，新文件夹保持在树中可见。
   */
  const submitCreate = useCallback(
    async (target: CreateTarget, name: string) => {
      const creator = target.kind === 'file' ? onCreateFile : onCreateFolder
      if (!creator) {
        setCreatingError(
          target.kind === 'file' ? '当前环境不支持新建文件' : '当前环境不支持新建文件夹'
        )
        return
      }
      try {
        const newPath = await creator(target.dir, name)
        setCreating(null)
        setCreatingError(null)
        await loadDir(target.dir)
        if (target.kind === 'file') {
          onOpen(newPath)
        }
      } catch (e) {
        setCreatingError(String(e))
      }
    },
    [onCreateFile, onCreateFolder, loadDir, onOpen]
  )

  const openRenameDialog = useCallback((entry: DirEntry) => {
    setContextMenu(null)
    setRenamingError(null)
    setRenaming({ entry, parentDir: parentDir(entry.path) })
  }, [])

  const submitRename = useCallback(
    async (target: RenameTarget, newName: string) => {
      if (!onRenamePath) {
        setRenamingError('当前环境不支持重命名')
        return
      }
      try {
        await onRenamePath(target.entry.path, newName)
        setRenaming(null)
        setRenamingError(null)
        await loadDir(target.parentDir)
      } catch (e) {
        setRenamingError(String(e))
      }
    },
    [loadDir, onRenamePath]
  )

  const requestDelete = useCallback((entry: DirEntry) => {
    setContextMenu(null)
    setActionError(null)
    setDeleting({ entry, parentDir: parentDir(entry.path) })
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleting || !onDeletePath) return
    try {
      await onDeletePath(deleting.entry.path)
      setDeleting(null)
      setActionError(null)
      await loadDir(deleting.parentDir)
    } catch (e) {
      setActionError(String(e))
    }
  }, [deleting, loadDir, onDeletePath])

  const requestShowInFolder = useCallback(
    async (path: string) => {
      if (!onShowInFolder) return
      setContextMenu(null)
      setActionError(null)
      try {
        await onShowInFolder(path)
      } catch (e) {
        setActionError(String(e))
      }
    },
    [onShowInFolder]
  )

  const openRootDialog = useCallback(() => {
    if (!onOpenRoot) return
    setContextMenu(null)
    setOpeningRootError(null)
    setOpeningRoot(true)
  }, [onOpenRoot])

  const submitOpenRoot = useCallback(
    async (dir: string) => {
      if (!onOpenRoot) {
        setOpeningRootError('当前环境不支持打开目录')
        return
      }
      const trimmed = dir.trim()
      if (!trimmed) {
        setOpeningRootError('请输入目录路径')
        return
      }
      try {
        await onOpenRoot(trimmed)
        setOpeningRoot(false)
        setOpeningRootError(null)
      } catch (e) {
        setOpeningRootError(String(e))
      }
    },
    [onOpenRoot]
  )

  // 路径面包屑分段
  const crumbs = useMemo(() => splitPath(root), [root])
  const filterLower = filter.trim().toLowerCase()

  return (
    <div
      className="h-full flex flex-col text-[13px] text-seeyue-fg bg-seeyue-sidebar"
      onContextMenu={(e) => {
        e.preventDefault()
        setContextMenu({ ...clampMenuPosition(e.clientX, e.clientY), dir: root })
      }}
      onClick={() => setContextMenu(null)}
    >
      {/* —— 路径面包屑 —— */}
      <div className="px-3 pt-2 pb-1.5 flex items-center gap-2">
        <div
          className="min-w-0 flex-1 text-[11px] text-seeyue-fg-dim flex items-center gap-1 truncate"
          title={root}
        >
          {crumbs.map((seg, i) => (
            <span key={i} className="flex items-center gap-1 truncate">
              {i > 0 && <span className="opacity-50">/</span>}
              <span
                className={
                  i === crumbs.length - 1
                    ? 'text-seeyue-fg-strong truncate font-medium'
                    : 'truncate'
                }
              >
                {seg}
              </span>
            </span>
          ))}
        </div>
        {onOpenRoot && (
          <button
            type="button"
            className="shrink-0 rounded border border-seeyue-border bg-seeyue-bg px-2 py-1 text-[11px] text-seeyue-fg-muted transition-colors hover:border-seeyue-accent hover:text-seeyue-fg-strong"
            onClick={(e) => {
              e.stopPropagation()
              openRootDialog()
            }}
            title="打开其他目录"
          >
            打开目录
          </button>
        )}
      </div>

      {/* —— 搜索框 —— */}
      <div className="px-3 pt-2 pb-2">
        <div className="flex items-center gap-1.5 h-7 px-2 bg-seeyue-bg border border-seeyue-border rounded text-seeyue-fg-muted transition-colors duration-150 focus-within:border-seeyue-accent focus-within:bg-seeyue-bg">
          <Search size={13} />
          <input
            type="text"
            value={filter}
            placeholder="过滤已展开项"
            onChange={(e) => setFilter(e.target.value)}
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-seeyue-fg text-[12.5px] font-cjk placeholder:text-seeyue-fg-dim"
          />
          {filter && (
            <button
              type="button"
              className="inline-flex items-center justify-center w-[26px] h-[26px] rounded text-seeyue-fg-dim bg-transparent border-0 cursor-pointer transition-all duration-150 hover:text-seeyue-fg-strong hover:bg-seeyue-elevated disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ width: 18, height: 18 }}
              onClick={() => setFilter('')}
              title="清除"
              aria-label="清除过滤"
            >
              <span style={{ fontSize: 11 }}>×</span>
            </button>
          )}
        </div>
        {actionError && (
          <div className="mx-3 mt-1 rounded-md border border-[rgba(191,97,106,0.35)] bg-[rgba(191,97,106,0.08)] px-3 py-2 text-[12px] leading-5 text-seeyue-danger">
            {actionError}
          </div>
        )}
        {filter && (
          <p className="mt-1.5 mb-0 text-[11px] leading-4 text-seeyue-fg-dim">
            仅过滤已加载/已展开的目录项，未展开目录内的文件不会被搜索。
          </p>
        )}
      </div>

      {/* —— 树体 —— */}
      <div className="flex-1 overflow-y-auto pl-3 pr-2 pb-3">
        <DirNode
          path={root}
          depth={0}
          nodes={nodes}
          onToggle={toggleDir}
          onOpen={onOpen}
          activePath={activePath}
          filter={filterLower}
          onRequestCreate={onCreateFile || onCreateFolder ? openCreateDialog : undefined}
          onRequestMenu={(menu) => setContextMenu({ ...menu, ...clampMenuPosition(menu.x, menu.y) })}
        />
      </div>

      {creating && (
        <PromptDialog
          title={creating.kind === 'file' ? '新建文件' : '新建文件夹'}
          description={`将在 ${creating.dir} 下创建${creating.kind === 'file' ? '新文件' : '新文件夹'}：`}
          initialValue=""
          placeholder={creating.kind === 'file' ? '例如 notes.md' : '例如 assets'}
          confirmLabel="创建"
          error={creatingError ?? undefined}
          onCancel={() => {
            setCreating(null)
            setCreatingError(null)
          }}
          onConfirm={(name) => {
            void submitCreate(creating, name)
          }}
        />
      )}

      {renaming && (
        <PromptDialog
          title={renaming.entry.is_dir ? '重命名文件夹' : '重命名文件'}
          description={`将 ${renaming.entry.path} 重命名为：`}
          initialValue={renaming.entry.name}
          placeholder={renaming.entry.name}
          confirmLabel="重命名"
          error={renamingError ?? undefined}
          onCancel={() => {
            setRenaming(null)
            setRenamingError(null)
          }}
          onConfirm={(name) => {
            void submitRename(renaming, name)
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={deleting.entry.is_dir ? '删除文件夹？' : '删除文件？'}
          description={
            deleting.entry.is_dir
              ? '将删除该文件夹及其中全部内容，此操作不可撤销。'
              : '将删除该文件，此操作不可撤销。'
          }
          detail={deleting.entry.path}
          confirmLabel="删除"
          danger
          onCancel={() => {
            setDeleting(null)
            setActionError(null)
          }}
          onConfirm={() => {
            void confirmDelete()
          }}
        />
      )}

      {openingRoot && (
        <PromptDialog
          title="打开目录"
          description="输入要作为文件树根目录的本地目录路径："
          initialValue={root}
          placeholder="例如 /Users/you/project"
          confirmLabel="打开"
          error={openingRootError ?? undefined}
          onCancel={() => {
            setOpeningRoot(false)
            setOpeningRootError(null)
          }}
          onConfirm={(dir) => {
            void submitOpenRoot(dir)
          }}
        />
      )}

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[150px] overflow-hidden rounded-md border border-seeyue-border bg-seeyue-bg/95 py-1 text-[13px] text-seeyue-fg shadow-[0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {contextMenu.entry && !contextMenu.entry.is_dir && (
            <MenuButton
              onClick={() => {
                onOpen(contextMenu.entry!.path)
                setContextMenu(null)
              }}
            >
              打开
            </MenuButton>
          )}
          {onCreateFile && (!contextMenu.entry || contextMenu.entry.is_dir) && (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-seeyue-fg-muted cursor-pointer hover:bg-seeyue-elevated hover:text-seeyue-fg-strong"
              onClick={() => openCreateDialog(contextMenu.dir, 'file')}
            >
              <FilePlus size={14} />
              <span>新建文件</span>
            </button>
          )}
          {onCreateFolder && (!contextMenu.entry || contextMenu.entry.is_dir) && (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-seeyue-fg-muted cursor-pointer hover:bg-seeyue-elevated hover:text-seeyue-fg-strong"
              onClick={() => openCreateDialog(contextMenu.dir, 'folder')}
            >
              <FolderClosed size={14} />
              <span>新建文件夹</span>
            </button>
          )}
          {contextMenu.entry && onRenamePath && (
            <MenuButton onClick={() => openRenameDialog(contextMenu.entry!)}>重命名</MenuButton>
          )}
          {contextMenu.entry && onDeletePath && (
            <MenuButton danger onClick={() => void requestDelete(contextMenu.entry!)}>
              删除
            </MenuButton>
          )}
          {onShowInFolder && (
            <MenuButton
              onClick={() => void requestShowInFolder(contextMenu.entry?.path ?? contextMenu.dir)}
            >
              {contextMenu.entry?.is_dir ? '在访达中打开' : '在访达中显示'}
            </MenuButton>
          )}
        </div>
      )}
    </div>
  )
}

interface DirNodeProps {
  path: string
  depth: number
  nodes: Record<string, NodeState>
  onToggle: (path: string) => void
  onOpen: (path: string) => void
  activePath: string | null
  filter: string
  onRequestCreate?: (dir: string, kind: CreateKind) => void
  onRequestMenu?: (menu: ContextMenuState) => void
}

function DirNode({
  path,
  depth,
  nodes,
  onToggle,
  onOpen,
  activePath,
  filter,
  onRequestCreate,
  onRequestMenu,
}: DirNodeProps) {
  const state = nodes[path]
  const indent = (lvl: number) => 8 + lvl * 14

  // 在 early-return 之前调用 hooks，避免 react-hooks/rules-of-hooks 违例
  const entries = state?.entries
  const filtered = useMemo(() => {
    if (!entries) return null
    if (!filter) return entries
    return entries.filter((e) => e.name.toLowerCase().includes(filter))
  }, [entries, filter])

  if (!state) return null

  return (
    <div
      className={
        depth > 0
          ? "relative before:content-[''] before:absolute before:top-0 before:bottom-0 before:w-px before:bg-seeyue-border"
          : undefined
      }
    >
      {state.loading && !state.entries && (
        <div
          className="py-1 text-seeyue-fg-dim text-xs flex items-center gap-1"
          style={{ paddingLeft: indent(depth) }}
        >
          <span className="inline-block w-2 h-2 rounded-full bg-seeyue-fg-dim animate-pulse" />
          <span>加载中…</span>
        </div>
      )}
      {state.error && (
        <div
          className="py-1 text-seeyue-danger text-xs whitespace-pre-wrap"
          style={{ paddingLeft: indent(depth) }}
        >
          {state.error}
        </div>
      )}
      {state.expanded &&
        filtered?.map((entry) => (
          <EntryRow
            key={entry.path}
            entry={entry}
            depth={depth + 1}
            nodes={nodes}
            onToggle={onToggle}
            onOpen={onOpen}
            activePath={activePath}
            filter={filter}
            onRequestCreate={onRequestCreate}
            onRequestMenu={onRequestMenu}
          />
        ))}
      {state.expanded && filter && filtered && filtered.length === 0 && (
        <div
          className="py-1 text-seeyue-fg-dim text-xs italic"
          style={{ paddingLeft: indent(depth + 1) }}
        >
          无匹配项
        </div>
      )}
      {state.truncated && (
        <div
          className="py-1 text-seeyue-fg-dim text-xs italic"
          style={{ paddingLeft: indent(depth + 1) }}
        >
          目录过大，仅显示前 2000 项
        </div>
      )}
    </div>
  )
}

function EntryRow({
  entry,
  depth,
  nodes,
  onToggle,
  onOpen,
  activePath,
  filter,
  onRequestCreate,
  onRequestMenu,
}: {
  entry: DirEntry
  depth: number
  nodes: Record<string, NodeState>
  onToggle: (path: string) => void
  onOpen: (path: string) => void
  activePath: string | null
  filter: string
  onRequestCreate?: (dir: string, kind: CreateKind) => void
  onRequestMenu?: (menu: ContextMenuState) => void
}) {
  const sub = nodes[entry.path]
  const isActive = !entry.is_dir && entry.path === activePath
  const indent = 4 + depth * 14
  return (
    <>
      <div
        className="group flex min-h-7 w-full items-center gap-1 rounded-sm border-0 bg-transparent py-[3px] pr-1.5 text-left text-[13px] leading-snug text-seeyue-fg-muted cursor-pointer relative transition-colors duration-150 hover:bg-seeyue-elevated hover:text-seeyue-fg data-[active=true]:bg-seeyue-accent-mute data-[active=true]:text-seeyue-accent data-[active=true]:font-medium before:content-[''] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-r before:bg-transparent data-[active=true]:before:bg-seeyue-accent"
        data-active={isActive ? 'true' : undefined}
        style={{ paddingLeft: indent }}
        title={entry.path}
        role="button"
        tabIndex={0}
        onClick={() => (entry.is_dir ? onToggle(entry.path) : onOpen(entry.path))}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (onRequestMenu) {
            onRequestMenu({
              x: e.clientX,
              y: e.clientY,
              dir: entry.is_dir ? entry.path : parentDir(entry.path),
              entry,
            })
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (entry.is_dir) {
              onToggle(entry.path)
            } else {
              onOpen(entry.path)
            }
          }
        }}
      >
        <span className="shrink-0 text-seeyue-fg-dim inline-flex items-center justify-center w-[14px] h-[14px] transition-colors duration-150 group-hover:text-seeyue-fg-muted group-data-[active=true]:text-seeyue-accent">
          {entry.is_dir ? (
            sub?.expanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )
          ) : null}
        </span>
        <span
          className="shrink-0 inline-flex items-center justify-center w-[18px] h-[18px] text-seeyue-fg-dim transition-colors duration-150 data-[kind=folder]:text-seeyue-fg-dim data-[kind=folder-open]:text-seeyue-fg-muted data-[kind=markdown]:text-seeyue-fg-muted data-[kind=text]:text-seeyue-fg-dim data-[kind=code]:text-seeyue-fg-muted data-[kind=image]:text-seeyue-fg-muted data-[kind=generic]:text-seeyue-fg-dim group-hover:text-seeyue-fg-muted group-data-[active=true]:text-seeyue-accent"
          data-kind={
            entry.is_dir ? (sub?.expanded ? 'folder-open' : 'folder') : pickFileIconKind(entry.name)
          }
        >
          <FileGlyph name={entry.name} isDir={entry.is_dir} expanded={!!sub?.expanded} />
        </span>
        <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
          {entry.name}
        </span>
        {entry.is_dir && onRequestCreate && (
          <button
            type="button"
            className="shrink-0 inline-flex items-center justify-center w-[18px] h-[18px] rounded border-0 bg-transparent text-seeyue-fg-dim cursor-pointer opacity-0 transition-all duration-150 mr-1 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-seeyue-success hover:bg-[rgba(163,190,140,0.15)] group-data-[active=true]:text-seeyue-fg-strong"
            title="在该目录新建文件"
            onClick={(e) => {
              e.stopPropagation()
              onRequestCreate(entry.path, 'file')
            }}
          >
            <FilePlus size={12} />
          </button>
        )}
      </div>
      {entry.is_dir && sub?.expanded && (
        <DirNode
          path={entry.path}
          depth={depth}
          nodes={nodes}
          onToggle={onToggle}
          onOpen={onOpen}
          activePath={activePath}
          filter={filter}
          onRequestCreate={onRequestCreate}
          onRequestMenu={onRequestMenu}
        />
      )}
    </>
  )
}

function MenuButton(props: { children: ReactNode; danger?: boolean; onClick: () => void }) {
  const tone = props.danger
    ? 'text-rose-300 hover:bg-rose-500/10 hover:text-rose-200'
    : 'text-seeyue-fg-muted hover:bg-seeyue-elevated hover:text-seeyue-fg-strong'
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left cursor-pointer ${tone}`}
      onClick={props.onClick}
    >
      <span>{props.children}</span>
    </button>
  )
}

function FileGlyph({ name, isDir, expanded }: { name: string; isDir: boolean; expanded: boolean }) {
  if (isDir) {
    return expanded ? <FolderOpen size={15} /> : <FolderClosed size={15} />
  }
  const kind = pickFileIconKind(name)
  switch (kind) {
    case 'markdown':
      return <FileMd size={15} />
    case 'text':
      return <FileText size={15} />
    case 'code':
      return <FileCode size={15} />
    case 'image':
      return <FileImage size={15} />
    default:
      return <FileGeneric size={15} />
  }
}

function clampMenuPosition(x: number, y: number, width = 180, height = 240): Pick<ContextMenuState, 'x' | 'y'> {
  const padding = 8
  const maxX = Math.max(padding, window.innerWidth - width - padding)
  const maxY = Math.max(padding, window.innerHeight - height - padding)
  return {
    x: Math.min(Math.max(padding, x), maxX),
    y: Math.min(Math.max(padding, y), maxY),
  }
}

function parentDir(path: string): string {
  const normalized = path.replace(/\/+$/, '')
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return '/'
  return normalized.slice(0, idx)
}

function splitPath(p: string): string[] {
  if (!p) return ['(empty)']
  const parts = p.split('/').filter(Boolean)
  if (parts.length === 0) return ['/']
  if (parts.length <= 4) return parts
  return ['…', ...parts.slice(-3)]
}
