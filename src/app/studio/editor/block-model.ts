export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'todo'
  | 'quote'
  | 'code'
  | 'divider'
  | 'bullet'
  | 'numbered'

export interface BaseBlock {
  id: string
  type: BlockType
}

export interface TextBlock extends BaseBlock {
  type: 'paragraph' | 'quote' | 'bullet' | 'numbered'
  text: string
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading'
  level: 1 | 2 | 3
  text: string
}

export interface TodoBlock extends BaseBlock {
  type: 'todo'
  checked: boolean
  text: string
}

export interface CodeBlock extends BaseBlock {
  type: 'code'
  lang: string
  code: string
}

export interface DividerBlock extends BaseBlock {
  type: 'divider'
}

export type DocBlock = TextBlock | HeadingBlock | TodoBlock | CodeBlock | DividerBlock

export interface PageDocument {
  id: string
  path: string
  title: string
  icon: string
  blocks: DocBlock[]
  source: string
  dirty: boolean
  saving: 'idle' | 'saving' | 'error'
  sourceFormat: 'markdown'
}

export interface PageTab {
  path: string
  title: string
  dirty: boolean
  openedAt?: number
}

export interface PageTreeNode {
  name: string
  path: string
  isDir: boolean
  title: string
}

export function newBlock(type: BlockType, text = ''): DocBlock {
  const id = `block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  switch (type) {
    case 'heading':
      return { id, type, level: 2, text }
    case 'todo':
      return { id, type, checked: false, text }
    case 'quote':
    case 'bullet':
    case 'numbered':
    case 'paragraph':
      return { id, type, text }
    case 'code':
      return { id, type, lang: '', code: text }
    case 'divider':
      return { id, type }
  }
}

export function blockText(block: DocBlock): string {
  switch (block.type) {
    case 'code':
      return block.code
    case 'divider':
      return ''
    default:
      return block.text
  }
}

export function withBlockText(block: DocBlock, text: string): DocBlock {
  switch (block.type) {
    case 'code':
      return { ...block, code: text }
    case 'divider':
      return block
    default:
      return { ...block, text }
  }
}
