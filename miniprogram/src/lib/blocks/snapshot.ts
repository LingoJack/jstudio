import type { Block, RichText } from './types'

/**
 * 快照 body 的防御式解析。
 *
 * backend 对 body 做原样存储（PUT 时是任意 JSON），desktop 端上传尚未实现，
 * 本端是 body 格式的第一个消费者，因此按以下契约宽容解析（desktop 未来实现
 * 上传时需对齐，见 miniprogram/CODEBUDDY.md）：
 *   1. Block[]                    —— 直接就是块数组
 *   2. { blocks: Block[] }        —— 文档对象（含 emoji/title 等元数据的形态）
 *   3. JSON 字符串                —— 再 parse 一次后递归
 *   4. 其他                       —— raw 降级，展示序列化文本
 */
export type ParsedSnapshot =
  | { kind: 'blocks'; blocks: Block[] }
  | { kind: 'raw'; text: string }

/** 判定值是否「长得像」Block 数组（只看首元素，防御脏数据）。 */
function isBlockArray(v: unknown): v is Block[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    typeof v[0] === 'object' &&
    v[0] !== null &&
    typeof (v[0] as Block).type === 'string'
  )
}

/** raw 降级的文本长度上限，防止巨型 body 撑爆 setData。 */
const RAW_TEXT_MAX_LEN = 4000

export function parseSnapshotBody(body: unknown, depth = 0): ParsedSnapshot {
  if (isBlockArray(body)) {
    return { kind: 'blocks', blocks: body }
  }
  if (typeof body === 'string' && depth === 0) {
    try {
      return parseSnapshotBody(JSON.parse(body), depth + 1)
    } catch {
      // 落到 raw
    }
  }
  if (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    isBlockArray((body as { blocks?: unknown }).blocks)
  ) {
    return { kind: 'blocks', blocks: (body as { blocks: Block[] }).blocks }
  }
  return { kind: 'raw', text: rawTextOf(body) }
}

function rawTextOf(body: unknown): string {
  if (body === undefined || body === null) {
    return '（空快照）'
  }
  let text: string
  if (typeof body === 'string') {
    text = body
  } else {
    try {
      text = JSON.stringify(body, null, 2)
    } catch {
      text = String(body)
    }
  }
  return text.length > RAW_TEXT_MAX_LEN ? `${text.slice(0, RAW_TEXT_MAX_LEN)}\n...（内容过长，请在桌面端查看）` : text
}

/**
 * TipTap JSONContent 的最小文本抽取（collapsibleChildren / table rawContent 用）。
 * 只认 doc/paragraph/heading/text 等文本骨架，marks 里抽 bold/italic 等注解，
 * 其余节点（列表/表格等）按段落降级。这是只读端的刻意取舍。
 */
export interface FlattenedLine {
  richText: RichText[]
  /** 标题层级（0 = 普通段落）。 */
  level: number
}

interface TiptapMark {
  type?: string
  attrs?: { color?: string; href?: string }
}

interface TiptapNode {
  type?: string
  attrs?: { level?: number }
  marks?: TiptapMark[]
  text?: string
  content?: TiptapNode[]
}

export function flattenTiptapText(input: unknown): FlattenedLine[] {
  const node = asTiptapNode(input)
  if (!node) {
    return []
  }
  const lines: FlattenedLine[] = []
  collectLines(node, 0, lines)
  return lines
}

function asTiptapNode(input: unknown): TiptapNode | null {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return input as TiptapNode
  }
  return null
}

function collectLines(node: TiptapNode, level: number, out: FlattenedLine[]): void {
  const headingLevel = node.type === 'heading' ? node.attrs?.level ?? 0 : 0
  if (node.type === 'text' && typeof node.text === 'string') {
    appendLine(out, level, [marksToRichText(node.text, node.marks)])
    return
  }
  if (node.type === 'paragraph' || node.type === 'heading') {
    const richText: RichText[] = []
    collectInline(node, richText)
    if (richText.length > 0) {
      appendLine(out, headingLevel > 0 ? headingLevel : level, richText)
    }
    return
  }
  for (const child of node.content ?? []) {
    collectLines(child, level, out)
  }
}

/** 把 text/硬换行等行内节点拍平进 richText。 */
function collectInline(node: TiptapNode, out: RichText[]): void {
  if (node.type === 'text' && typeof node.text === 'string') {
    out.push(marksToRichText(node.text, node.marks))
    return
  }
  if (node.type === 'hardBreak') {
    out.push({ text: '\n', annotations: {} })
    return
  }
  for (const child of node.content ?? []) {
    collectInline(child, out)
  }
}

function marksToRichText(text: string, marks?: TiptapMark[]): RichText {
  const annotations: RichText['annotations'] = {}
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
        annotations.bold = true
        break
      case 'italic':
        annotations.italic = true
        break
      case 'underline':
        annotations.underline = true
        break
      case 'strike':
        annotations.strikethrough = true
        break
      case 'code':
        annotations.code = true
        break
      case 'textStyle':
        if (mark.attrs?.color && mark.attrs.color !== 'default') {
          annotations.color = mark.attrs.color
        }
        break
      case 'link':
        if (mark.attrs?.href) {
          annotations.href = mark.attrs.href
        }
        break
      default:
        break
    }
  }
  return { text, annotations }
}

function appendLine(out: FlattenedLine[], level: number, richText: RichText[]): void {
  out.push({ richText, level })
}
