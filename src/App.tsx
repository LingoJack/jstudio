import { useEffect, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useStore } from './store/useStore';
import { useI18n } from './lib/core/i18n';
import { eventToBinding, resolveBinding, type ShortcutBinding } from './lib/shortcuts/keyboardShortcuts';
import { buildCommands } from './lib/core/commandRegistry';
import { storage } from './lib/core/storage';
import { syncGlobalShortcuts, executeAction, type GlobalShortcutConfig } from './lib/shortcuts/globalShortcuts';
import { setupNativeMenu, NATIVE_CLOSE_TAB_EVENT } from './lib/core/nativeMenu';
// Side-effect import: registers built-in action handlers into the registry.
import './lib/shortcuts/globalShortcutActions';
import TitleBar from './components/layout/TitleBar';
import ActivityBar from './components/layout/ActivityBar';
import DocumentList from './components/documents/DocumentList';
import DocumentTabs from './components/documents/DocumentTabs';
import TerminalPanel from './components/terminal/TerminalPanel';
import BlockEditor from './components/editor/BlockEditor';
import SectionedBlockEditor from './components/editor/sectionEditor/SectionedBlockEditor';
import Settings from './components/settings/Settings';
import EmptyState from './components/ui/EmptyState';
import CommandPalette from './components/editor/CommandPalette';
import { ToastContainer } from './components/ui/Toast';

/**
 * Formatting shortcuts the editor owns.  When focus is inside a
 * contenteditable surface we must NOT hijack these — TipTap handles them.
 * Module-scope constant so the keydown handler doesn't rebuild the Set on
 * every keypress.
 */
const EDITOR_RESERVED = new Set([
  'mod+b', 'mod+i', 'mod+u', 'mod+e', 'mod+shift+s',
]);

