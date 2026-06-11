import type { BlockNode, PageSummary } from '../model/workspace'
import { BLOCK_TEMPLATES, boolOf, canvasShapesOf, makeBlock, numberOf, rowsOf, textOf } from './block-registry'
import { SlashMenu } from './SlashMenu'
import { useState } from 'react'

interface BlockEditorProps {
  blocks: BlockNode[]
  pages: PageSummary[]
  onChange: (blocks: BlockNode[]) => void
}

interface BlockProps {
  block: BlockNode
  pages: PageSummary[]
  onPatch: (patch: Partial<BlockNode>) => void
  onInsertAfter: (block: BlockNode) => void
  onRemove: () => void
}

export function BlockEditor({ blocks, pages, onChange }: BlockEditorProps) {
  const patchBlock = (index: number, patch: Partial<BlockNode>) => {
    onChange(blocks.map((block, current) => (current === index ? { ...block, ...patch } : block)))
  }
  const insertAfter = (index: number, block: BlockNode) => {
    onChange([...blocks.slice(0, index + 1), block, ...blocks.slice(index + 1)])
  }
  const removeAt = (index: number) => {
    const next = blocks.filter((_, current) => current !== index)
    onChange(next.length > 0 ? next : [makeBlock('paragraph')])
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-10">
      <div className="space-y-3">
        {blocks.map((block, index) => (
          <EditableBlock
            key={block.id}
            block={block}
            pages={pages}
            onPatch={(patch) => patchBlock(index, patch)}
            onInsertAfter={(next) => insertAfter(index, next)}
            onRemove={() => removeAt(index)}
          />
        ))}
      </div>
    </div>
  )
}

