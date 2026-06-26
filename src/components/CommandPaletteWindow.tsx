/**
 * CommandPaletteWindow — standalone Spotlight/Raycast-style floating window.
 *
 * This component renders inside a *separate* Tauri webview window (opened via
 * the `open-panel` global shortcut action). It does NOT have access to the
 * main window's Zustand store, so it loads data directly via storage APIs.
 *
 * When the user selects an item, it emits a `command-palette-select` event
 * to the main window (which shows itself and dispatches the action), then
 * closes itself.
 *
 * Window behavior:
 *   - Frameless, transparent, always-on-top, centered
 *   - Loses focus → auto-close (Spotlight UX)
 *   - Escape → close
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Keyboard,
  PenLine,
  type LucideIcon,
} from 'lucide-react';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { storage, type DocumentMeta, type TerminalSessionInfo } from '../lib/storage';
import { useI18n, type Language, type TranslationKey } from '../lib/i18n';
import type { SettingsSectionId } from '../store/uiSlice';

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

type PaletteItem =
  | { kind: 'document'; doc: DocumentMeta; titleMatch: [number, number] | null }
  | { kind: 'session'; session: TerminalSessionInfo; titleMatch: [number, number] | null }
  | { kind: 'settings'; sectionId: SettingsSectionId; titleMatch: [number, number] | null };

// ──────────────────────────────────────────────────────────────────
// Settings section metadata (mirror of CommandPalette.tsx)
// ──────────────────────────────────────────────────────────────────

const SETTINGS_SECTIONS: { id: SettingsSectionId; icon: LucideIcon; labelKey: TranslationKey }[] = [
  { id: 'general', icon: Settings2, labelKey: 'settings.general' },
  { id: 'editor', icon: PenLine, labelKey: 'settings.editor' },
  { id: 'terminal', icon: TerminalSquare, labelKey: 'settings.terminal' },
  { id: 'shortcuts', icon: Keyboard, labelKey: 'settings.shortcuts' },
  { id: 'help', icon: BookOpen, labelKey: 'settings.help' },
  { id: 'about', icon: Info, labelKey: 'settings.about' },
];

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function getSessionTitle(s: TerminalSessionInfo): string {
  return s.title || s.id;
}

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
// Component
// ──────────────────────────────────────────────────────────────────

export default function CommandPaletteWindow() {
  const { t, language } = useI18n();
  const lang = language as Language;

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scope, setScope] = useState<'documents' | 'terminal' | 'settings'>('documents');
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Load data on mount ──
  useEffect(() => {
    (async () => {
      try {
        const [docs, sess] = await Promise.all([
          storage.loadIndex(),
          storage.ptyList().catch(() => [] as TerminalSessionInfo[]),
        ]);
        setDocuments(docs);
        setSessions(sess);
        // If there are terminal sessions but no docs, default to terminal scope
        if (sess.length > 0 && docs.length === 0) {
          setScope('terminal');
        }
      } catch (e) {
        console.error('[CommandPaletteWindow] Failed to load data:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Focus input on mount ──
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // ── Close on blur (Spotlight UX) ──
  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenPromise = win.onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        win.close();
      }
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  // ── Build items ──
  const effectiveQuery = query.trim().toLowerCase();

  const items = useMemo<PaletteItem[]>(() => {
    if (scope === 'documents') {
      return documents
        .map((doc): { doc: DocumentMeta; titleMatch: [number, number] | null } | null => {
          const title = (doc.title || '').toLowerCase();
          if (!effectiveQuery) return { doc, titleMatch: null };
          const idx = title.indexOf(effectiveQuery);
          return idx === -1 ? null : { doc, titleMatch: [idx, idx + effectiveQuery.length] };
        })
        .filter((x): x is { doc: DocumentMeta; titleMatch: [number, number] | null } => x !== null)
        .map((x) => ({ kind: 'document' as const, ...x }));
    }

    if (scope === 'terminal') {
      return sessions
        .map((s): { session: TerminalSessionInfo; titleMatch: [number, number] | null } | null => {
          const title = getSessionTitle(s).toLowerCase();
          if (!effectiveQuery) return { session: s, titleMatch: null };
          const idx = title.indexOf(effectiveQuery);
          return idx === -1 ? null : { session: s, titleMatch: [idx, idx + effectiveQuery.length] };
        })
        .filter((x): x is { session: TerminalSessionInfo; titleMatch: [number, number] | null } => x !== null)
        .map((x) => ({ kind: 'session' as const, ...x }));
    }

    // settings
    return SETTINGS_SECTIONS.map((sec): { sectionId: SettingsSectionId; titleMatch: [number, number] | null } | null => {
      const label = t(sec.labelKey).toLowerCase();
      if (!effectiveQuery) return { sectionId: sec.id, titleMatch: null };
      const idx = label.indexOf(effectiveQuery);
      return idx === -1 ? null : { sectionId: sec.id, titleMatch: [idx, idx + effectiveQuery.length] };
    })
      .filter((x): x is { sectionId: SettingsSectionId; titleMatch: [number, number] | null } => x !== null)
      .map((x) => ({ kind: 'settings' as const, ...x }));
  }, [scope, effectiveQuery, documents, sessions, t]);

  // ── Reset selection on items change ──
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, scope]);

  // ── Scroll into view ──
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-palette-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ── Execute item: emit event to main window, then close ──
  const executeItem = useCallback(
    async (item: PaletteItem) => {
      if (item.kind === 'document') {
        await emit('command-palette-select', { kind: 'document', id: item.doc.id });
      } else if (item.kind === 'session') {
        await emit('command-palette-select', { kind: 'session', id: item.session.id });
      } else if (item.kind === 'settings') {
        await emit('command-palette-select', { kind: 'settings', id: item.sectionId });
      }
      await getCurrentWindow().close();
    },
    [],
  );

  // ── Keyboard ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      getCurrentWindow().close();
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
    // Tab to switch scope
    if (e.key === 'Tab') {
      e.preventDefault();
      const scopes: ('documents' | 'terminal' | 'settings')[] = ['documents', 'terminal', 'settings'];
      const currentIdx = scopes.indexOf(scope);
      setScope(scopes[(currentIdx + 1) % scopes.length]);
      return;
    }
  };

  // ── Scoped tab label ──
  const scopeLabel =
    scope === 'documents'
      ? t('palette.tabDocuments')
      : scope === 'terminal'
        ? t('palette.tabTerminal')
        : t('palette.tabSettings');

  return (
    <div
      className="w-screen h-screen flex flex-col overflow-hidden rounded-xl"
      style={{
        background: 'var(--vscode-quickInput-background)',
        border: '1px solid var(--vscode-input-border)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        animation: 'cpwIn 120ms ease-out',
      }}
    >
      {/* ── Scope tabs ── */}
      <div className="flex items-center gap-0.5 px-1.5 pt-1.5 border-b border-[var(--vscode-input-border)]">
        {(['documents', 'terminal', 'settings'] as const).map((s) => {
          const label =
            s === 'documents'
              ? t('palette.tabDocuments')
              : s === 'terminal'
                ? t('palette.tabTerminal')
                : t('palette.tabSettings');
          const active = scope === s;
          return (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors duration-100 mb-[-1px] border-b-2 ${
                active
                  ? 'text-[var(--vscode-foreground)] border-[var(--vscode-focusBorder)]'
                  : 'text-[var(--vscode-descriptionForeground)] border-transparent hover:text-[var(--vscode-foreground)]'
              }`}
            >
              {label}
            </button>
          );
        })}
        <div className="flex-1" />
      </div>

      {/* ── Search input ── */}
      <div className="flex items-center gap-2 px-3 h-12 border-b border-[var(--vscode-input-border)]">
        <Search className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`${scopeLabel}…`}
          className="flex-1 bg-transparent outline-none text-base text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* ── Results ── */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-1.5 min-h-0">
        {loading ? (
          <div className="px-3 py-8 text-center text-sm text-[var(--vscode-descriptionForeground)]">
            {lang === 'zh' ? '加载中…' : 'Loading…'}
          </div>
        ) : items.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-[var(--vscode-descriptionForeground)]">
            {t('palette.noResults')}
          </div>
        ) : (
          items.map((item, index) => (
            <PaletteRow
              key={
                item.kind === 'document'
                  ? `doc-${item.doc.id}`
                  : item.kind === 'session'
                    ? `ses-${item.session.id}`
                    : `set-${item.sectionId}`
              }
              item={item}
              index={index}
              isSelected={index === selectedIndex}
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
          <span className="opacity-80">{lang === 'zh' ? '切换范围' : 'Switch'}</span>
        </span>
        <span className="flex-1" />
        <kbd className="px-1 rounded border border-[var(--vscode-input-border)]">Esc</kbd>
      </div>

      <style>{`
        @keyframes cpwIn {
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
  t,
  onClick,
  onMouseEnter,
}: {
  item: PaletteItem;
  index: number;
  isSelected: boolean;
  t: (key: TranslationKey) => string;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const baseClass = `flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer text-sm rounded-md transition-colors duration-75 ${
    isSelected
      ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
      : 'text-[var(--vscode-foreground)]'
  }`;
  const descClass = isSelected ? 'opacity-70' : 'text-[var(--vscode-descriptionForeground)]';

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
          {doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : ''}
        </span>
      </div>
    );
  }

  if (item.kind === 'session') {
    const { session, titleMatch } = item;
    const title = getSessionTitle(session);
    return (
      <div data-palette-index={index} onClick={onClick} onMouseEnter={onMouseEnter} className={baseClass}>
        <TerminalSquare className="w-4 h-4 shrink-0 opacity-60" />
        <span className="flex-1 truncate">
          <HighlightedText text={title} match={titleMatch} />
        </span>
      </div>
    );
  }

  // settings
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
