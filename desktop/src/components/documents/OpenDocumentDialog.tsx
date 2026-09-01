import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Search, FileText, Plus } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { useDialogTransition } from '../ui/useDialogTransition';
import { HighlightedText, formatDateOr } from '../../lib/commandPalette/shared';
import { pinyinMatchRange } from '../../lib/documents/pinyinMatch';
import { handleNativeSelectAll } from '../../lib/shortcuts/nativeSelectAll';
import type { DocumentMeta } from '../../types/storage';

interface OpenDocumentDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function OpenDocumentDialog({
  open,
  onClose,
}: OpenDocumentDialogProps) {
  const { t, language } = useI18n();
  const docList = useStore((s) => s.docList);
  const createDocument = useStore((s) => s.createDocument);
  const transition = useDialogTransition(open);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  // ── Reset state when opened ──
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // ── Esc to close ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, onClose]);

  // ── Filter documents by title ──
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...docList].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    if (!q) {
      return sorted.map((doc) => ({ doc, titleMatch: null as [number, number] | null }));
    }
    return sorted
      .map((doc) => {
        const match = pinyinMatchRange(q, doc.title || '');
        return match ? { doc, titleMatch: match } : null;
      })
      .filter((x): x is { doc: DocumentMeta; titleMatch: [number, number] } => x !== null);
  }, [docList, query]);

  // ── Reset selection when results change ──
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // ── Scroll selected item into view ──
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-doc-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, open]);

  // ── Detect scroll position to show bottom glow ──
  useEffect(() => {
    const scroller = listRef.current;
    if (!scroller) return;

    const updateScrollState = () => {
      const { scrollTop, scrollHeight, clientHeight } = scroller;
      const hasMoreBelow = scrollTop < scrollHeight - clientHeight - 8;
      setCanScrollDown(hasMoreBelow);
    };

    updateScrollState();
    scroller.addEventListener('scroll', updateScrollState);
    return () => scroller.removeEventListener('scroll', updateScrollState);
  }, [results]);

  const openDocument = useCallback(
    (docId: string) => {
      useStore.getState().openDocumentTab(docId);
      onClose();
    },
    [onClose],
  );

  const handleNewDocument = useCallback(() => {
    createDocument();
    onClose();
  }, [createDocument, onClose]);

  // ── Keyboard navigation ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (handleNativeSelectAll(e)) return;
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
        openDocument(results[selectedIndex].doc.id);
      }
      return;
    }
  };

  if (transition === 'closed') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh]"
      onClick={onClose}
    >
      <div
        className={`absolute inset-0 bg-black/30 backdrop-blur-[1px] ${
          transition === 'exit'
            ? 'animate-dialog-backdrop-out'
            : 'animate-dialog-backdrop-in'
        }`}
      />

      <div
        className={`relative w-[min(720px,92vw)] overflow-hidden flex flex-col rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-2xl ${
          transition === 'exit'
            ? 'animate-dialog-panel-out'
            : 'animate-dialog-panel-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Search input ── */}
        <div className="flex items-center gap-2 px-3 h-10 border-b border-[var(--vscode-widget-border)]">
          <Search className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0 opacity-50" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('openDoc.placeholder')}
            className="flex-1 bg-transparent outline-none text-[13px] text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* ── Results ── */}
        <div
          ref={listRef}
          className="relative overflow-y-auto py-1"
          style={{
            maxHeight: 'min(480px, 50vh)',
            minHeight: '48px',
            scrollbarWidth: 'none',
          }}
        >
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <p className="text-[13px] text-[var(--vscode-descriptionForeground)] opacity-60">
                {t('openDoc.noResults')}
              </p>
              <button
                onClick={handleNewDocument}
                className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md text-[var(--vscode-textLink-activeForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('openDoc.createNew')}
              </button>
            </div>
          ) : (
            results.map((item, index) => (
              <div
                key={item.doc.id}
                data-doc-index={index}
                onClick={() => openDocument(item.doc.id)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[13px] ${
                  index === selectedIndex
                    ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                    : 'text-[var(--vscode-foreground)]'
                }`}
              >
                <FileText
                  className={`w-4 h-4 shrink-0 ${
                    index === selectedIndex ? 'opacity-75' : 'opacity-40'
                  }`}
                />
                <span className="flex-1 truncate">
                  {item.doc.title ? (
                    <HighlightedText text={item.doc.title} match={item.titleMatch} />
                  ) : (
                    <span className="opacity-50 italic">
                      {t('doclist.untitled')}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[11px] shrink-0 ${
                    index === selectedIndex
                      ? 'opacity-55'
                      : 'text-[var(--vscode-descriptionForeground)] opacity-55'
                  }`}
                >
                  {formatDateOr(item.doc.updatedAt, language)}
                </span>
              </div>
            ))
          )}
          {/* 底部发光提示 - CSS transition 平滑过渡 */}
          <div
            className="absolute left-0 right-0 bottom-0 h-10 pointer-events-none transition-opacity duration-200"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.08), transparent)',
              opacity: canScrollDown ? 1 : 0,
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
