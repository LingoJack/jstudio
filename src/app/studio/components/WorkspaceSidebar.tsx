import type { ListResp } from '../../../types'
import type { PageTreeNode } from '../editor/block-model'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface PageTemplate {
  title: string
  description: string
  source: string
}

interface Props {
  root: string
  workspaceName: string
  activePath: string | null
  version: number
  dirtyCount: number
  totalWords: number
  templates: PageTemplate[]
  listDir: (dir: string, hidden?: boolean) => Promise<ListResp>
  onOpenPage: (path: string) => void
  onCreatePage: (dir?: string, template?: PageTemplate) => void
  onCreateGroup: (dir?: string, name?: string) => void
  onOpenWorkspace: () => void
  onShowInFolder: (path: string) => void
}

interface NodeState {
  expanded: boolean
  loading: boolean
  children: PageTreeNode[]
  error: string | null
}

function titleFromName(name: string): string {
  return name.replace(/\.(md|markdown|mdx)$/i, '')
}

function isDoc(name: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(name)
}

function toNodes(entries: ListResp['entries']): PageTreeNode[] {
  return entries
    .filter((entry) => entry.is_dir || isDoc(entry.name))
    .sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name, 'zh-CN'))
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      isDir: entry.is_dir,
      title: entry.is_dir ? entry.name : titleFromName(entry.name),
    }))
}

export function WorkspaceSidebar(props: Props) {
  const {
    root,
    workspaceName,
    activePath,
    version,
    dirtyCount,
    totalWords,
    templates,
    listDir,
    onOpenPage,
    onCreatePage,
    onCreateGroup,
    onOpenWorkspace,
    onShowInFolder,
  } = props
  const [nodes, setNodes] = useState<Record<string, NodeState>>({})
  const [query, setQuery] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)

  const load = useCallback(
    async (dir: string) => {
      setNodes((prev) => ({
        ...prev,
        [dir]: { expanded: true, loading: true, children: prev[dir]?.children ?? [], error: null },
      }))
      try {
        const resp = await listDir(dir, false)
        setNodes((prev) => ({
          ...prev,
          [dir]: { expanded: true, loading: false, children: toNodes(resp.entries), error: null },
        }))
      } catch (e) {
        setNodes((prev) => ({
          ...prev,
          [dir]: { expanded: true, loading: false, children: [], error: String(e) },
        }))
      }
    },
    [listDir]
  )

  useEffect(() => {
    if (root) void load(root)
  }, [load, root, version])

  const toggle = useCallback(
    (path: string) => {
      const state = nodes[path]
      if (!state || state.children.length === 0) {
        void load(path)
        return
      }
      setNodes((prev) => ({ ...prev, [path]: { ...state, expanded: !state.expanded } }))
    },
    [load, nodes]
  )

  const filteredRoot = useMemo(() => nodes[root]?.children ?? [], [nodes, root])

  function renderNode(node: PageTreeNode, depth: number) {
    const state = nodes[node.path]
    const expanded = state?.expanded ?? false
    const hidden = query && !node.title.toLowerCase().includes(query.toLowerCase())
    if (hidden && !node.isDir) return null
    return (
      <div key={node.path} className="studio-tree-node">
        <div
          className={`studio-tree-row ${activePath === node.path ? 'is-active' : ''}`}
          style={{ paddingLeft: 12 + depth * 18 }}
          onDoubleClick={() => (node.isDir ? toggle(node.path) : onOpenPage(node.path))}
        >
          <button
            type="button"
            className="studio-tree-main"
            onClick={() => (node.isDir ? toggle(node.path) : onOpenPage(node.path))}
          >
            <span className="studio-tree-icon">{node.isDir ? (expanded ? '▾' : '▸') : '◌'}</span>
            <span className="studio-tree-title">{node.title}</span>
          </button>
          <div className="studio-tree-actions">
            {node.isDir && (
              <button type="button" onClick={() => onCreatePage(node.path)} title="新建子页面">
                +
              </button>
            )}
            <button type="button" onClick={() => onShowInFolder(node.path)} title="在文件夹中显示">
              ⌁
            </button>
          </div>
        </div>
        {node.isDir && expanded && (
          <div>
            {state?.loading && (
              <div className="studio-tree-hint" style={{ paddingLeft: 34 + depth * 18 }}>
                载入中…
              </div>
            )}
            {state?.error && (
              <div className="studio-tree-error" style={{ paddingLeft: 34 + depth * 18 }}>
                {state.error}
              </div>
            )}
            {state?.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="studio-sidebar">
      <div className="studio-sidebar-brand">
        <div>
          <span>JStudio</span>
          <strong>{workspaceName}</strong>
        </div>
        <button type="button" onClick={onOpenWorkspace}>
          切换
        </button>
      </div>
      <div className="studio-sidebar-actions">
        <button
          type="button"
          className="studio-primary-button"
          onClick={() => onCreatePage(root, templates[0])}
        >
          新建页面
        </button>
        <button
          type="button"
          className="studio-secondary-button"
          onClick={() => setShowTemplates((value) => !value)}
        >
          模板
        </button>
      </div>
      {showTemplates && (
        <div className="studio-sidebar-templates">
          {templates.slice(1).map((template) => (
            <button key={template.title} type="button" onClick={() => onCreatePage(root, template)}>
              <strong>{template.title}</strong>
              <span>{template.description}</span>
            </button>
          ))}
          <button type="button" onClick={() => onCreateGroup(root)}>
            <strong>新建分组</strong>
            <span>整理一组关联页面</span>
          </button>
        </div>
      )}
      <div className="studio-workspace-stats">
        <span>{totalWords} 字</span>
        <span>{dirtyCount ? `${dirtyCount} 篇待保存` : '全部已保存'}</span>
      </div>
      <label className="studio-search">
        <span>搜索</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入页面标题"
        />
      </label>
      <div className="studio-section-label">知识库页面</div>
      <nav className="studio-tree">
        {(filteredRoot.length ? filteredRoot : []).map((node) => renderNode(node, 0))}
        {!filteredRoot.length && (
          <div className="studio-empty-tree">还没有页面，先创建一篇文档。</div>
        )}
      </nav>
    </aside>
  )
}
