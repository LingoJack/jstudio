import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Search,
  FileText,
  TerminalSquare,
  Settings2,
  ChevronRight,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  BookOpen,
  Info,
  PenLine,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useI18n, type Language } from '../lib/i18n';
import type { TranslationKey } from '../lib/i18n';
import {
  buildCommands,
  filterCommands,
  type ScoredCommand,
} from '../lib/commandRegistry';
import type { DocumentMeta } from '../lib/storage';
import type { TerminalSession } from '../store/terminalSlice';
import type { SettingsSectionId } from '../store/uiSlice';

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

type PaletteItem =
  | { kind: 'command'; scored: ScoredCommand }
  | { kind: 'document'; doc: DocumentMeta; titleMatch: [number, number] | null }
  | { kind: 'session'; session: TerminalSession; titleMatch: [number, number] | null }
  | { kind: 'settings'; sectionId: SettingsSectionId; titleMatch: [number, number] | null };

type SearchScope = 'documents' | 'terminal' | 'settings';

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
// Settings section metadata
// ──────────────────────────────────────────────────────────────────

const SETTINGS_SECTIONS: { id: SettingsSectionId; icon: LucideIcon; labelKey: TranslationKey }[] = [
  { id: 'general', icon: Settings2, labelKey: 'settings.general' },
  { id: 'editor', icon: PenLine, labelKey: 'settings.editor' },
  { id: 'terminal', icon: TerminalSquare, labelKey: 'settings.terminal' },
  { id: 'help', icon: BookOpen, labelKey: 'settings.help' },
  { id: 'about', icon: Info, labelKey: 'settings.about' },
];

