import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Search, FileText, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react';
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

type PaletteMode = 'command' | 'document';

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

  // ── local state ──
  const [mode, setMode] = useState<PaletteMode>('command');
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Reset when opened ──
  useEffect(() => {
    if (isOpen) {
      setMode('command');
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const effectiveQuery = query.trim();

  // ── Build items ──
  const commands = useMemo(() => buildCommands(), []);
  const documents = useStore((s) => s.documents);

  const items = useMemo<PaletteItem[]>(() => {
    if (mode === 'command') {
      return filterCommands(commands, effectiveQuery, language as Language).map(
        (scored) => ({ kind: 'command', scored }),
      );
    }
    return filterDocuments(documents, effectiveQuery).map(({ doc, titleMatch }) => ({
      kind: 'document',
      doc,
      titleMatch,
    }));
  }, [mode, effectiveQuery, commands, documents, language]);

  // ── Reset selection when items change ──
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, mode]);

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

  // ── Switch mode (clears query, keeps focus) ──
  const switchMode = useCallback((next: PaletteMode) => {
    setMode(next);
    setQuery('');
    setSelectedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // ── Keyboard handling ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setCommandPaletteOpen(false);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      switchMode(mode === 'command' ? 'document' : 'command');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
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

  const placeholder =
    mode === 'command' ? t('palette.placeholder') : t('palette.docPlaceholder');

  return (
    <div
      className="fixed inset-0 z-[9999] flex justify-center items-start pt-[12vh]"
      onClick={() => setCommandPaletteOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />

      {/* Panel */}
      <div
        className="relative w-[min(640px,90vw)] rounded-lg overflow-hidden border border-[var(--vscode-input-border)] bg-[var(--vscode-quickInput-background)] shadow-2xl flex flex-col"
        style={{
          animation: 'paletteIn 150ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Tabs ── */}
        <div className="flex items-center gap-0.5 px-1.5 pt-1.5 border-b border-[var(--vscode-input-border)]">
          <ModeTab
            label={t('palette.tabCommands')}
            active={mode === 'command'}
            onClick={() => switchMode('command')}
          />
          <ModeTab
            label={t('palette.tabDocuments')}
            active={mode === 'document'}
            onClick={() => switchMode('document')}
          />
          <div className="flex-1" />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--vscode-input-border)] text-[var(--vscode-descriptionForeground)] mb-1.5 mr-1">
            {t('palette.shortcutHint')}
          </kbd>
        </div>

        {/* ── Search input ── */}
        <div className="flex items-center gap-2 px-3 h-11 border-b border-[var(--vscode-input-border)]">
          <Search className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none text-sm text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* ── Results ── */}
        <div
          ref={listRef}
          className="max-h-[min(360px,50vh)] overflow-y-auto p-1.5"
        >
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-[var(--vscode-descriptionForeground)]">
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

        {/* ── Footer hint ── */}
        <div className="flex items-center gap-4 px-3 py-1.5 border-t border-[var(--vscode-input-border)] text-[11px] text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-input-background)]">
          <span className="flex items-center gap-1">
            <ArrowUp className="w-3 h-3" />
            <ArrowDown className="w-3 h-3" />
            <span className="opacity-80">
              {language === 'zh' ? '导航' : 'Navigate'}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="w-3 h-3" />
            <span className="opacity-80">
              {language === 'zh' ? '执行' : 'Select'}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 rounded border border-[var(--vscode-input-border)]">Tab</kbd>
            <span className="opacity-80">
              {language === 'zh' ? '切换模式' : 'Switch'}
            </span>
          </span>
          <span className="flex-1" />
          <kbd className="px-1 rounded border border-[var(--vscode-input-border)]">Esc</kbd>
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
// Mode tab
// ──────────────────────────────────────────────────────────────────

function ModeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors duration-100 mb-[-1px] border-b-2 ${
        active
          ? 'text-[var(--vscode-foreground)] border-[var(--vscode-focusBorder)]'
          : 'text-[var(--vscode-descriptionForeground)] border-transparent hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
    >
      {label}
    </button>
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
        className={`flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer text-sm rounded-md transition-colors duration-75 ${
          isSelected
            ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
            : 'text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0 opacity-80" />
        <span
          className={`shrink-0 text-xs ${isSelected ? 'opacity-70' : 'text-[var(--vscode-descriptionForeground)]'}`}
        >
          {category}
        </span>
        <span className="text-[var(--vscode-descriptionForeground)] shrink-0 opacity-50">·</span>
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
      className={`flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer text-sm rounded-md transition-colors duration-75 ${
        isSelected
          ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
          : 'text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
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
