import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from './store/useStore';
import { useI18n } from './lib/core/i18n';
import { storage } from './lib/core/storage';
import { syncGlobalShortcuts, executeAction, type GlobalShortcutConfig } from './lib/shortcuts/globalShortcuts';
import { shortcutManager } from './lib/shortcuts/ShortcutManager';

// Side-effect import: registers built-in action handlers for global shortcuts.
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

  // ── Unified Shortcut Manager ──
  // Start the global keyboard shortcut handler on mount.
  // This replaces the previous per-component keydown handlers.
  useEffect(() => {
    shortcutManager.start();
    return () => shortcutManager.stop();
  }, []);

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
    let unlistenClose: (() => void) | null = null;

    (async () => {
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

      // Listen for window-close-requested events (Cmd+W on macOS).
      // WKWebView intercepts Cmd+W before JS can handle it, so we intercept
      // at the Rust layer and emit this event. Frontend decides: close tab
      // if multiple tabs exist, or close window if it's the last tab.
      unlistenClose = await listen('window-close-requested', () => {
        const store = useStore.getState();
        const tabs = store.tabs;
        const activeTabId = store.activeTabId;

        if (tabs.length > 1 && activeTabId) {
          // Multiple tabs: close the current tab.
          store.closeTab(activeTabId);
        } else {
          // Last tab (or no tabs): close the window.
          invoke('close_window').catch((err) => {
            console.error('[App] Failed to close window:', err);
          });
        }
      });
    })();

    return () => {
      unlistenTrigger?.();
      unlistenSelect?.();
      unlistenClose?.();
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
        <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden relative">
          {/* Document Tab Bar —绝对定位悬浮在内容上方 */}
          {!isSettingsOpen && !isTerminalView && <DocumentTabs />}

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
