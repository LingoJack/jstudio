/**
 * Global search logic: search across document titles and content.
 *
 * - Title matching uses pinyin-aware fuzzy matching (same as CommandPalette).
 * - Content matching uses case-insensitive substring matching.
 * - Results are unified into a single list, tagged by match type.
 */

import type { Document } from '../../types/document';
import { pinyinMatchRange } from './pinyinMatch';

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export type SearchMatchType = 'title' | 'content';

export interface GlobalSearchResult {
  docId: string;
  title: string;
  emoji: string;
  matchType: SearchMatchType;
  updatedAt: string;
  /** For content matches: a short context snippet around the match. */
  snippet: string | null;
  /** Highlight range [start, end] within `snippet` (UTF-16 code units). */
  snippetRange: [number, number] | null;
}

// ──────────────────────────────────────────────────────────────────
// Snippet extraction
// ──────────────────────────────────────────────────────────────────

const SNIPPET_RADIUS = 40;

/**
 * Extract a context snippet around a match position in `text`.
 *
 * @param text       The full plain-text content of the document.
 * @param matchStart Start index of the match (inclusive).
 * @param matchLen   Length of the matched query.
 * @returns `{ snippet, range }` where `range` is the highlight range
 *          within `snippet`.
 */
function extractSnippet(
  text: string,
  matchStart: number,
  matchLen: number,
): { snippet: string; range: [number, number] } {
  const matchEnd = matchStart + matchLen;

  // Try to start at a line boundary for cleaner context
  let snippetStart = matchStart - SNIPPET_RADIUS;
  if (snippetStart < 0) snippetStart = 0;
  else {
    // Walk back to the nearest newline for a cleaner start
    const nlIdx = text.lastIndexOf('\n', matchStart);
    if (nlIdx !== -1 && nlIdx >= snippetStart) {
      snippetStart = nlIdx + 1;
    }
  }

  let snippetEnd = matchEnd + SNIPPET_RADIUS;
  if (snippetEnd > text.length) snippetEnd = text.length;
  else {
    // Walk forward to the nearest newline for a cleaner end
    const nlIdx = text.indexOf('\n', matchEnd);
    if (nlIdx !== -1 && nlIdx <= snippetEnd) {
      snippetEnd = nlIdx;
    }
  }

  const snippet = text.slice(snippetStart, snippetEnd);
  const range: [number, number] = [
    matchStart - snippetStart,
    matchEnd - snippetStart,
  ];

  // Add ellipsis if truncated
  let result = snippet;
  let rangeOffset = 0;
  if (snippetStart > 0) {
    result = '…' + result;
    rangeOffset += 1;
  }
  if (snippetEnd < text.length) {
    result = result + '…';
  }

  return {
    snippet: result,
    range: [range[0] + rangeOffset, range[1] + rangeOffset],
  };
}

// ──────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────

/**
 * Perform a global search across document titles and content.
 *
 * @param query     Search query string.
 * @param documents All documents to search (from the store).
 * @param textIndex Pre-built `Map<docId, plainText>` from `extractPlainText`.
 * @returns Unified result list, sorted by match type then recency.
 */
export function performGlobalSearch(
  query: string,
  documents: Document[],
  textIndex: Map<string, string>,
): GlobalSearchResult[] {
  const q = query.trim();
  if (!q) return [];

  const lowerQ = q.toLowerCase();
  const results: GlobalSearchResult[] = [];

  for (const doc of documents) {
    const title = doc.title || '';
    const titleMatch = pinyinMatchRange(q, title);

    if (titleMatch) {
      results.push({
        docId: doc.id,
        title,
        emoji: doc.emoji || '📝',
        matchType: 'title',
        updatedAt: doc.updatedAt,
        snippet: null,
        snippetRange: null,
      });
      continue; // Title match takes priority – don't also show as content
    }

    // Content match: case-insensitive substring
    const content = textIndex.get(doc.id) ?? '';
    if (!content) continue;

    const contentIdx = content.toLowerCase().indexOf(lowerQ);
    if (contentIdx !== -1) {
      const { snippet, range } = extractSnippet(
        content,
        contentIdx,
        q.length,
      );
      results.push({
        docId: doc.id,
        title,
        emoji: doc.emoji || '📝',
        matchType: 'content',
        updatedAt: doc.updatedAt,
        snippet,
        snippetRange: range,
      });
    }
  }

  // Sort: title matches first, then content matches.
  // Within each group, sort by updatedAt descending (most recent first).
  results.sort((a, b) => {
    if (a.matchType !== b.matchType) {
      return a.matchType === 'title' ? -1 : 1;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return results;
}
