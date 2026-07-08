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
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n, type Language } from '../../lib/core/i18n';
import type { TranslationKey } from '../../lib/core/i18n';
import {
  buildCommands,
  filterCommands,
  type ScoredCommand,
} from '../../lib/core/commandRegistry';
import { resolveBinding, bindingToDisplay } from '../../lib/shortcuts/keyboardShortcuts';
import type { DocumentMeta } from '../../lib/core/storage';
import type { TerminalSession } from '../../store/terminalSlice';
import type { SettingsSectionId } from '../../store/uiSlice';
import {
  SETTINGS_SECTIONS,
  HighlightedText,
  getSessionTitle,
  formatDateOr,
} from '../../lib/commandPalette/shared.tsx';

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
// Component
// ──────────────────────────────────────────────────────────────────

export default function CommandPalette() {
  const isOpen = useStore((s) => s.isCommandPaletteOpen);
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen);
  const overrides = useStore((s) => s.keyboardShortcuts);
  const tabBarGlassOpacity = useStore((s) => s.tabBarGlassOpacity);
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
  const [canScrollDown, setCanScrollDown] = useState(false);

  // ── derived mode ──
  const trimmedQuery = query.trimStart();
  const isCommandMode = trimmedQuery.startsWith('>');

  // The actual search text (without '>' prefix)
  const effectiveQuery = isCommandMode
    ? trimmedQuery.slice(1).trimStart()
    : trimmedQuery.trim();

  // Debounced copy of the search text that actually drives the (potentially
  // expensive) filtering below.  The <input> stays bound to `query` so typing
  // is always responsive, but filterCommands() / the document & session scans
  // only re-run after the user pauses ~120ms — instead of on every keystroke.
  // This matters when there are many commands/documents/sessions.
  const [debouncedQuery, setDebouncedQuery] = useState(effectiveQuery);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(effectiveQuery), 120);
    return () => clearTimeout(id);
  }, [effectiveQuery]);

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
      return filterCommands(commands, debouncedQuery, lang).map((scored) => ({
        kind: 'command',
        scored,
      }));
    }

    if (searchScope === 'documents') {
      const q = debouncedQuery.toLowerCase();
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
      const q = debouncedQuery.toLowerCase();
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
    const q = debouncedQuery.toLowerCase();
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
  }, [isCommandMode, debouncedQuery, commands, documents, sessions, searchScope, lang, t]);

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
  }, [items]);

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
        ? t('palette.sessionSearch')
        : t('palette.settingsSearch');

  return (
    <div
      className="fixed inset-0 z-[9999] flex justify-center items-start pt-[12vh]"
      onClick={() => setCommandPaletteOpen(false)}
    >
{/* Backdrop - 浅色模式下用白色遮罩，深色用黑色 */}
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[1px] dark:bg-black/30" />

{/* Panel - VSCode 风格边框 + 液态玻璃背景 */}
      <div
        className="relative w-[min(520px,90vw)] overflow-hidden flex flex-col rounded-lg border border-[var(--vscode-menu-border)]"
        style={{
          background: `rgba(255,255,255,${tabBarGlassOpacity})`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          animation: 'paletteIn 120ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 px-2.5 pt-2.5 pb-1">
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
          <kbd className="text-tiny px-1.5 py-0.5 text-[var(--vscode-descriptionForeground)] opacity-50">
            {bindingToDisplay(resolveBinding('app.commandPalette', overrides))}
          </kbd>
        </div>

        {/* ── Search input ── */}
        <div className="flex items-center gap-2 px-3 h-10">
          {isCommandMode ? (
            <TerminalSquare className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0 opacity-50" />
          ) : (
            <Search className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0 opacity-50" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none text-[13px] text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* ── Results ── */}
        <div className="relative max-h-[min(320px,45vh)] overflow-y-auto py-1" style={{ scrollbarWidth: 'none' }}>
          <div ref={listRef}>
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-[13px] text-[var(--vscode-descriptionForeground)] opacity-60">
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
                  overrides={overrides}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                />
              ))
            )}
          </div>
          {/* 底部发光提示 - 仅当可向下滚动时显示 */}
          {canScrollDown && (
            <div
              className="absolute left-0 right-0 bottom-0 h-12 pointer-events-none"
              style={{
                background: 'linear-gradient(to top, rgba(255,255,255,0.15), transparent)',
              }}
            />
          )}
        </div>

      </div>

      <style>{`
        @keyframes paletteIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
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
      className={`px-2.5 py-1 text-[13px] font-medium mb-[-1px] border-b-2 transition-colors duration-75 ${
        active
          ? 'text-[var(--vscode-foreground)] border-[var(--vscode-focusBorder)]'
          : 'text-[var(--vscode-descriptionForeground)] border-transparent opacity-50'
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
  overrides,
  onClick,
  onMouseEnter,
}: {
  item: PaletteItem;
  index: number;
  isSelected: boolean;
  language: Language;
  t: (key: TranslationKey) => string;
  overrides: Record<string, string>;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const baseClass = `flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[13px] transition-colors duration-75 ${
    isSelected
      ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
      : 'text-[var(--vscode-foreground)]'
  }`;
  const descClass = isSelected ? 'opacity-55' : 'text-[var(--vscode-descriptionForeground)] opacity-55';

  // ── Command ──
  if (item.kind === 'command') {
    const { command, titleMatch } = item.scored;
    const Icon = command.icon;
    const category = language === 'zh' ? command.categoryZh : command.categoryEn;
    const title = language === 'zh' ? command.titleZh : command.titleEn;
    return (
      <div data-palette-index={index} onClick={onClick} onMouseEnter={onMouseEnter} className={baseClass}>
        <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'opacity-80' : 'opacity-45'}`} />
        <span className={`shrink-0 text-[11px] ${descClass}`}>{category}</span>
        <span className={`${descClass} shrink-0`}>·</span>
        <span className="flex-1 truncate">
          <HighlightedText text={title} match={titleMatch} />
        </span>
        {command.shortcutId && (
          (() => {
            const binding = resolveBinding(command.shortcutId, overrides);
            if (!binding) return null;
            const display = bindingToDisplay(binding);
            return (
              <kbd className={`text-[11px] px-1.5 py-0.5 shrink-0 ${
                isSelected ? 'opacity-55' : descClass
              }`}>
                {display}
              </kbd>
            );
          })()
        )}
      </div>
    );
  }

  // ── Document ──
  if (item.kind === 'document') {
    const { doc, titleMatch } = item;
    return (
      <div data-palette-index={index} onClick={onClick} onMouseEnter={onMouseEnter} className={baseClass}>
        <FileText className={`w-4 h-4 shrink-0 ${isSelected ? 'opacity-75' : 'opacity-40'}`} />
        <span className="flex-1 truncate">
          {doc.title ? (
            <HighlightedText text={doc.title} match={titleMatch} />
          ) : (
            <span className="opacity-50 italic">{t('doclist.untitled')}</span>
          )}
        </span>
        <span className={`text-[11px] shrink-0 ${descClass}`}>
          {formatDateOr(doc.updatedAt, language)}
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
        <TerminalSquare className={`w-4 h-4 shrink-0 ${isSelected ? 'opacity-75' : 'opacity-40'}`} />
        <span className="flex-1 truncate">
          <HighlightedText text={title} match={titleMatch} />
        </span>
        {session.cwd && (
          <span className={`text-[11px] shrink-0 truncate max-w-[180px] ${descClass}`}>
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
      <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'opacity-75' : 'opacity-40'}`} />
      <span className="flex-1 truncate">
        <HighlightedText text={t(secMeta.labelKey)} match={item.titleMatch} />
      </span>
      <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${descClass}`} />
    </div>
  );
}
