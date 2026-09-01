import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDialogTransition } from '../ui/useDialogTransition';
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
import { handleNativeSelectAll } from '../../lib/shortcuts/nativeSelectAll';
import type { DocumentMeta } from '../../types/storage';
import type { TerminalSession } from '../../store/terminalSlice';
import type { SettingsSectionId } from '../../store/uiSlice';
import {
  SETTINGS_SECTIONS,
  HighlightedText,
  getSessionTitle,
  formatDateOr,
} from '../../lib/commandPalette/shared.tsx';
import { pinyinMatchRange } from '../../lib/documents/pinyinMatch';

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
  const { t, language } = useI18n();
  const lang = language as Language;

  // ── 入场/退场动画 ──
  const transition = useDialogTransition(isOpen);

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
      return documents
        .map((doc): { doc: DocumentMeta; titleMatch: [number, number] | null } | null => {
          if (!debouncedQuery) return { doc, titleMatch: null };
          const match = pinyinMatchRange(debouncedQuery, doc.title || '');
          return match ? { doc, titleMatch: match } : null;
        })
        .filter((x): x is { doc: DocumentMeta; titleMatch: [number, number] | null } => x !== null)
        .map((x) => ({ kind: 'document' as const, ...x }));
    }

    if (searchScope === 'terminal') {
      return sessions
        .map((s): { session: TerminalSession; titleMatch: [number, number] | null } | null => {
          if (!debouncedQuery) return { session: s, titleMatch: null };
          const match = pinyinMatchRange(debouncedQuery, getSessionTitle(s));
          return match ? { session: s, titleMatch: match } : null;
        })
        .filter((x): x is { session: TerminalSession; titleMatch: [number, number] | null } => x !== null)
        .map((x) => ({ kind: 'session' as const, ...x }));
    }

    // settings
    return SETTINGS_SECTIONS.map((sec): { sectionId: SettingsSectionId; titleMatch: [number, number] | null } | null => {
      if (!debouncedQuery) return { sectionId: sec.id, titleMatch: null };
      const match = pinyinMatchRange(debouncedQuery, t(sec.labelKey));
      return match ? { sectionId: sec.id, titleMatch: match } : null;
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
        useStore.getState().openDocumentTab(item.doc.id);
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

  // ── Keyboard handling via input ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (handleNativeSelectAll(e)) return;
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

  // ── Global keyboard handling (capture phase) ──
  // 确保 focus 不在 input 时（如切换到终端）也能响应键盘
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setCommandPaletteOpen(false);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        switchMode(!isCommandMode);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
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
        if (items[selectedIndex]) {
          executeItem(items[selectedIndex]);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [isOpen, isCommandMode, items, selectedIndex, setCommandPaletteOpen, switchMode, executeItem]);

  if (transition === 'closed') return null;

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
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/30 backdrop-blur-[1px] ${
          transition === 'exit'
            ? 'animate-dialog-backdrop-out'
            : 'animate-dialog-backdrop-in'
        }`}
      />

      {/* Panel - VSCode 风格边框 + 实色背景 */}
      <div
        className={`relative w-[min(720px,92vw)] overflow-hidden flex flex-col rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-2xl ${
          transition === 'exit'
            ? 'animate-dialog-panel-out'
            : 'animate-dialog-panel-in'
        }`}
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
        <div className="flex items-center gap-2 px-3 h-10 border-b border-[var(--vscode-widget-border)]">
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

        {/* ── Results - 固定高度区域，避免高度跳变 ── */}
        <div
          ref={listRef}
          className="relative overflow-y-auto py-1"
          style={{
            maxHeight: 'min(480px, 50vh)',
            minHeight: '48px', // 最小高度，避免空结果时面板塌陷
            scrollbarWidth: 'none',
          }}
        >
          {items.length === 0 ? (
            <div className="px-3 py-4 text-center text-[13px] text-[var(--vscode-descriptionForeground)] opacity-60">
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
  const baseClass = `flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[13px] ${
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
      <div
        data-palette-index={index}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={baseClass}
      >
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
      <div
        data-palette-index={index}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={baseClass}
      >
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
      <div
        data-palette-index={index}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={baseClass}
      >
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
    <div
      data-palette-index={index}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={baseClass}
    >
      <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'opacity-75' : 'opacity-40'}`} />
      <span className="flex-1 truncate">
        <HighlightedText text={t(secMeta.labelKey)} match={item.titleMatch} />
      </span>
      <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${descClass}`} />
    </div>
  );
}
