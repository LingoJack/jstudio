import type { PageTab } from '../editor/block-model'

interface Props {
  tabs: PageTab[]
  activePath: string | null
  onActivate: (path: string) => void
  onClose: (path: string) => void
  onToggleSidebar: () => void
}

export function PageTabs({ tabs, activePath, onActivate, onClose, onToggleSidebar }: Props) {
  return (
    <header className="studio-tabs">
      <button
        type="button"
        className="studio-sidebar-toggle"
        onClick={onToggleSidebar}
        title="切换侧栏"
      >
        ☰
      </button>
      <div className="studio-tab-strip">
        {tabs.map((tab) => (
          <button
            key={tab.path}
            type="button"
            className={`studio-tab ${tab.path === activePath ? 'is-active' : ''}`}
            onClick={() => onActivate(tab.path)}
          >
            <span>{tab.title || '未命名文档'}</span>
            {tab.dirty && <i />}
            <b
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation()
                onClose(tab.path)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onClose(tab.path)
              }}
            >
              ×
            </b>
          </button>
        ))}
      </div>
      <div className="studio-tabs-right">本地优先 · Markdown 兼容</div>
    </header>
  )
}
