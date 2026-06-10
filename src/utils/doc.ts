import type { ImagePayload, ParsedDocument, RenderedDoc, Tab } from '../types'

/** 从绝对路径提取文件名。 */
export function filenameFromPath(path: string): string {
  const normalized = path.replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(index + 1) : normalized
}

/** 判断 path 是否等于 dir 或是 dir 的子路径。 */
export function isSameOrChildPath(path: string, dir: string): boolean {
  const normalizedDir = dir.replace(/\/+$/, '')
  return path === normalizedDir || path.startsWith(`${normalizedDir}/`)
}

/** 将 path 的 oldPrefix 替换为 newPrefix。 */
export function rebasePath(path: string, oldPrefix: string, newPrefix: string): string {
  const normalizedOld = oldPrefix.replace(/\/+$/, '')
  if (path === normalizedOld) return newPrefix
  return `${newPrefix}${path.slice(normalizedOld.length)}`
}

/** 将 RenderedDoc 转换为 Tab 元数据。 */
export function docToTab(doc: RenderedDoc): Tab {
  return {
    path: doc.path,
    filename: doc.filename,
    kind:
      doc.kind === 'markdown' || doc.kind === 'plain_text' || doc.kind === 'image'
        ? doc.kind
        : 'plain_text',
    dirty: false,
    saving: 'idle',
  }
}

/**
 * 把一份 RenderedDoc 拆进 sources / docs / images 三个 ref 桶。
 * 与 docToTab 配套使用。
 */
export function ingestDoc(
  doc: RenderedDoc,
  sourcesRef: React.RefObject<Record<string, string>>,
  docsRef: React.RefObject<Record<string, ParsedDocument>>,
  imagesRef: React.RefObject<Record<string, ImagePayload>>,
  originalSourcesRef: React.RefObject<Record<string, string>>
) {
  sourcesRef.current![doc.path] = doc.source
  originalSourcesRef.current![doc.path] = doc.source
  if (doc.kind === 'markdown' && doc.payload) {
    docsRef.current![doc.path] = doc.payload as ParsedDocument
  } else if (doc.kind === 'image' && doc.payload) {
    imagesRef.current![doc.path] = doc.payload as ImagePayload
  }
}
