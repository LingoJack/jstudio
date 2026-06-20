import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Search, ChevronRight, FileText } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useI18n, type Language } from '../lib/i18n';
import {
  buildCommands,
  filterCommands,
  type ScoredCommand,
} from '../lib/commandRegistry';
import type { DocumentMeta } from '../lib/storage';

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

type PaletteItem =
  | { kind: 'command'; scored: ScoredCommand }
  | { kind: 'document'; doc: DocumentMeta; titleMatch: [number, number] | null };

// ──────────────────────────────────────────────────────────────────
// Highlight helper
// ──────────────────────────────────────────────────────────────────

function HighlightedText({
  text,
  match,
}: {
  text: string;
  match: [number, number] | null;
}) {
  if (!match) return <>{text}</>;
  const [start, end] = match;
  return (
    <>
      {text.slice(0, start)}
      <span className="font-semibold text-[var(--vscode-textLink-activeForeground)]">
        {text.slice(start, end)}
      </span>
      {text.slice(end)}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Document fuzzy filter
// ──────────────────────────────────────────────────────────────────

function filterDocuments(
  docs: DocumentMeta[],
  query: string,
): { doc: DocumentMeta; titleMatch: [number, number] | null }[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return docs.map((doc) => ({ doc, titleMatch: null }));
  }
  const results: { doc: DocumentMeta; titleMatch: [number, number] | null; index: number }[] = [];
  for (const doc of docs) {
    const title = (doc.title || '').toLowerCase();
    const idx = title.indexOf(q);
    if (idx !== -1) {
      results.push({ doc, titleMatch: [idx, idx + q.length], index: idx });
    }
  }
  // Earlier match first, then by updatedAt desc
  results.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index;
    return (b.doc.updatedAt ?? '').localeCompare(a.doc.updatedAt ?? '');
  });
  return results;
}

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export default function CommandPalette() {
  const isOpen = useStore((s) => s.isCommandPaletteOpen);
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen);
  const { t, language } = useI18n();

  // ── query state (local, not persisted) ──
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Reset when opened/closed ──
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // focus input on next tick
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // ── Mode detection ──
  const isCommandMode = query.startsWith('>');
  const effectiveQuery = isCommandMode ? query.slice(1).trim() : query.trim();

  // ── Build items ──
  const commands = useMemo(() => buildCommands(), []);
  const documents = useStore((s) => s.documents);

  const items = useMemo<PaletteItem[]>(() => {
    if (isCommandMode) {
      return filterCommands(commands, effectiveQuery, language as Language).map(
        (scored) => ({ kind: 'command', scored }),
      );
    }
    return filterDocuments(documents, effectiveQuery).map(({ doc, titleMatch }) => ({
      kind: 'document',
      doc,
      titleMatch,
    }));
  }, [isCommandMode, effectiveQuery, commands, documents, language]);

  // ── Reset selection when items change ──
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // ── Scroll selected item into view ──
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-palette-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, isOpen]);

  // ── Execute item ──
  const executeItem = useCallback(
    (item: PaletteItem) => {
      if (item.kind === 'command') {
        const store = useStore.getState();
        item.scored.command.perform(store);
        setCommandPaletteOpen(false);
      } else {
        // open document
        useStore.getState().openDocument(item.doc.id);
        // keep the doc list filter in sync
        useStore.getState().setSearchQuery('');
        setCommandPaletteOpen(false);
      }
    },
    [setCommandPaletteOpen],
  );

  // ── Keyboard handling ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setCommandPaletteOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) {
        executeItem(items[selectedIndex]);
      }
      return;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex justify-center items-start pt-[12vh]"
      onClick={() => setCommandPaletteOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />

      {/* Panel */}
      <div
        className="relative w-[min(640px,90vw)] rounded-lg overflow-hidden border border-[var(--vscode-input-border)] bg-[var(--vscode-quickInput-background)] shadow-2xl"
        style={{
          animation: 'paletteIn 150ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-2 px-3 h-11 border-b border-[var(--vscode-input-border)]">
          {isCommandMode ? (
            <ChevronRight className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0" />
          ) : (
            <Search className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('palette.placeholder')}
            className="flex-1 bg-transparent outline-none text-sm text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--vscode-input-border)] text-[var(--vscode-descriptionForeground)] shrink-0">
            {t('palette.shortcutHint')}
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[min(400px,50vh)] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-[var(--vscode-descriptionForeground)]">
              {t('palette.noResults')}
            </div>
          ) : (
            items.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <PaletteRow
                  key={
                    item.kind === 'command'
                      ? `cmd-${item.scored.command.id}`
                      : `doc-${item.doc.id}`
                  }
                  item={item}
                  index={index}
                  isSelected={isSelected}
                  language={language as Language}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                />
              );
            })
          )}
        </div>
      </div>

      <style>{`
        @keyframes paletteIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Row component
// ──────────────────────────────────────────────────────────────────

function PaletteRow({
  item,
  index,
  isSelected,
  language,
  onClick,
  onMouseEnter,
}: {
  item: PaletteItem;
  index: number;
  isSelected: boolean;
  language: Language;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  if (item.kind === 'command') {
    const { command, titleMatch } = item.scored;
    const Icon = command.icon;
    const category = language === 'zh' ? command.categoryZh : command.categoryEn;
    const title = language === 'zh' ? command.titleZh : command.titleEn;

    return (
      <div
        data-palette-index={index}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={`flex items-center gap-2.5 px-3 py-1.5 cursor-pointer text-sm transition-colors duration-75 ${
          isSelected
            ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
            : 'text-[var(--vscode-foreground)]'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0 opacity-80" />
        <span
          className={`shrink-0 ${isSelected ? 'opacity-70' : 'text-[var(--vscode-descriptionForeground)]'}`}
        >
          {category}:
        </span>
        <span className="flex-1 truncate">
          <HighlightedText text={title} match={titleMatch} />
        </span>
        {command.shortcut && (
          <kbd
            className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
              isSelected
                ? 'bg-white/15 text-current'
                : 'border border-[var(--vscode-input-border)] text-[var(--vscode-descriptionForeground)]'
            }`}
          >
            {command.shortcut}
          </kbd>
        )}
      </div>
    );
  }

  // Document row
  const { doc, titleMatch } = item;
  return (
    <div
      data-palette-index={index}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex items-center gap-2.5 px-3 py-1.5 cursor-pointer text-sm transition-colors duration-75 ${
        isSelected
          ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
          : 'text-[var(--vscode-foreground)]'
      }`}
    >
      <FileText className="w-4 h-4 shrink-0 opacity-60" />
      <span className="flex-1 truncate">
        {doc.title ? (
          <HighlightedText text={doc.title} match={titleMatch} />
        ) : (
          <span className="opacity-50 italic">Untitled</span>
        )}
      </span>
      <span
        className={`text-[10px] shrink-0 ${
          isSelected ? 'opacity-60' : 'text-[var(--vscode-descriptionForeground)]'
        }`}
      >
        {doc.updatedAt
          ? new Date(doc.updatedAt).toLocaleDateString(
              language === 'zh' ? 'zh-CN' : 'en-US',
            )
          : ''}
      </span>
    </div>
  );
}
