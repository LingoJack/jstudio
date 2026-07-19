/**
 * useCrossSectionFind — coordinates find-in-document across N independent
 * section editors.
 *
 * Background: each SectionEditor is its own ProseMirror instance, so there is
 * no single doc to search. The find coordinator walks every section in
 * document order, scans each ProseMirror doc's text nodes for matches, and
 * paints highlights via `setSectionSearchMatches` (a metadata-only decoration
 * plugin — see `sectionSearchHighlight.ts`).
 *
 * Strategy:
 *   1. `rescan()` iterates `getOrder()`, calls `getEditor(id).state.doc.descendants()`
 *      on each section, and collects matches into a flat `SearchMatch[]`.
 *   2. The active match (indexed by `currentIndex`) is painted with a stronger
 *      highlight class, and its section's editor is focused + selection set
 *      so ProseMirror scrolls it into view.
 *   3. `next()` / `prev()` cycle `currentIndex` within `[0, matches.length)`.
 *   4. Each editor's `update` event triggers a debounced `rescan()` so matches
 *      stay fresh as the user edits. Re-subscription timers catch sections
 *      that mount progressively after the doc loads.
 *
 * The hook reuses the same `CrossSelectionContext` shape as
 * `useCrossSectionSelection` — `{ getOrder, getHandle, getEditor }` — so the
 * parent can hand the same context object to both coordinators.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';

import {
  setSectionSearchMatches,
  type SearchMatchRange,
} from '../../../lib/editor/extensions/sectionSearchHighlight';
import type { CrossSelectionContext } from './useCrossSectionSelection';

/** A single match: which section it lives in + the local ProseMirror range. */
export interface SearchMatch {
  sectionId: string;
  from: number;
  to: number;
}

export interface UseCrossSectionFindReturn {
  /** All matches found in the last scan, in document order. */
  matches: SearchMatch[];
  /** Index of the currently-active match (the one Enter will jump to). */
  currentIndex: number;
  /** Jump to the next match (wraps around). */
  next: () => void;
  /** Jump to the previous match (wraps around). */
  prev: () => void;
  /** Re-run the search against the current query. Called by FindBar on input. */
  rescan: () => void;
  /** Clear all matches + highlights. Called when the FindBar closes. */
  clear: () => void;
}

/** Re-subscription delays to catch progressively-mounted sections. */
const RESUB_DELAYS = [100, 300, 800, 2000];
/** Debounce window for editor-update-triggered rescans. */
const RESCAN_DEBOUNCE_MS = 100;