function EditableBlock({ block, pages, onPatch, onInsertAfter, onRemove }: BlockProps) {
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const updateProps = (props: Record<string, unknown>) => onPatch({ props: { ...block.props, ...props } })
  const commonInput =
    'w-full rounded-xl border border-transparent bg-transparent px-3 py-2 outline-none transition focus:border-orange-200 focus:bg-white focus:shadow-sm dark:focus:border-orange-900 dark:focus:bg-slate-900'

  const handleTextChange = (text: string) => {
    updateProps({ text })
    const slashIndex = text.lastIndexOf('/')
    if (slashIndex >= 0 && (slashIndex === 0 || text[slashIndex - 1] === ' ')) {
      setSlashQuery(text.slice(slashIndex + 1))
    } else {
      setSlashQuery(null)
    }
  }

  const renderTextArea = (key: string, placeholder = '输入内容…', className = '') => (
    <textarea
      className={`${commonInput} min-h-12 resize-y text-slate-800 dark:text-slate-100 ${className}`}
      value={textOf(block, key)}
      placeholder={placeholder}
      onChange={(event) => (key === 'text' ? handleTextChange(event.target.value) : updateProps({ [key]: event.target.value }))}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setSlashQuery(null)
      }}
    />
  )

  return (
    <div className="group relative rounded-2xl hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
      <div className="absolute -left-12 top-2 hidden items-center gap-1 group-hover:flex">
        <button className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => onInsertAfter(makeBlock('paragraph'))}>+</button>
        <button className="rounded-lg px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30" onClick={onRemove}>×</button>
      </div>

      {block.type === 'paragraph' && renderTextArea('text')}
      {block.type === 'heading' && (
        <input
          className={`${commonInput} text-${numberOf(block, 'level', 2) === 1 ? '3xl' : '2xl'} font-bold text-slate-950 dark:text-white`}
          value={textOf(block)}
          onChange={(event) => handleTextChange(event.target.value)}
        />
      )}
      {block.type === 'todo' && (
        <label className="flex items-start gap-3 px-3 py-2">
          <input type="checkbox" className="mt-2" checked={boolOf(block, 'checked')} onChange={(event) => updateProps({ checked: event.target.checked })} />
          {renderTextArea('text', '待办事项')}
        </label>
      )}
      {block.type === 'quote' && <div className="border-l-4 border-orange-300 pl-3">{renderTextArea('text', '引用')}</div>}
      {block.type === 'code' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 dark:border-slate-800">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <input className="bg-transparent text-xs text-slate-400 outline-none" value={textOf(block, 'language')} onChange={(event) => updateProps({ language: event.target.value })} />
            <button className="text-xs text-slate-400" onClick={() => navigator.clipboard?.writeText(textOf(block, 'code'))}>复制</button>
          </div>
          <textarea className="min-h-40 w-full resize-y bg-slate-950 p-4 font-mono text-sm text-slate-100 outline-none" value={textOf(block, 'code')} onChange={(event) => updateProps({ code: event.target.value })} />
        </div>
      )}
      {block.type === 'table' && (
        <table className="w-full overflow-hidden rounded-2xl border border-slate-200 text-sm dark:border-slate-800">
          <tbody>
            {rowsOf(block).map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-slate-200 last:border-0 dark:border-slate-800">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border-r border-slate-200 last:border-0 dark:border-slate-800">
                    <input className="w-full bg-transparent px-3 py-2 outline-none" value={cell} onChange={(event) => {
                      const rows = rowsOf(block)
                      rows[rowIndex][cellIndex] = event.target.value
                      updateProps({ rows })
                    }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {block.type === 'canvas' && <CanvasPreview block={block} onPatch={updateProps} />}
      {block.type === 'image' && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
          <input className={commonInput} value={textOf(block, 'src')} placeholder="图片路径或 URL" onChange={(event) => updateProps({ src: event.target.value })} />
          {textOf(block, 'src') && <img className="mt-3 max-h-96 rounded-xl object-contain" src={textOf(block, 'src')} alt={textOf(block, 'caption')} />}
          <input className={`${commonInput} mt-2 text-sm text-slate-500`} value={textOf(block, 'caption')} onChange={(event) => updateProps({ caption: event.target.value })} />
        </div>
      )}
      {block.type === 'html' && <HtmlBlock block={block} onPatch={updateProps} />}
      {block.type === 'embed' && (
        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <select className={commonInput} value={textOf(block, 'pageId')} onChange={(event) => updateProps({ pageId: event.target.value })}>
            <option value="">选择要内嵌的页面</option>
            {pages.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}
          </select>
          <p className="mt-2 text-sm text-slate-500">内嵌子文档：{pages.find((page) => page.id === textOf(block, 'pageId'))?.title ?? '未选择'}</p>
        </div>
      )}
      {block.type === 'link' && (
        <div className="grid gap-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-800 md:grid-cols-2">
          <input className={commonInput} value={textOf(block, 'label')} onChange={(event) => updateProps({ label: event.target.value })} />
          <input className={commonInput} value={textOf(block, 'url')} onChange={(event) => updateProps({ url: event.target.value })} />
        </div>
      )}
      {block.type === 'toggle' && (
        <details className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800" open={boolOf(block, 'open', true)} onToggle={(event) => updateProps({ open: event.currentTarget.open })}>
          <summary className="cursor-pointer font-medium">{textOf(block) || '折叠块'}</summary>
          <div className="mt-3 border-l border-slate-200 pl-4 dark:border-slate-800">
            <BlockEditor blocks={block.children?.length ? block.children : [makeBlock('paragraph')]} pages={pages} onChange={(children) => onPatch({ children })} />
          </div>
        </details>
      )}
      {block.type === 'divider' && <hr className="my-6 border-slate-200 dark:border-slate-800" />}

      {slashQuery !== null && (
        <SlashMenu
          query={slashQuery}
          templates={BLOCK_TEMPLATES}
          onClose={() => setSlashQuery(null)}
          onSelect={(template) => {
            onPatch(template.create())
            setSlashQuery(null)
          }}
        />
      )}
    </div>
  )
}

function HtmlBlock({ block, onPatch }: { block: BlockNode; onPatch: (props: Record<string, unknown>) => void }) {
  const [mode, setMode] = useState(textOf(block, 'mode') || 'preview')
  const html = textOf(block, 'html')
  const allowScripts = boolOf(block, 'allowScripts', false)
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <span className="text-sm font-medium">HTML 沙箱</span>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1"><input type="checkbox" checked={allowScripts} onChange={(event) => onPatch({ allowScripts: event.target.checked })} />允许脚本</label>
          <button onClick={() => setMode(mode === 'preview' ? 'edit' : 'preview')}>{mode === 'preview' ? '编辑' : '预览'}</button>
        </div>
      </div>
      {mode === 'preview' ? (
        <iframe title={block.id} className="h-80 w-full bg-white" sandbox={allowScripts ? 'allow-scripts' : ''} srcDoc={html} />
      ) : (
        <textarea className="h-80 w-full resize-y bg-slate-950 p-4 font-mono text-sm text-slate-100 outline-none" value={html} onChange={(event) => onPatch({ html: event.target.value })} />
      )}
    </div>
  )
}

function CanvasPreview({ block, onPatch }: { block: BlockNode; onPatch: (props: Record<string, unknown>) => void }) {
  const shapes = canvasShapesOf(block)
  return (
    <div className="relative h-64 overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.5)_1px,transparent_0)] [background-size:20px_20px] dark:border-slate-800 dark:bg-slate-950">
      {shapes.map((shape, index) => (
        <input
          key={shape.id}
          className="absolute w-36 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm shadow-sm outline-none dark:border-orange-900 dark:bg-orange-950"
          style={{ left: shape.x, top: shape.y }}
          value={shape.text}
          onChange={(event) => {
            const next = shapes.map((item, current) => current === index ? { ...item, text: event.target.value } : item)
            onPatch({ shapes: next })
          }}
        />
      ))}
      <button className="absolute bottom-3 right-3 rounded-xl bg-slate-900 px-3 py-2 text-xs text-white" onClick={() => onPatch({ shapes: [...shapes, { id: `shape-${Date.now()}`, x: 32 + shapes.length * 18, y: 32 + shapes.length * 18, text: '新便签' }] })}>添加便签</button>
    </div>
  )
}
