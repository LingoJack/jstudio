import type { BlockTemplate } from './block-registry'

interface SlashMenuProps {
  query: string
  templates: BlockTemplate[]
  onSelect: (template: BlockTemplate) => void
  onClose: () => void
}

export function SlashMenu({ query, templates, onSelect, onClose }: SlashMenuProps) {
  const normalized = query.trim().toLowerCase()
  const filtered = templates.filter((template) => {
    if (!normalized) return true
    return (
      template.label.toLowerCase().includes(normalized) ||
      template.description.toLowerCase().includes(normalized) ||
      template.type.toLowerCase().includes(normalized)
    )
  })

  return (
    <div className="absolute left-10 top-full z-30 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span>/ 插入内容块</span>
        <button className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose}>
          Esc
        </button>
      </div>
      <div className="max-h-80 overflow-auto p-2">
        {filtered.map((template) => (
          <button
            key={template.type}
            type="button"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-orange-50 dark:hover:bg-slate-800"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(template)}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 font-mono text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {template.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{template.label}</span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                {template.description}
              </span>
            </span>
          </button>
        ))}
        {filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-slate-500">没有匹配的块</div>}
      </div>
    </div>
  )
}