/** Get the display title of a terminal session. */
function getSessionTitle(s: TerminalSession): string {
  return s.customTitle || s.autoTitle || s.title || s.cwd || 'Session';
}

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export default function CommandPalette() {
  const isOpen = useStore((s) => s.isCommandPaletteOpen);
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen);
  const { t, language } = useI18n();
  const lang = language as Language;

  // ── view state (derive search scope) ──
  const isSettingsOpen = useStore((s) => s.isSettingsOpen);
  const activeSidebarView = useStore((s) => s.activeSidebarView);

  const searchScope: SearchScope = isSettingsOpen
    ? 'settings'
    : activeSidebarView === 'terminal'
      ? 'terminal'
      : 'documents';

  // ── local state ──
  // query always holds the full text shown in the input, including a possible '>' prefix
  const [query, setQuery] = useState('>');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── derived mode ──
  const trimmedQuery = query.trimStart();
  const isCommandMode = trimmedQuery.startsWith('>');

  // The actual search text (without '>' prefix)
  const effectiveQuery = isCommandMode
    ? trimmedQuery.slice(1).trimStart()
    : trimmedQuery.trim();

  // ── Reset when opened ──
  useEffect(() => {
    if (isOpen) {
      setQuery('>');
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // Place cursor at the end
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        }
      });
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build items ──
  const commands = useMemo(() => buildCommands(), []);
  const documents = useStore((s) => s.documents);
  const sessions = useStore((s) => s.sessions);

  const items = useMemo<PaletteItem[]>(() => {
    if (isCommandMode) {
      return filterCommands(commands, effectiveQuery, lang).map((scored) => ({
        kind: 'command',
        scored,
      }));
    }

    if (searchScope === 'documents') {
      const q = effectiveQuery.toLowerCase();
      return documents
        .map((doc): { doc: DocumentMeta; titleMatch: [number, number] | null } | null => {
          const title = (doc.title || '').toLowerCase();
          if (!q) return { doc, titleMatch: null };
          const idx = title.indexOf(q);
          return idx === -1
            ? null
            : { doc, titleMatch: [idx, idx + q.length] };
        })
        .filter((x): x is { doc: DocumentMeta; titleMatch: [number, number] | null } => x !== null)
        .map((x) => ({ kind: 'document' as const, ...x }));
    }

    if (searchScope === 'terminal') {
      const q = effectiveQuery.toLowerCase();
      return sessions
        .map((s): { session: TerminalSession; titleMatch: [number, number] | null } | null => {
          const title = getSessionTitle(s).toLowerCase();
          if (!q) return { session: s, titleMatch: null };
          const idx = title.indexOf(q);
          return idx === -1
            ? null
            : { session: s, titleMatch: [idx, idx + q.length] };
        })
        .filter((x): x is { session: TerminalSession; titleMatch: [number, number] | null } => x !== null)
        .map((x) => ({ kind: 'session' as const, ...x }));
    }

    // settings
    const q = effectiveQuery.toLowerCase();
    return SETTINGS_SECTIONS.map((sec): { sectionId: SettingsSectionId; titleMatch: [number, number] | null } | null => {
      const label = t(sec.labelKey).toLowerCase();
      if (!q) return { sectionId: sec.id, titleMatch: null };
      const idx = label.indexOf(q);
      return idx === -1
        ? null
        : { sectionId: sec.id, titleMatch: [idx, idx + q.length] };
    })
      .filter((x): x is { sectionId: SettingsSectionId; titleMatch: [number, number] | null } => x !== null)
      .map((x) => ({ kind: 'settings' as const, ...x }));
  }, [isCommandMode, effectiveQuery, commands, documents, sessions, searchScope, lang, t]);

  // ── Reset selection when items change ──
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, isCommandMode, searchScope]);

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
      } else if (item.kind === 'document') {
        useStore.getState().openDocument(item.doc.id);
        useStore.getState().setSearchQuery('');
        setCommandPaletteOpen(false);
      } else if (item.kind === 'session') {
        const store = useStore.getState();
        store.setActiveSession(item.session.id);
        setCommandPaletteOpen(false);
      } else if (item.kind === 'settings') {
        const store = useStore.getState();
        store.setSettingsOpen(true);
        store.setSettingsActiveSection(item.sectionId);
        setCommandPaletteOpen(false);
      }
    },
    [setCommandPaletteOpen],
  );

  // ── Switch mode (add/remove '>' prefix) ──
  const switchMode = useCallback(
    (toCommand: boolean) => {
      if (toCommand) {
        // Add '>' prefix, strip old query content (like VSCode)
        setQuery('>');
      } else {
        // Remove '>' prefix, keep remaining text
        const rest = query.replace(/^>\s*/, '');
        setQuery(rest);
      }
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [query],
  );

  // ── Input change handler ──
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setQuery(newVal);
  };

  // ── Keyboard handling ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setCommandPaletteOpen(false);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      switchMode(!isCommandMode);
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

  // Tab label for search side
  const searchTabLabel =
    searchScope === 'documents'
      ? t('palette.tabDocuments')
      : searchScope === 'terminal'
        ? t('palette.tabTerminal')
        : t('palette.tabSettings');

  // Placeholder changes based on mode
  const placeholder = isCommandMode
    ? t('palette.placeholder')
    : searchScope === 'documents'
      ? t('palette.docPlaceholder')
      : searchScope === 'terminal'
        ? lang === 'zh'
          ? '搜索终端会话…'
          : 'Search sessions…'
        : lang === 'zh'
          ? '搜索设置项…'
          : 'Search settings…';

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
        style={{ animation: 'paletteIn 150ms ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Tabs ── */}
        <div className="flex items-center gap-0.5 px-1.5 pt-1.5 border-b border-[var(--vscode-input-border)]">
          <ModeTab
            label={searchTabLabel}
            active={!isCommandMode}
            onClick={() => switchMode(false)}
          />
          <ModeTab
            label={t('palette.tabCommands')}
            active={isCommandMode}
            onClick={() => switchMode(true)}
          />
          <div className="flex-1" />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--vscode-input-border)] text-[var(--vscode-descriptionForeground)] mb-1.5 mr-1">
            {t('palette.shortcutHint')}
          </kbd>
        </div>

        {/* ── Search input ── */}
        <div className="flex items-center gap-2 px-3 h-11 border-b border-[var(--vscode-input-border)]">
          {isCommandMode ? (
            <TerminalSquare className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0" />
          ) : (
            <Search className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none text-sm text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* ── Results ── */}
        <div ref={listRef} className="max-h-[min(360px,50vh)] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-[var(--vscode-descriptionForeground)]">
              {t('palette.noResults')}
            </div>
          ) : (
            items.map((item, index) => (
              <PaletteRow
                key={
                  item.kind === 'command'
                    ? `cmd-${item.scored.command.id}`
                    : item.kind === 'document'
                      ? `doc-${item.doc.id}`
                      : item.kind === 'session'
                        ? `ses-${item.session.id}`
                        : `set-${item.sectionId}`
                }
                item={item}
                index={index}
                isSelected={index === selectedIndex}
                language={lang}
                t={t}
                onClick={() => executeItem(item)}
                onMouseEnter={() => setSelectedIndex(index)}
              />
            ))
          )}
        </div>

        {/* ── Footer hint ── */}
        <div className="flex items-center gap-4 px-3 py-1.5 border-t border-[var(--vscode-input-border)] text-[11px] text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-input-background)]">
          <span className="flex items-center gap-1">
            <ArrowUp className="w-3 h-3" />
            <ArrowDown className="w-3 h-3" />
            <span className="opacity-80">{lang === 'zh' ? '导航' : 'Navigate'}</span>
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="w-3 h-3" />
            <span className="opacity-80">{lang === 'zh' ? '执行' : 'Select'}</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 rounded border border-[var(--vscode-input-border)]">Tab</kbd>
            <span className="opacity-80">{lang === 'zh' ? '切换模式' : 'Switch'}</span>
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
  t,
  onClick,
  onMouseEnter,
}: {
  item: PaletteItem;
  index: number;
  isSelected: boolean;
  language: Language;
  t: (key: TranslationKey) => string;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const baseClass = `flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer text-sm rounded-md transition-colors duration-75 ${
    isSelected
      ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
      : 'text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
  }`;
  const descClass = isSelected ? 'opacity-70' : 'text-[var(--vscode-descriptionForeground)]';

  // ── Command ──
  if (item.kind === 'command') {
    const { command, titleMatch } = item.scored;
    const Icon = command.icon;
    const category = language === 'zh' ? command.categoryZh : command.categoryEn;
    const title = language === 'zh' ? command.titleZh : command.titleEn;
    return (
      <div data-palette-index={index} onClick={onClick} onMouseEnter={onMouseEnter} className={baseClass}>
        <Icon className="w-4 h-4 shrink-0 opacity-80" />
        <span className={`shrink-0 text-xs ${descClass}`}>{category}</span>
        <span className={`${descClass} shrink-0 opacity-50`}>·</span>
        <span className="flex-1 truncate">
          <HighlightedText text={title} match={titleMatch} />
        </span>
        {command.shortcut && (
          <kbd className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
            isSelected ? 'bg-white/15 text-current' : `border border-[var(--vscode-input-border)] ${descClass}`
          }`}>
            {command.shortcut}
          </kbd>
        )}
      </div>
    );
  }

  // ── Document ──
  if (item.kind === 'document') {
    const { doc, titleMatch } = item;
    return (
      <div data-palette-index={index} onClick={onClick} onMouseEnter={onMouseEnter} className={baseClass}>
        <FileText className="w-4 h-4 shrink-0 opacity-60" />
        <span className="flex-1 truncate">
          {doc.title ? (
            <HighlightedText text={doc.title} match={titleMatch} />
          ) : (
            <span className="opacity-50 italic">Untitled</span>
          )}
        </span>
        <span className={`text-[10px] shrink-0 ${descClass}`}>
          {doc.updatedAt
            ? new Date(doc.updatedAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')
            : ''}
        </span>
      </div>
    );
  }

  // ── Terminal session ──
  if (item.kind === 'session') {
    const { session, titleMatch } = item;
    const title = getSessionTitle(session);
    return (
      <div data-palette-index={index} onClick={onClick} onMouseEnter={onMouseEnter} className={baseClass}>
        <TerminalSquare className="w-4 h-4 shrink-0 opacity-60" />
        <span className="flex-1 truncate">
          <HighlightedText text={title} match={titleMatch} />
        </span>
        {session.cwd && (
          <span className={`text-[10px] shrink-0 truncate max-w-[200px] ${descClass}`}>
            {session.cwd}
          </span>
        )}
      </div>
    );
  }

  // ── Settings section ──
  const secMeta = SETTINGS_SECTIONS.find((s) => s.id === item.sectionId)!;
  const Icon = secMeta.icon;
  return (
    <div data-palette-index={index} onClick={onClick} onMouseEnter={onMouseEnter} className={baseClass}>
      <Icon className="w-4 h-4 shrink-0 opacity-60" />
      <span className="flex-1 truncate">
        <HighlightedText text={t(secMeta.labelKey)} match={item.titleMatch} />
      </span>
      <ChevronRight className={`w-3 h-3 shrink-0 ${descClass}`} />
    </div>
  );
}