export function useCrossSectionFind(
  ctx: CrossSelectionContext,
  /** When this changes (e.g. active document id), matches are cleared. */
  resetKey: string | null,
  /** Current search query. Pass the live value; the hook re-scans on change. */
  query: string,
): UseCrossSectionFindReturn {
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Keep latest ctx + query in refs so callbacks never go stale.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const queryRef = useRef(query);
  queryRef.current = query;

  // Mutable match list — read inside callbacks without triggering re-renders.
  const matchesRef = useRef<SearchMatch[]>([]);
  matchesRef.current = matches;
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;

  /** Clear highlights on every currently-mounted section editor. */
  const clearAllHighlights = useCallback(() => {
    const order = ctxRef.current.getOrder();
    for (const id of order) {
      setSectionSearchMatches(ctxRef.current.getEditor(id), [], null);
    }
  }, []);

  /** Repaint highlights on every section based on the current match list. */
  const paintAll = useCallback(() => {
    const order = ctxRef.current.getOrder();
    const cur = currentIndexRef.current;
    const active = matchesRef.current[cur];
    for (const id of order) {
      const editor = ctxRef.current.getEditor(id);
      if (!editor) continue;
      const sectionMatches: SearchMatchRange[] = matchesRef.current
        .filter((m) => m.sectionId === id)
        .map((m) => ({ from: m.from, to: m.to }));
      const activeIdxInSection = active && active.sectionId === id
        ? sectionMatches.findIndex(
            (m) => m.from === active.from && m.to === active.to,
          )
        : null;
      setSectionSearchMatches(editor, sectionMatches, activeIdxInSection);
    }
  }, []);

  /** Scan every section's ProseMirror doc for occurrences of `query`. */
  const rescan = useCallback(() => {
    const q = queryRef.current;
    if (!q) {
      matchesRef.current = [];
      setMatches([]);
      setCurrentIndex(0);
      clearAllHighlights();
      return;
    }

    const order = ctxRef.current.getOrder();
    const needle = q.toLowerCase();
    const found: SearchMatch[] = [];

    for (const id of order) {
      const editor = ctxRef.current.getEditor(id);
      if (!editor || editor.isDestroyed) continue;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text) {
          const text = node.text.toLowerCase();
          let idx = text.indexOf(needle);
          while (idx !== -1) {
            found.push({
              sectionId: id,
              from: pos + idx,
              to: pos + idx + q.length,
            });
            idx = text.indexOf(needle, idx + needle.length);
          }
        }
        return true;
      });
    }

    matchesRef.current = found;
    setMatches(found);
    // Keep currentIndex in range; reset to 0 if the previous active match
    // is no longer present (e.g. the user edited the doc).
    if (found.length === 0) {
      setCurrentIndex(0);
      clearAllHighlights();
      return;
    }
    if (currentIndexRef.current >= found.length) {
      setCurrentIndex(0);
    }
    paintAll();
  }, [clearAllHighlights, paintAll]);

  /** Focus the active match's section + scroll it into view. */
  const focusActive = useCallback(() => {
    const cur = currentIndexRef.current;
    const m = matchesRef.current[cur];
    if (!m) return;
    const handle = ctxRef.current.getHandle(m.sectionId);
    handle?.setTextSelection(m.from, m.to);
  }, []);

  const next = useCallback(() => {
    if (matchesRef.current.length === 0) return;
    setCurrentIndex((i) => (i + 1) % matchesRef.current.length);
  }, []);

  const prev = useCallback(() => {
    if (matchesRef.current.length === 0) return;
    setCurrentIndex(
      (i) => (i - 1 + matchesRef.current.length) % matchesRef.current.length,
    );
  }, []);

  const clear = useCallback(() => {
    matchesRef.current = [];
    setMatches([]);
    setCurrentIndex(0);
    clearAllHighlights();
  }, [clearAllHighlights]);

  // ── Re-scan when the query changes ──────────────────────────────────
  useEffect(() => {
    rescan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // ── When currentIndex changes, repaint + focus the active match ─────
  useEffect(() => {
    if (matchesRef.current.length === 0) return;
    paintAll();
    focusActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // ── Reset on document switch ────────────────────────────────────────
  useEffect(() => {
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // ── Subscribe to each editor's `update` for live re-scan ─────────────
  // Re-attempt subscription on timers to catch progressively-mounted
  // sections (mirrors the pattern in SectionOutline.tsx).
  const subscribedRef = useRef<Set<Editor>>(new Set());
  const rescanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const scheduleRescan = () => {
      if (rescanTimerRef.current) clearTimeout(rescanTimerRef.current);
      rescanTimerRef.current = setTimeout(() => {
        rescanTimerRef.current = null;
        rescan();
      }, RESCAN_DEBOUNCE_MS);
    };

    const subscribeAll = () => {
      const order = ctxRef.current.getOrder();
      for (const id of order) {
        const editor = ctxRef.current.getEditor(id);
        if (!editor || editor.isDestroyed) continue;
        if (subscribedRef.current.has(editor)) continue;
        editor.on('update', scheduleRescan);
        subscribedRef.current.add(editor);
      }
    };

    subscribedRef.current = new Set();
    subscribeAll();
    const timers = RESUB_DELAYS.map((ms) =>
      window.setTimeout(subscribeAll, ms),
    );

    return () => {
      if (rescanTimerRef.current) {
        clearTimeout(rescanTimerRef.current);
        rescanTimerRef.current = null;
      }
      for (const editor of subscribedRef.current) {
        if (!editor.isDestroyed) editor.off('update', scheduleRescan);
      }
      subscribedRef.current = new Set();
      for (const t of timers) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  return { matches, currentIndex, next, prev, rescan, clear };
}
