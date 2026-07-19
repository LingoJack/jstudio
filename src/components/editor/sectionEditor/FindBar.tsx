/**
 * FindBar — floating find-in-document bar (top-right of the editor area).
 *
 * VSCode-style: a single text input + prev/next buttons + N/M match counter +
 * close button. Driven by store state (`isFindBarOpen` / `findQuery`); the
 * actual cross-section search is coordinated by `useCrossSectionFind` in the
 * parent (`SectionedEditorPanel`), which passes the live `find` API as a prop.
 *
 * Keyboard:
 *   - Enter      → next match
 *   - Shift+Enter → previous match
 *   - Escape     → close (preserves query for re-open)
 */
import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, X, Search } from 'lucide-react';

import { useStore } from '../../../store/useStore';
import { useI18n } from '../../../lib/core/i18n';
import { handleNativeSelectAll } from '../../../lib/shortcuts/nativeSelectAll';
import type { UseCrossSectionFindReturn } from './useCrossSectionFind';

export interface FindBarProps {
  find: UseCrossSectionFindReturn;
}

export default function FindBar({ find }: FindBarProps) {
  const { t } = useI18n();
  const isOpen = useStore((s) => s.isFindBarOpen);
  const setFindBarOpen = useStore((s) => s.setFindBarOpen);
  const findQuery = useStore((s) => s.findQuery);
  const setFindQuery = useStore((s) => s.setFindQuery);
  const isOutlineOpen = useStore((s) => s.isOutlineOpen);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Focus the input on open ──────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  // ── Clear highlights when the bar closes; re-scan when it reopens ────
  // Listen for open<->close transitions so we don't run on every render.
  // `find` is recreated on every parent render, so we keep its latest
  // `clear`/`rescan` in refs and depend only on `isOpen`.
  //
  // Closing calls `clear()`, which wipes matches + highlights (e.g. so
  // stale highlights don't linger while the bar is hidden and the doc is
  // edited). Since the query text itself is preserved across close/reopen
  // (see the JSDoc above), reopening must explicitly `rescan()` — the
  // query string hasn't changed, so `useCrossSectionFind`'s
  // query-change-triggered rescan effect won't fire on its own.
  const prevOpenRef = useRef(isOpen);
  const findClearRef = useRef(find.clear);
  findClearRef.current = find.clear;
  const findRescanRef = useRef(find.rescan);
  findRescanRef.current = find.rescan;
  useEffect(() => {
    if (prevOpenRef.current && !isOpen) {
      findClearRef.current();
    } else if (!prevOpenRef.current && isOpen && findQuery) {
      findRescanRef.current();
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, findQuery]);

  if (!isOpen) return null;

  const total = find.matches.length;
  const current = total > 0 ? find.currentIndex + 1 : 0;
  const countLabel =
    total === 0
      ? t('find.noResults')
      : t('find.matchCount', { current, total });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) find.prev();
      else find.next();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setFindBarOpen(false);
      return;
    }
    // Cmd/Ctrl+A — select the input's own text. See nativeSelectAll.ts for
    // why this can't be left to the browser's native handling here.
    if (handleNativeSelectAll(e)) return;
  };

  const close = () => setFindBarOpen(false);

  // Position: top-right, but shift left when the outline toggle is open so
  // the bars don't overlap the outline panel.
  const rightClass = isOutlineOpen ? 'right-64' : 'right-12';

  return (
    <div
      className={`absolute ${rightClass} top-3 z-40 flex items-center gap-1.5 px-2 py-1.5 rounded-md shadow-lg border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] backdrop-blur transition-[right] duration-150`}
      role="dialog"
      aria-label={t('find.placeholder')}
    >
      <Search className="w-3.5 h-3.5 text-[var(--vscode-descriptionForeground)] shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={findQuery}
        onChange={(e) => setFindQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('find.placeholder')}
        spellCheck={false}
        autoComplete="off"
        className="w-44 text-sm bg-transparent border-none focus:outline-none text-[var(--vscode-editor-foreground)] placeholder-[var(--vscode-descriptionForeground)]"
      />
      <span
        className={`text-xs tabular-nums shrink-0 min-w-[3rem] text-center ${
          total === 0
            ? 'text-[var(--vscode-descriptionForeground)]'
            : 'text-[var(--vscode-foreground)]'
        }`}
        aria-live="polite"
      >
        {countLabel}
      </span>
      <button
        onClick={find.prev}
        disabled={total === 0}
        title={t('find.previous')}
        aria-label={t('find.previous')}
        className="p-1 rounded transition-colors text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-default"
      >
        <ChevronUp className="w-4 h-4" />
      </button>
      <button
        onClick={find.next}
        disabled={total === 0}
        title={t('find.next')}
        aria-label={t('find.next')}
        className="p-1 rounded transition-colors text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-default"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
      <button
        onClick={close}
        title={t('find.close')}
        aria-label={t('find.close')}
        className="p-1 rounded transition-colors text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
