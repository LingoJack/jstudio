/**
 * CommandPaletteWindow — macOS Spotlight/Raycast 风格浮动搜索窗口。
 *
 * 渲染在独立的 Tauri webview 窗口中（通过 open-panel 全局快捷键打开）。
 * 不共享主窗口的 Zustand store，数据通过 storage API 直接加载。
 *
 * 交互（Spotlight 风格）：
 *   - 打开时只有一个搜索输入框，无结果列表
 *   - 输入文字后才在下方显示联想结果
 *   - Enter 执行选中项 → emit 事件到主窗口 → 关闭自身
 *
 * 窗口行为：
 *   - 无边框、透明、始终置顶、居中
 *   - Escape → 关闭
 *   - 点击输入框外的空白区域 → 关闭
 *   - 关键：外层 wrapper 用 rgba(0,0,0,0.01) 而非 transparent，
 *     否则 macOS WKWebView 透明区域会 click-through，点击事件无法触发
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  FileText,
  TerminalSquare,
  Settings2,
  ChevronRight,
  BookOpen,
  Info,
  Keyboard,
  PenLine,
  type LucideIcon,
} from 'lucide-react';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { storage, type DocumentMeta, type TerminalSessionInfo, type ThemeMode } from '../../lib/core/storage';
import { useI18n, type Language, type TranslationKey } from '../../lib/core/i18n';
import type { SettingsSectionId } from '../../store/uiSlice';

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

type PaletteItem =
  | { kind: 'document'; doc: DocumentMeta; titleMatch: [number, number] | null }
  | { kind: 'session'; session: TerminalSessionInfo; titleMatch: [number, number] | null }
  | { kind: 'settings'; sectionId: SettingsSectionId; titleMatch: [number, number] | null };

// ──────────────────────────────────────────────────────────────────
// Settings sections
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

function HighlightedText({ text, match }: { text: string; match: [number, number] | null }) {
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

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
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
  const panelRef = useRef<HTMLDivElement>(null);

  // ── 1. 强制透明背景 + 同步主题 ──
  // 这是独立窗口，不继承主窗口的 store。必须手动：
  //   a) 注入 CSS 让 html/body/#root 透明（否则 body 的不透明背景填满整个窗口矩形 = 白色方块）
  //   b) 根据 settings.json 切换 .dark 类
  useEffect(() => {
    // (a) 强制透明 — 用 !important 确保覆盖 vscode-theme.css 的 body 规则
    const styleEl = document.createElement('style');
    styleEl.id = 'cpw-transparent-bg';
    styleEl.textContent = `
      html, body, #root {
        background: transparent !important;
        background-color: transparent !important;
      }
    `;
    document.head.appendChild(styleEl);

    // (b) 同步主题
    document.documentElement.classList.add('dark'); // 先默认暗色，避免闪烁
    storage.loadSettings().then((settings) => {
      const isDark = resolveDark(settings.theme ?? 'system');
      document.documentElement.classList.toggle('dark', isDark);
    }).catch(() => {
      /* 保持 dark 回退 */
    });

    return () => {
      styleEl.remove();
    };
  }, []);

  // ── 2. 加载数据 ──
  useEffect(() => {
    (async () => {
      try {
        const [docs, sess] = await Promise.all([
          storage.loadIndex(),
          storage.ptyList().catch(() => [] as TerminalSessionInfo[]),
        ]);
        setDocuments(docs);
        setSessions(sess);
        if (sess.length > 0 && docs.length === 0) {
          setScope('terminal');
        }
      } catch (e) {
        console.error('[CPW] load failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── 3. 自动聚焦输入框 ──
  useEffect(() => {
    // 多次重试确保 focus 生效（WKWebView 初始化时序不稳定）
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // ── 4. 关闭窗口 ──
  const closeWindow = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      await win.close();
    } catch (e1) {
      console.warn('[CPW] close() failed, trying destroy():', e1);
      try {
        const win = getCurrentWindow();
        await win.destroy();
      } catch (e2) {
        console.error('[CPW] destroy() also failed:', e2);
      }
    }
  }, []);

  // ── 5. Escape 关闭（capture 阶段，确保任何焦点下都生效）──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeWindow();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [closeWindow]);

  // ── 6. 失焦自动关闭（Spotlight UX）──
  // 使用 Tauri 窗口级别 onFocusChanged，比 DOM blur 更可靠。
  // 延迟 300ms 启用监听，避免窗口初始化过程中的假失焦事件。
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let active = false;
    const timer = setTimeout(() => {
      active = true;
      getCurrentWindow()
        .onFocusChanged(({ payload: focused }) => {
          if (active && !focused) {
            closeWindow();
          }
        })
        .then((fn) => {
          unlisten = fn;
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
      unlisten?.();
    };
  }, [closeWindow]);

  // ── 7. 点击面板外部关闭 ──
  // 外层 wrapper 用 rgba(0,0,0,0.01) 而非 transparent。
  // macOS WKWebView 中 alpha=0 的区域是 click-through 的（点击穿透到下层应用），
  // 用 0.01 的 alpha 让区域可接收点击事件，但视觉上完全不可见。
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      closeWindow();
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', onMouseDown);
    }, 300);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [closeWindow]);

  // ── 8. 构建搜索结果（仅当有输入时）──
  const effectiveQuery = query.trim().toLowerCase();

  const items = useMemo<PaletteItem[]>(() => {
    if (!effectiveQuery) return [];

    if (scope === 'documents') {
      return documents
        .map((doc): { doc: DocumentMeta; titleMatch: [number, number] | null } | null => {
          const title = (doc.title || '').toLowerCase();
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
          const idx = title.indexOf(effectiveQuery);
          return idx === -1 ? null : { session: s, titleMatch: [idx, idx + effectiveQuery.length] };
        })
        .filter((x): x is { session: TerminalSessionInfo; titleMatch: [number, number] | null } => x !== null)
        .map((x) => ({ kind: 'session' as const, ...x }));
    }

    return SETTINGS_SECTIONS.map(
      (sec): { sectionId: SettingsSectionId; titleMatch: [number, number] | null } | null => {
        const label = t(sec.labelKey).toLowerCase();
        const idx = label.indexOf(effectiveQuery);
        return idx === -1 ? null : { sectionId: sec.id, titleMatch: [idx, idx + effectiveQuery.length] };
      },
    )
      .filter((x): x is { sectionId: SettingsSectionId; titleMatch: [number, number] | null } => x !== null)
      .map((x) => ({ kind: 'settings' as const, ...x }));
  }, [scope, effectiveQuery, documents, sessions, t]);

  // ── 8. 重置选中索引 ──
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, scope]);

  // ── 9. 自动滚动到选中项 ──
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-palette-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ── 10. 执行选中项 ──
  const executeItem = useCallback(
    async (item: PaletteItem) => {
      if (item.kind === 'document') {
        await emit('command-palette-select', { kind: 'document', id: item.doc.id });
      } else if (item.kind === 'session') {
        await emit('command-palette-select', { kind: 'session', id: item.session.id });
      } else {
        await emit('command-palette-select', { kind: 'settings', id: item.sectionId });
      }
      closeWindow();
    },
    [closeWindow],
  );

  // ── 11. 键盘导航 ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeWindow();
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
      if (items[selectedIndex]) executeItem(items[selectedIndex]);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const scopes: ('documents' | 'terminal' | 'settings')[] = ['documents', 'terminal', 'settings'];
      setScope(scopes[(scopes.indexOf(scope) + 1) % scopes.length]);
      return;
    }
  };

  const scopeLabel =
    scope === 'documents'
      ? t('palette.tabDocuments')
      : scope === 'terminal'
        ? t('palette.tabTerminal')
        : t('palette.tabSettings');

  const showResults = query.trim().length > 0;

  return (
    // 外层 wrapper：填满整个透明窗口。
    // background 用 rgba(0,0,0,0.01) — 视觉上完全透明，但 macOS 不再 click-through，
    // 使得点击面板外的区域能触发 mousedown → 关闭窗口。
    <div
      className="fixed inset-0 flex flex-col items-center pt-[8vh]"
      style={{ background: 'rgba(0,0,0,0.01)' }}
    >
      {/* ── 面板 ── */}
      <div
        ref={panelRef}
        className="flex flex-col overflow-hidden"
        style={{
          width: 'min(680px, 92vw)',
          maxHeight: '72vh',
          background: 'var(--vscode-quickInput-background)',
          border: '1px solid var(--vscode-widget-border)',
          borderRadius: '12px',
          boxShadow:
            '0 20px 70px -12px rgba(0,0,0,0.55), 0 8px 24px -8px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.06)',
          animation: 'cpwIn 120ms ease-out',
        }}
      >
        {/* ── 搜索输入框（始终可见）── */}
        <div className="flex items-center gap-2.5 px-3.5 h-12 shrink-0 border-b border-[var(--vscode-widget-border)]">
          <Search className="w-4 h-4 text-[var(--vscode-descriptionForeground)] shrink-0 opacity-60" />
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
          {/* 范围切换 */}
          <button
            onClick={() => {
              const scopes: ('documents' | 'terminal' | 'settings')[] = ['documents', 'terminal', 'settings'];
              setScope(scopes[(scopes.indexOf(scope) + 1) % scopes.length]);
            }}
            className="shrink-0 text-[10px] font-medium px-2 py-1 rounded-md border border-[var(--vscode-widget-border)] text-[var(--vscode-descriptionForeground)] transition-colors duration-75"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            {scopeLabel}
          </button>
        </div>

        {/* ── 结果列表（仅当有输入时显示）── */}
        {showResults && (
          <div ref={listRef} className="flex-1 overflow-y-auto py-1.5 min-h-0">
            {loading ? (
              <div className="px-3 py-8 text-center text-sm text-[var(--vscode-descriptionForeground)] opacity-60">
                {lang === 'zh' ? '加载中…' : 'Loading…'}
              </div>
            ) : items.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-[var(--vscode-descriptionForeground)] opacity-60">
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
        )}
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
// Row
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
  // 选中高亮只由 selectedIndex 状态驱动，不用 CSS :hover（遵循 AGENTS.md 规范）
  const baseClass = `flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm transition-colors duration-75 ${
    isSelected
      ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
      : 'text-[var(--vscode-foreground)]'
  }`;
  const mutedClass = isSelected ? 'opacity-60' : 'text-[var(--vscode-descriptionForeground)] opacity-60';

  if (item.kind === 'document') {
    const { doc, titleMatch } = item;
    return (
      <div data-palette-index={index} onClick={onClick} onMouseEnter={onMouseEnter} className={baseClass}>
        <FileText className={`w-4 h-4 shrink-0 ${isSelected ? 'opacity-80' : 'opacity-40'}`} />
        <span className="flex-1 truncate">
          {doc.title ? (
            <HighlightedText text={doc.title} match={titleMatch} />
          ) : (
            <span className="opacity-50 italic">Untitled</span>
          )}
        </span>
        <span className={`text-[10px] shrink-0 ${mutedClass}`}>
          {doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : ''}
        </span>
      </div>
    );
  }

  if (item.kind === 'session') {
    const { session, titleMatch } = item;
    return (
      <div data-palette-index={index} onClick={onClick} onMouseEnter={onMouseEnter} className={baseClass}>
        <TerminalSquare className={`w-4 h-4 shrink-0 ${isSelected ? 'opacity-80' : 'opacity-40'}`} />
        <span className="flex-1 truncate">
          <HighlightedText text={getSessionTitle(session)} match={titleMatch} />
        </span>
      </div>
    );
  }

  const secMeta = SETTINGS_SECTIONS.find((s) => s.id === item.sectionId)!;
  const Icon = secMeta.icon;
  return (
    <div data-palette-index={index} onClick={onClick} onMouseEnter={onMouseEnter} className={baseClass}>
      <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'opacity-80' : 'opacity-40'}`} />
      <span className="flex-1 truncate">
        <HighlightedText text={t(secMeta.labelKey)} match={item.titleMatch} />
      </span>
      <ChevronRight className={`w-3 h-3 shrink-0 ${mutedClass}`} />
    </div>
  );
}
