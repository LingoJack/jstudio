import type { BlockNode, BlockType } from '../model/workspace'

export interface BlockTemplate {
  type: BlockType
  label: string
  description: string
  icon: string
  create: () => BlockNode
}

export function newBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

export function textOf(block: BlockNode, key = 'text'): string {
  const value = block.props[key]
  return typeof value === 'string' ? value : ''
}

export function numberOf(block: BlockNode, key: string, fallback: number): number {
  const value = block.props[key]
  return typeof value === 'number' ? value : fallback
}

export function boolOf(block: BlockNode, key: string, fallback = false): boolean {
  const value = block.props[key]
  return typeof value === 'boolean' ? value : fallback
}

export function rowsOf(block: BlockNode): string[][] {
  const rows = block.props.rows
  if (!Array.isArray(rows)) return [['', ''], ['', '']]
  return rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []))
}

export function canvasShapesOf(block: BlockNode): Array<{ id: string; x: number; y: number; text: string }> {
  const shapes = block.props.shapes
  if (!Array.isArray(shapes)) return []
  return shapes.map((shape, index) => {
    const item = typeof shape === 'object' && shape ? (shape as Record<string, unknown>) : {}
    return {
      id: String(item.id ?? `shape-${index}`),
      x: typeof item.x === 'number' ? item.x : 24 + index * 24,
      y: typeof item.y === 'number' ? item.y : 24 + index * 24,
      text: String(item.text ?? '便签'),
    }
  })
}

export function makeBlock(type: BlockType): BlockNode {
  const id = newBlockId()
  switch (type) {
    case 'heading':
      return { id, type, props: { text: '标题', level: 2 } }
    case 'todo':
      return { id, type, props: { text: '待办事项', checked: false } }
    case 'quote':
      return { id, type, props: { text: '引用内容' } }
    case 'code':
      return { id, type, props: { language: 'ts', code: 'console.log("hello JStudio")' } }
    case 'table':
      return { id, type, props: { rows: [['列 A', '列 B'], ['', '']] } }
    case 'canvas':
      return { id, type, props: { shapes: [{ id: newBlockId(), x: 28, y: 28, text: '想法' }] } }
    case 'image':
      return { id, type, props: { src: '', caption: '图片说明' } }
    case 'html':
      return {
        id,
        type,
        props: {
          html: '<section style="font-family: sans-serif; padding: 32px;"><h1>HTML Presentation</h1><p>在这里编写可交互内容。</p><button onclick="alert(\'Hello\')">试一下</button></section>',
          allowScripts: true,
          mode: 'preview',
        },
      }
    case 'embed':
      return { id, type, props: { pageId: '', caption: '内嵌子文档' } }
    case 'link':
      return { id, type, props: { url: 'https://', label: '链接' } }
    case 'toggle':
      return {
        id,
        type,
        props: { text: '折叠块', open: true },
        children: [makeBlock('paragraph')],
      }
    case 'divider':
      return { id, type, props: {} }
    case 'paragraph':
    default:
      return { id, type: 'paragraph', props: { text: '' } }
  }
}

export const BLOCK_TEMPLATES: BlockTemplate[] = [
  { type: 'paragraph', label: '文本', description: '普通段落与双链', icon: '¶', create: () => makeBlock('paragraph') },
  { type: 'heading', label: '标题', description: '章节标题', icon: 'H', create: () => makeBlock('heading') },
  { type: 'todo', label: '待办', description: '可勾选任务', icon: '☑', create: () => makeBlock('todo') },
  { type: 'quote', label: '引用', description: '强调引用块', icon: '❝', create: () => makeBlock('quote') },
  { type: 'code', label: '代码块', description: '带语言的代码', icon: '</>', create: () => makeBlock('code') },
  { type: 'table', label: '表格', description: '基础行列表格', icon: '▦', create: () => makeBlock('table') },
  { type: 'canvas', label: '画板', description: '轻量白板便签', icon: '□', create: () => makeBlock('canvas') },
  { type: 'image', label: '图片', description: '本地或远程图片', icon: '◫', create: () => makeBlock('image') },
  { type: 'html', label: 'HTML', description: '沙箱在线渲染', icon: '<>', create: () => makeBlock('html') },
  { type: 'embed', label: '子文档', description: '内嵌页面引用', icon: '⊂', create: () => makeBlock('embed') },
  { type: 'link', label: '链接', description: 'URL 或页面链接', icon: '↗', create: () => makeBlock('link') },
  { type: 'toggle', label: '折叠块', description: '可展开内容', icon: '▸', create: () => makeBlock('toggle') },
  { type: 'divider', label: '分割线', description: '视觉分隔', icon: '—', create: () => makeBlock('divider') },
]
