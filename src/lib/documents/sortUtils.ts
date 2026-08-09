import type { DocumentMeta, FolderMeta } from '../../types/storage';

/**
 * Sort key for the document sidebar list.
 * - `'created'` – sort by document creation time
 * - `'title'`   – sort alphabetically by title (Chinese sorted by pinyin)
 */
export type DocSortKey = 'created' | 'title';

/**
 * Sort direction – ascending or descending.
 */
export type DocSortDirection = 'asc' | 'desc';

/**
 * Default sort configuration.
 */
export const DEFAULT_DOC_SORT_KEY: DocSortKey = 'created';
export const DEFAULT_DOC_SORT_DIRECTION: DocSortDirection = 'desc';

/**
 * Type guard / coercion for a raw settings value into `DocSortKey`.
 */
export function coerceDocSortKey(value: unknown): DocSortKey {
  return value === 'title' ? 'title' : 'created';
}

/**
 * Type guard / coercion for a raw settings value into `DocSortDirection`.
 */
export function coerceDocSortDirection(value: unknown): DocSortDirection {
  return value === 'asc' ? 'asc' : 'desc';
}

/**
 * A locale-aware collator that sorts Chinese characters by their pinyin
 * reading (e.g.  "苹果" before "香蕉" because "ping" < "xiang").
 *
 * The `zh-Hans-CN` locale uses pinyin collation by default in ICU, which
 * is available in all modern WebView engines (WebKit on macOS, WebView2
 * on Windows).  `numeric: true` ensures natural number ordering so that
 * "doc2" comes before "doc10".
 *
 * A single shared instance is created lazily for performance.
 */
let pinyinCollator: Intl.Collator | null = null;
function getPinyinCollator(): Intl.Collator {
  if (!pinyinCollator) {
    pinyinCollator = new Intl.Collator('zh-Hans-CN', {
      sensitivity: 'base',
      numeric: true,
    });
  }
  return pinyinCollator;
}

/**
 * Compare two strings using pinyin-aware collation.
 * Falls back gracefully if the locale is unavailable.
 */
export function compareByPinyin(a: string, b: string): number {
  return getPinyinCollator().compare(a, b);
}

/**
 * Sort an array of `DocumentMeta` in-place by the given key + direction.
 *
 * - `'created'` sorts by `createdAt` (ISO timestamp string comparison).
 * - `'title'`   sorts alphabetically with pinyin support for Chinese.
 */
export function sortDocuments(
  docs: DocumentMeta[],
  key: DocSortKey,
  direction: DocSortDirection,
): DocumentMeta[] {
  const factor = direction === 'asc' ? 1 : -1;
  return docs.sort((a, b) => {
    if (key === 'title') {
      return factor * compareByPinyin(a.title || '', b.title || '');
    }
    // 'created'
    return factor * (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}

/**
 * Sort an array of `FolderMeta` in-place by name with pinyin support.
 *
 * Folders don't have a `createdAt`, so they are always sorted by name.
 * The `direction` parameter controls ascending / descending order.
 */
export function sortFolders(
  folders: FolderMeta[],
  direction: DocSortDirection,
): FolderMeta[] {
  const factor = direction === 'asc' ? 1 : -1;
  return folders.sort((a, b) => factor * compareByPinyin(a.name, b.name));
}
