/**
 * 编辑器缓存层。
 *
 * 三级缓存：
 * 1. ParseCache —— 语法树缓存（source → Block[]）
 * 2. RenderCache —— DOM 节点缓存（block identity → HTMLElement）
 * 3. InlineCache —— 行内渲染缓存（内容 hash → DocumentFragment）
 */

import type { Block } from '../types'

const DEFAULT_RENDER_CACHE_MAX_ENTRIES = 1200
const DEFAULT_INLINE_CACHE_MAX_ENTRIES = 4000

function pruneMapHead<K, V>(entries: Map<K, V>, maxEntries: number, onDelete?: (value: V) => void) {
  while (entries.size > maxEntries) {
    const firstKey = entries.keys().next().value as K | undefined
    if (firstKey === undefined) return
    const value = entries.get(firstKey)
    if (value !== undefined) onDelete?.(value)
    entries.delete(firstKey)
  }
}

// ---------------------------------------------------------------------------
// Block identity key
// ---------------------------------------------------------------------------

/**
 * 为每个 block 生成稳定的 identity key。
 * 同一位置的 block type 相同 → key 相同 → DOM 复用。
 * 注意：不包含 source 行号，因为编辑后行号会变，导致缓存失效。
 */
export function blockKey(block: Block, index: number): string {
  return `${block.kind.type}@${index}`
}

// ---------------------------------------------------------------------------
// Parse Cache
// ---------------------------------------------------------------------------

export class ParseCache {
  private lastSource = ''
  private lastBlocks: Block[] = []

  /** 获取缓存命中 */
  get(source: string): Block[] | null {
    if (source === this.lastSource) return this.lastBlocks
    return null
  }

  /** 更新缓存 */
  set(source: string, blocks: Block[]) {
    this.lastSource = source
    this.lastBlocks = blocks
  }

  /** 上次解析结果 */
  get last(): Block[] {
    return this.lastBlocks
  }
}

// ---------------------------------------------------------------------------
// Render Cache (DOM node pool)
// ---------------------------------------------------------------------------

export class RenderCache {
  /** block key → DOM 节点 */
  private nodes = new Map<string, HTMLElement>()
  /** 上一次渲染的 key 列表 */
  private _lastKeys: string[] = []
  private readonly maxEntries: number

  constructor(maxEntries = DEFAULT_RENDER_CACHE_MAX_ENTRIES) {
    this.maxEntries = maxEntries
  }

  get size(): number {
    return this.nodes.size
  }

  /** 获取已缓存的 DOM 节点，并刷新 LRU 顺序 */
  get(key: string): HTMLElement | undefined {
    const node = this.nodes.get(key)
    if (!node) return undefined
    this.nodes.delete(key)
    this.nodes.set(key, node)
    return node
  }

  /** 缓存 DOM 节点 */
  set(key: string, node: HTMLElement) {
    this.nodes.set(key, node)
    pruneMapHead(this.nodes, this.maxEntries, (cached) => cached.remove())
  }

  /** 记录本次渲染的 key 列表 */
  setLastKeys(keys: string[]) {
    this._lastKeys = keys
  }

  /** 获取上次的 key 列表 */
  get lastKeys(): string[] {
    return this._lastKeys
  }

  /** 移除不再需要的 DOM 节点 */
  gc(newKeys: Set<string>) {
    for (const [key, node] of this.nodes) {
      if (!newKeys.has(key)) {
        node.remove()
        this.nodes.delete(key)
      }
    }
  }

  /** 清空所有缓存（tab 切换时） */
  clear() {
    this.nodes.clear()
    this._lastKeys = []
  }

  /** 保留指定的 key，移除不在列表中的缓存条目 */
  retain(keys: string[]) {
    const keep = new Set(keys)
    for (const [key, node] of this.nodes) {
      if (!keep.has(key)) {
        node.remove()
        this.nodes.delete(key)
      }
    }
    this._lastKeys = keys
  }
}

// ---------------------------------------------------------------------------
// Inline Cache
// ---------------------------------------------------------------------------

/** 简易字符串 hash（djb2） */
function djb2(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  }
  return h
}

interface InlineCacheEntry {
  text: string
  fragment: DocumentFragment
}

export class InlineCache {
  private fragments = new Map<number, InlineCacheEntry>()
  private readonly maxEntries: number

  constructor(maxEntries = DEFAULT_INLINE_CACHE_MAX_ENTRIES) {
    this.maxEntries = maxEntries
  }

  get size(): number {
    return this.fragments.size
  }

  /** 获取缓存的 inline fragment（返回 clone） */
  get(text: string): DocumentFragment | null {
    const h = djb2(text)
    const cached = this.fragments.get(h)
    if (!cached || cached.text !== text) return null

    this.fragments.delete(h)
    this.fragments.set(h, cached)
    return cached.fragment.cloneNode(true) as DocumentFragment
  }

  /** 缓存 inline fragment */
  set(text: string, frag: DocumentFragment) {
    this.fragments.set(djb2(text), { text, fragment: frag })
    pruneMapHead(this.fragments, this.maxEntries)
  }

  /** 清空 */
  clear() {
    this.fragments.clear()
  }
}
