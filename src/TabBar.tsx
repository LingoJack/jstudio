import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Braces,
  Close,
  FileMd,
  FileGeneric,
  FileText,
  FileCode,
  FileImage,
  GitCompare,
  Toolbox as ToolboxIcon,
} from './Icon'
import { pickFileIconKind } from './fileIconKind'
import type { Tab, ToolId } from './types'

interface Props {
  tabs: Tab[]
  activePath: string | null
  onActivate: (path: string) => void
  onClose: (path: string) => void
  onCloseOthers?: (keepPath: string) => void
  onCloseAll?: () => void
  onCloseSaved?: () => void
  copyPath?: (path: string) => void
}

interface TabMenuState {
  x: number
  y: number
  tab: Tab
}

export function TabBar({
  tabs,
  activePath,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseAll,
  onCloseSaved,
  copyPath,
}: Props) {
  const [menu, setMenu] = useState<TabMenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menu) return
    function dismiss(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tab: Tab) => {
      e.preventDefault()
      e.stopPropagation()
      const padding = 8
      const menuW = 180
      const menuH = 200
      const x = Math.min(Math.max(padding, e.clientX), window.innerWidth - menuW - padding)
      const y = Math.min(Math.max(padding, e.clientY), window.innerHeight - menuH - padding)
      setMenu({ x, y, tab })
    },
    []
  )

  if (tabs.length === 0) {
    return (
      <div className="flex items-center h-[38px] bg-seeyue-sidebar-strong/80 border-b border-seeyue-border/70 overflow-x-auto overflow-y-hidden px-3.5 [&::-webkit-scrollbar]:h-1">
        <span className="text-xs text-seeyue-fg-dim tracking-[0.02em]">没有打开的文件</span>
      </div>
    )
  }

  const hasBatchOps = !!(onCloseOthers || onCloseAll || onCloseSaved)

  return (
    <>
      <div className="flex items-stretch h-[38px] bg-seeyue-sidebar-strong/80 border-b border-seeyue-border/70 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:h-1">
        {tabs.map((tab) => {
          const isActive = tab.path === activePath
          return (
            <div
              key={tab.path}
              className="group/tab inline-flex items-center gap-1.5 h-full px-3 pl-3.5 min-w-[128px] max-w-[240px] text-[13px] text-seeyue-fg-muted cursor-pointer relative border-r border-seeyue-border/70 transition-colors duration-150 select-none hover:text-seeyue-fg-strong hover:bg-seeyue-elevated data-[active=true]:text-seeyue-fg-strong data-[active=true]:bg-seeyue-bg after:content-[''] after:absolute after:left-0 after:right-0 after:top-0 after:h-0.5 after:bg-transparent data-[active=true]:after:bg-seeyue-accent"
              data-active={isActive ? 'true' : undefined}
              onClick={() => onActivate(tab.path)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  onClose(tab.path)
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, tab)}
              title={tab.path}
            >
              <span
                className="inline-flex items-center justify-center"
                style={{
                  width: 14,
                  height: 14,
                  color: isActive ? 'var(--color-seeyue-accent)' : 'var(--color-seeyue-fg-muted)',
                }}
              >
                <TabIcon tab={tab} />
              </span>
              <span className="max-w-[200px] flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
                {tab.filename}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.path)
                }}
                className="inline-flex items-center justify-center w-[18px] h-[18px] rounded border-0 bg-transparent text-seeyue-fg-dim cursor-pointer transition-all duration-150 shrink-0 opacity-0 hover:text-seeyue-fg-strong hover:bg-seeyue-elevated group-hover/tab:opacity-100 data-[active=true]:opacity-100 data-[dirty=true]:opacity-0 data-[dirty=true]:group-hover/tab:opacity-100"
                data-active={isActive ? 'true' : undefined}
                data-dirty={tab.dirty ? 'true' : undefined}
                title={tab.dirty ? '关闭 · 有未保存改动' : '关闭'}
                aria-label={`关闭 ${tab.filename}`}
              >
                <Close size={12} />
              </button>
              {tab.dirty && (
                <span
                  className="pointer-events-none absolute right-3 inline-flex h-[18px] w-[18px] items-center justify-center text-seeyue-accent opacity-100 transition-opacity duration-150 group-hover/tab:opacity-0"
                  title="有未保存改动"
                  aria-hidden="true"
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* 右键上下文菜单 */}
      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] overflow-hidden rounded-md border border-seeyue-border bg-seeyue-bg/95 py-1 text-[13px] text-seeyue-fg shadow-[0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <MenuButton
            onClick={() => {
              onClose(menu.tab.path)
              setMenu(null)
            }}
          >
            关闭
          </MenuButton>

          {onCloseOthers && tabs.length > 1 && (
            <MenuButton
              onClick={() => {
                onCloseOthers(menu.tab.path)
                setMenu(null)
              }}
            >
              关闭其他
            </MenuButton>
          )}

          {onCloseAll && tabs.length > 1 && (
            <MenuButton
              onClick={() => {
                onCloseAll()
                setMenu(null)
              }}
            >
              关闭全部
            </MenuButton>
          )}

          {onCloseSaved && hasBatchOps && (
            <MenuButton
              onClick={() => {
                onCloseSaved()
                setMenu(null)
              }}
            >
              关闭已保存
            </MenuButton>
          )}

          {copyPath && (
            <>
              <div className="my-1 border-t border-seeyue-border" />
              <MenuButton
                onClick={() => {
                  copyPath(menu.tab.path)
                  setMenu(null)
                }}
              >
                复制路径
              </MenuButton>
            </>
          )}
        </div>
      )}
    </>
  )
}

function MenuButton(props: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-seeyue-fg-muted cursor-pointer hover:bg-seeyue-elevated hover:text-seeyue-fg-strong"
      onClick={props.onClick}
    >
      <span>{props.children}</span>
    </button>
  )
}

function TabIcon({ tab }: { tab: Tab }) {
  if (tab.kind === 'tool') {
    return <ToolIcon_ toolId={tab.toolId ?? null} />
  }
  switch (pickFileIconKind(tab.filename)) {
    case 'markdown':
      return <FileMd size={13} />
    case 'text':
      return <FileText size={13} />
    case 'code':
      return <FileCode size={13} />
    case 'image':
      return <FileImage size={13} />
    default:
      return <FileGeneric size={13} />
  }
}

function ToolIcon_({ toolId }: { toolId: ToolId | null }) {
  switch (toolId) {
    case 'diff':
      return <GitCompare size={13} />
    case 'json':
      return <Braces size={13} />
    default:
      return <ToolboxIcon size={13} />
  }
}