export default function App() {
  const { t } = useI18n();
  const init = useStore((s) => s.init);
  const isLoading = useStore((s) => s.isLoading);
  // Subscribe to a boolean only — NOT the activeDoc object reference.
  // setActiveDocBlocks() (fires on every 300ms debounce tick) replaces the
  // activeDoc reference, which would re-render App and cascade to BlockEditor,
  // causing ProseMirror cursor lag (especially in code blocks).
  const hasActiveDoc = useStore((s) => !!s.activeDoc);
  const useSectionedEditor = useStore((s) => s.useSectionedEditor);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const isSettingsOpen = useStore((s) => s.isSettingsOpen);
  const activeSidebarView = useStore((s) => s.activeSidebarView);

  // Subscribe to a boolean only — NOT the tabs array reference.
  // Must be called BEFORE any early return to satisfy the Rules of Hooks.
  const hasTerminalTab = useStore(
    (s) => s.tabs.some((tab) => tab.kind === 'terminal'),
  );

  useEffect(() => {
    init();
  }, [init]);

  // ── Global shortcuts (command palette + all shortcutId-mapped commands) ──
  // Build a shortcutId → perform map once (commands are static).
  const shortcutCommandMap = useMemo(() => {
    const map = new Map<string, (store: ReturnType<typeof useStore.getState>) => void>();
    for (const cmd of buildCommands()) {
      if (cmd.shortcutId) {
        map.set(cmd.shortcutId, cmd.perform);
      }
    }
    return map;
  }, []);

  // User-customized bindings. Subscribed so the reverse lookup map below
  // rebuilds ONLY when the user changes a binding — not on every keypress.
  const keyboardShortcuts = useStore((s) => s.keyboardShortcuts);

  // Reverse index: effective binding string → action.  Built once per
  // override change (≈ never at runtime).  This replaces the previous
  // per-keystroke scan that ran resolveBinding() — an O(SHORTCUTS) find() —
  // ~20 times for EVERY key (including plain typing), just to discover that
  // a printable character matches nothing.  Now a keypress is a single
  // Map.get().  `null` perform marks the command-palette meta shortcut.
  const bindingActionMap = useMemo(() => {
    const map = new Map<
      ShortcutBinding,
      (store: ReturnType<typeof useStore.getState>) => void
    >();

    // Command palette (meta shortcut, not in buildCommands).
    const cpBinding = resolveBinding('app.commandPalette', keyboardShortcuts);
    if (cpBinding) {
      map.set(cpBinding, (store) => store.setCommandPaletteOpen(true));
    }

    // All other shortcutId-mapped commands.  If a user override collides with
    // the command palette binding, the palette wins (set first, not
    // overwritten) — matching the previous handler's early-return order.
    for (const [shortcutId, perform] of shortcutCommandMap) {
      const binding = resolveBinding(shortcutId, keyboardShortcuts);
      if (!binding || map.has(binding)) continue;
      map.set(binding, perform);
    }

    return map;
  }, [shortcutCommandMap, keyboardShortcuts]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const binding = eventToBinding(e);
      if (!binding) return;

      const perform = bindingActionMap.get(binding);
      if (!perform) return; // not a registered shortcut — fast path for typing

      // Editor conflict protection: when the focus is inside a contenteditable
      // element, let the editor handle known formatting shortcuts (bold,
      // italic, underline, strikethrough, inline code) to avoid hijacking.
      if (EDITOR_RESERVED.has(binding)) {
        const active = document.activeElement;
        const inEditor =
          active instanceof HTMLElement &&
          (active.isContentEditable ||
            active.closest('[contenteditable="true"], [data-editor-surface]'));
        if (inEditor) return;
      }

      e.preventDefault();
      perform(useStore.getState());
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [bindingActionMap]);

  // ── OS-level global shortcuts: register on config load, listen for triggers ──
  // The configs are loaded asynchronously into the store during initApp().
  const globalShortcutsConfigs = useStore((s) => s.globalShortcuts);

  // Register enabled shortcuts with the OS whenever the configs change.
  // IMPORTANT: configs are loaded asynchronously in initApp(), so on first
  // mount the store still holds the empty default `[]`. We must re-run sync
  // when `globalShortcutsConfigs` actually arrives — otherwise shortcuts are
  // never registered after a restart (they only worked because editing them
  // in Settings triggered a manual re-sync).
  useEffect(() => {
    const enabled = globalShortcutsConfigs.filter((c) => c.enabled);
    syncGlobalShortcuts(enabled).catch((err) => {
      console.error('[App] Failed to sync global shortcuts:', err);
    });
  }, [globalShortcutsConfigs]);

  useEffect(() => {
    let unlistenTrigger: (() => void) | null = null;
    let unlistenSelect: (() => void) | null = null;
    let unlistenCloseTab: (() => void) | null = null;

    (async () => {
      // Setup native menu to intercept Cmd+W on macOS.
      await setupNativeMenu();

      // Listen for OS-level shortcut trigger events.
      unlistenTrigger = await listen<GlobalShortcutConfig>(
        'global-shortcut-triggered',
        (event) => {
          const config = event.payload;
          executeAction(config, {
            emit: async (eventName, payload) => {
              const { emit } = await import('@tauri-apps/api/event');
              await emit(eventName, payload);
            },
          });
        },
      );

      // Listen for CommandPaletteWindow selection events.
      unlistenSelect = await listen<{
        kind: 'document' | 'session' | 'settings';
        id: string;
      }>('command-palette-select', async (event) => {
        const { kind, id } = event.payload;
        const win = getCurrentWindow();
        await win.show();
        await win.setFocus();
        const store = useStore.getState();
        if (kind === 'document') {
          store.openDocument(id);
          store.setSearchQuery('');
        } else if (kind === 'session') {
          store.setActiveSession(id);
        } else if (kind === 'settings') {
          store.setSettingsOpen(true);
          store.setSettingsActiveSection(id as 'general');
        }
      });

      // Listen for native menu "Close Tab" event (Cmd+W intercepted by macOS).
      unlistenCloseTab = await listen(NATIVE_CLOSE_TAB_EVENT, () => {
        const { activeTabId } = useStore.getState();
        if (activeTabId) {
          useStore.getState().closeTab(activeTabId);
        }
      });
    })();

    return () => {
      unlistenTrigger?.();
      unlistenSelect?.();
      unlistenCloseTab?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen bg-[var(--vscode-editor-background)] flex items-center justify-center">
        <div className="text-[var(--vscode-descriptionForeground)] text-sm">
          {t('general.loading')}
        </div>
      </div>
    );
  }

  // Determine if we're in terminal view (terminal mode hides the sidebar
  // entirely — the terminal panel takes over the full editor area).
  const isTerminalView =
    !isSettingsOpen && activeSidebarView === 'terminal';

  // hasTerminalTab is computed above via useStore, before the early return.

  return (
    <div className="h-screen w-full flex flex-col bg-[var(--vscode-activityBar-background)] text-[var(--vscode-editor-foreground)] font-sans tracking-tight overflow-hidden">
      {/* ==============================
          Title Bar (full width, macOS traffic lights + global search)
         ============================== */}
      <TitleBar />

      {/* ==============================
          Main row: Activity Bar + Sidebar + Content
         ============================== */}
      <div className="flex-1 min-h-0 flex">
        {/* Activity Bar (left-most) */}
        <ActivityBar />

        {/* Secondary sidebar: hidden in terminal view and settings */}
        {isSidebarOpen && !isSettingsOpen && !isTerminalView && (
          <DocumentList />
        )}

        {/* Main content area (right) */}
        <div className="flex-1 min-w-0 h-full bg-[var(--vscode-editor-background)] flex flex-col overflow-hidden">
          {/* Document Tab Bar — only shown in documents view, not in
              terminal view (terminal has its own tab bar) or settings. */}
          {!isSettingsOpen && !isTerminalView && <DocumentTabs />}

          <div className="flex-1 min-h-0 overflow-hidden relative">
            {/* Terminal panel: mount when there are terminal tabs OR we're
                in terminal view (so it can auto-create the first session).
                Stays mounted (CSS-hidden) when switching to documents to
                preserve xterm instances + PTY listeners + scrollback. */}
            {(hasTerminalTab || isTerminalView) && (
              <div
                className={`absolute inset-0 ${
                  isTerminalView ? '' : 'hidden'
                }`}
              >
                <TerminalPanel hidden={!isTerminalView} />
              </div>
            )}

            {/* Settings / Editor / EmptyState overlaid on top */}
            {isSettingsOpen ? (
              <Settings />
            ) : !isTerminalView ? (
              hasActiveDoc ? (
                // The sectioned editor (multi-instance ProseMirror) gives
                // better large-document typing performance. Toggle it in
                // Settings → Debug → Active Editor.
                useSectionedEditor ? (
                  <SectionedBlockEditor />
                ) : (
                  <BlockEditor />
                )
              ) : (
                <EmptyState />
              )
            ) : null}
          </div>
        </div>
      </div>

      {/* ==============================
          Global Toast Notifications (top-right, above everything)
         ============================== */}
      <ToastContainer />

      {/* ==============================
          Command Palette (global overlay, above everything)
         ============================== */}
      <CommandPalette />
    </div>
  );
}
