import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Search, FileText } from 'lucide-react';
import { useDialogTransition } from '../ui/useDialogTransition';
import { useStore } from '../../store/useStore';
import { useI18n, type Language } from '../../lib/core/i18n';
import type { TranslationKey } from '../../lib/core/i18n';
import { handleNativeSelectAll } from '../../lib/shortcuts/nativeSelectAll';
import { extractPlainText } from '../../lib/documents/extractPlainText';
import {
  performGlobalSearch,
  type GlobalSearchResult,
} from '../../lib/documents/globalSearch';
import { formatRelativeEditedTime } from '../../lib/documents/formatRelativeEditedTime';

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export default function GlobalSearchDialog() {
  const isOpen = useStore((s) => s.isGlobalSearchOpen);
  const setGlobalSearchOpen = useStore((s) => s.setGlobalSearchOpen);
  const { t, language } = useI18n();
  const lang = language as Language;

  // ── enter/exit animation ──
  const transition = useDialogTransition(isOpen);

  // ── local state ──
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── debounced query ──
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => clearTimeout(id);
  }, [query]);

  // ── text index: build once when dialog opens ──
  const indexRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (isOpen) {
      const docs = useStore.getState().documents;
      const idx = new Map<string, string>();
      for (const doc of docs) {
        idx.set(doc.id, extractPlainText(doc.blocks));
      }
      indexRef.current = idx;
    }
  }, [isOpen]);

  // ── reset when opened ──
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // ── perform search ──
  const documents = useStore((s) => s.documents);
  const results = useMemo<GlobalSearchResult[]>(() => {
    if (!debouncedQuery) return [];
    return performGlobalSearch(debouncedQuery, documents, indexRef.current);
  }, [debouncedQuery, documents]);

  // ── reset selection when results change ──
  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  // ── scroll selected item into view ──
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-search-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, isOpen]);

  // ── execute result ──
  const executeResult = useCallback(
    (result: GlobalSearchResult) => {
      const store = useStore.getState();
      store.setGlobalSearchOpen(false);
      store.openDocumentTab(result.docId);

      // For content matches, open the FindBar to jump to the match position
      if (result.matchType === 'content' && debouncedQuery) {
        setTimeout(() => {
          const s = useStore.getState();
          s.setFindQuery(debouncedQuery);
          s.setFindBarOpen(true);
        }, 150);
      }
    },
    [debouncedQuery],
  );

  // ── keyboard handling ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (handleNativeSelectAll(e)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setGlobalSearchOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        executeResult(results[selectedIndex]);
      }
      return;
    }
  };

  // ── global keyboard handling (capture phase) ──
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setGlobalSearchOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) =>
          Math.min(i + 1, Math.max(results.length - 1, 0)),
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (results[selectedIndex]) {
          executeResult(results[selectedIndex]);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () =>
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [isOpen, results, selectedIndex, setGlobalSearchOpen, executeResult]);

  if (transition === 'closed') return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex justify-center items-start pt-[12vh]"
      onClick={() => setGlobalSearchOpen(false)}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/30 backdrop-blur-[1px] ${
          transition === 'exit'
            ? 'animate-dialog-backdrop-out'
            : 'animate-dialog-backdrop-in'
        }`}
      />

      {/* Panel */}
      <div
        className={`relative w-[min(680px,92vw)] overflow-hidden flex flex-col rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-2xl ${
          transition === 'exit'
            ? 'animate-dialog-panel-out'
            : 'animate-dialog-panel-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Search input ── */}
        <div className="flex items-center gap-2 px-3 h-11 border-b border-[var(--vscode-widget-border)]">
          <Search className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0 opacity-50" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('globalSearch.placeholder')}
            className="flex-1 bg-transparent outline-none text-[13px] text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="text-[11px] px-1.5 py-0.5 text-[var(--vscode-descriptionForeground)] opacity-40">
            Esc
          </kbd>
        </div>

        {/* ── Results ── */}
        <div
          ref={listRef}
          className="relative overflow-y-auto py-1"
          style={{
            maxHeight: 'min(420px, 56vh)',
            minHeight: '48px',
            scrollbarWidth: 'none',
          }}
        >
          {results.length === 0 ? (
            <div className="px-3 py-4 text-center text-[13px] text-[var(--vscode-descriptionForeground)] opacity-60">
              {debouncedQuery
                ? t('globalSearch.noResults')
                : t('globalSearch.placeholder')}
            </div>
          ) : (
            results.map((result, index) => (
              <SearchResultRow
                key={`${result.docId}-${result.matchType}`}
                result={result}
                index={index}
                isSelected={index === selectedIndex}
                language={lang}
                t={t}
                onClick={() => executeResult(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              />
            ))
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center gap-3 px-3 h-7 border-t border-[var(--vscode-widget-border)] text-[11px] text-[var(--vscode-descriptionForeground)] opacity-50">
          <span>{t('globalSearch.footer')}</span>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Result row
// ──────────────────────────────────────────────────────────────────

function SearchResultRow({
  result,
  index,
  isSelected,
  language,
  t,
  onClick,
  onMouseEnter,
}: {
  result: GlobalSearchResult;
  index: number;
  isSelected: boolean;
  language: Language;
  t: (key: TranslationKey) => string;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const isTitleMatch = result.matchType === 'title';
  const tagLabel = isTitleMatch
    ? t('globalSearch.tagTitle')
    : t('globalSearch.tagContent');
  const timeLabel = formatRelativeEditedTime(result.updatedAt, t, language);

  return (
    <div
      data-search-index={index}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`px-3 py-1.5 cursor-pointer text-[13px] ${
        isSelected
          ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
          : 'text-[var(--vscode-foreground)]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[14px] leading-none">
          {result.emoji || '📝'}
        </span>
        <span className="flex-1 truncate">
          {result.title || (
            <span className="opacity-50 italic">
              {t('doclist.untitled')}
            </span>
          )}
        </span>
        {/* Tag + relative time */}
        <span
          className={`shrink-0 text-[11px] flex items-center gap-1.5 ${
            isSelected
              ? 'opacity-60'
              : 'text-[var(--vscode-descriptionForeground)] opacity-55'
          }`}
        >
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              isTitleMatch
                ? 'bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]'
                : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]'
            }`}
          >
            {tagLabel}
          </span>
          <span>{timeLabel}</span>
        </span>
      </div>
      {/* Content match snippet */}
      {result.snippet && result.snippetRange && (
        <div
          className={`mt-0.5 pl-6 text-[12px] truncate ${
            isSelected
              ? 'opacity-55'
              : 'text-[var(--vscode-descriptionForeground)] opacity-50'
          }`}
        >
          <SnippetHighlight
            snippet={result.snippet}
            range={result.snippetRange}
          />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Snippet with highlighted match
// ──────────────────────────────────────────────────────────────────

function SnippetHighlight({
  snippet,
  range,
}: {
  snippet: string;
  range: [number, number];
}) {
  const [start, end] = range;
  return (
    <>
      <span>{snippet.slice(0, start)}</span>
      <mark className="bg-[var(--vscode-editor-findMatchHighlightBackground)] text-[var(--vscode-foreground)] rounded-sm px-0.5">
        {snippet.slice(start, end)}
      </mark>
      <span>{snippet.slice(end)}</span>
    </>
  );
}
