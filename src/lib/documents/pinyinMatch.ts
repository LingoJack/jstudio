/**
 * Pinyin-aware fuzzy matching for Chinese text search.
 *
 * Supports three matching strategies (tried in order):
 * 1. Direct substring match — preserves existing behavior for non-Chinese text
 * 2. Full pinyin match — e.g. "linshi" → "临时", "lin" → "临" (partial OK)
 * 3. First-letter pinyin match — e.g. "ls" → "临时"
 *
 * Usage:
 *   const range = pinyinMatchRange('linshi', '临时笔记'); // [0, 2]
 *   pinyinIncludes('临时笔记', 'linshi');                   // true
 */

import { pinyin } from 'pinyin-pro';

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

interface CharPinyinInfo {
  /** The original character (one Unicode code point). */
  char: string;
  /** Pinyin without tones (lowercase), or the char itself if non-Chinese. */
  pinyin: string;
  /** First letter of the pinyin (lowercase), or the char itself. */
  firstLetter: string;
  /** Start index of this char in the original string (UTF-16 code units). */
  utf16Start: number;
  /** End index (exclusive) of this char in the original string. */
  utf16End: number;
}

// ──────────────────────────────────────────────────────────────────
// Pinyin Decomposition Cache
// ──────────────────────────────────────────────────────────────────

const pinyinCache = new Map<string, CharPinyinInfo[]>();
const CACHE_MAX = 2000;

/**
 * Decompose a string into per-character pinyin info.
 * Non-Chinese characters are kept as-is (lowercased).
 */
function decomposePinyin(str: string): CharPinyinInfo[] {
  const cached = pinyinCache.get(str);
  if (cached) return cached;

  // pinyin-pro returns one array element per Unicode code point.
  // Non-Chinese characters are returned as-is.
  const pinyinArr = pinyin(str, {
    pattern: 'pinyin',
    toneType: 'none',
    type: 'array',
  }) as string[];

  const info: CharPinyinInfo[] = [];
  let pyIdx = 0;
  let i = 0;
  while (i < str.length) {
    const codePoint = str.codePointAt(i)!;
    const charLen = codePoint > 0xffff ? 2 : 1; // surrogate pair = 2 UTF-16 units
    const char = String.fromCodePoint(codePoint);
    const py = (pinyinArr[pyIdx] ?? char).toLowerCase();
    info.push({
      char,
      pinyin: py,
      firstLetter: py[0] ?? char.toLowerCase(),
      utf16Start: i,
      utf16End: i + charLen,
    });
    pyIdx++;
    i += charLen;
  }

  // Evict oldest entries if cache is full (simple FIFO, not LRU — good enough).
  if (pinyinCache.size >= CACHE_MAX) {
    const firstKey = pinyinCache.keys().next().value;
    if (firstKey !== undefined) pinyinCache.delete(firstKey);
  }
  pinyinCache.set(str, info);
  return info;
}

// ──────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────

/**
 * Find ALL non-overlapping match ranges of `query` in `target`, using the
 * same pinyin-aware strategy as `pinyinMatchRange` (direct → full pinyin →
 * first-letter). Returns ranges in UTF-16 code-unit indices, in document
 * order. Only the first strategy that yields matches contributes — the
 * others are not mixed in.
 *
 * Used by FindBar to highlight every occurrence in a text node.
 */
export function pinyinMatchAllRanges(
  query: string,
  target: string,
): [number, number][] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const targetLower = target.toLowerCase();

  // ── 1. Direct substring matches (all occurrences) ──
  const directRanges: [number, number][] = [];
  let from = 0;
  let idx = targetLower.indexOf(q, from);
  while (idx !== -1) {
    directRanges.push([idx, idx + q.length]);
    from = idx + q.length;
    idx = targetLower.indexOf(q, from);
  }
  if (directRanges.length > 0) return directRanges;

  // ── 2. Pinyin-based matching ──
  const info = decomposePinyin(target);

  // Build full-pinyin string + start offset of each char's pinyin.
  const pinyinStartOffsets: number[] = [];
  const fullPinyinParts: string[] = [];
  let pos = 0;
  for (const item of info) {
    pinyinStartOffsets.push(pos);
    fullPinyinParts.push(item.pinyin);
    pos += item.pinyin.length;
  }
  const fullPinyin = fullPinyinParts.join('');

  // ── 2a. Full pinyin match (all occurrences) ──
  // The query may end mid-character (e.g. "linsh" → "临时", where "sh" is
  // only part of "shi"). The matched character range includes every char
  // whose pinyin overlaps the query span. To avoid overlapping results,
  // after a match we resume searching just past the last included char's
  // pinyin — not at matchEnd, which may fall inside that char.
  const pinyinRanges: [number, number][] = [];
  let pyFrom = 0;
  let pyIdx = fullPinyin.indexOf(q, pyFrom);
  while (pyIdx !== -1) {
    const matchEnd = pyIdx + q.length;
    let startChar = -1;
    let endChar = info.length;
    for (let i = 0; i < info.length; i++) {
      const charStart = pinyinStartOffsets[i];
      const charEnd = charStart + info[i].pinyin.length;
      if (startChar === -1 && charEnd > pyIdx) {
        startChar = i;
      }
      if (charEnd >= matchEnd) {
        endChar = i + 1;
        break;
      }
    }
    if (startChar !== -1) {
      const lastIncluded = Math.min(endChar, info.length) - 1;
      pinyinRanges.push([info[startChar].utf16Start, info[lastIncluded].utf16End]);
      pyFrom = pinyinStartOffsets[lastIncluded] + info[lastIncluded].pinyin.length;
    } else {
      // Match doesn't fully cover a character boundary — skip forward.
      pyFrom = pyIdx + 1;
    }
    pyIdx = fullPinyin.indexOf(q, pyFrom);
  }
  if (pinyinRanges.length > 0) return pinyinRanges;

  // ── 2b. First-letter match (all occurrences) ──
  const firstLetters = info.map((item) => item.firstLetter).join('');
  const flRanges: [number, number][] = [];
  let flFrom = 0;
  let flIdx = firstLetters.indexOf(q, flFrom);
  while (flIdx !== -1) {
    const flEnd = flIdx + q.length;
    flRanges.push([
      info[flIdx].utf16Start,
      info[Math.min(flEnd, info.length) - 1].utf16End,
    ]);
    flFrom = flIdx + q.length;
    flIdx = firstLetters.indexOf(q, flFrom);
  }
  return flRanges;
}

/**
 * Match a query against a target string using pinyin-aware matching.
 *
 * @param query  Search query — e.g. "linshi", "ls", "临时"
 * @param target Target string to search in — e.g. "临时笔记"
 * @returns `[start, end]` match range in UTF-16 code-unit indices
 *          (compatible with `String.prototype.slice`), or `null`.
 */
export function pinyinMatchRange(
  query: string,
  target: string,
): [number, number] | null {
  const ranges = pinyinMatchAllRanges(query, target);
  return ranges.length > 0 ? ranges[0] : null;
}

/**
 * Boolean wrapper around {@link pinyinMatchRange} for simple filtering.
 */
export function pinyinIncludes(target: string, query: string): boolean {
  return pinyinMatchRange(query, target) !== null;
}
