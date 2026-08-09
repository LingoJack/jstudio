import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from './store/useStore';
import { useI18n } from './lib/core/i18n';
import { ipc } from './lib/core/ipc';
import { toast } from './lib/core/toast';
import { syncGlobalShortcuts, executeAction, type GlobalShortcutConfig } from './lib/shortcuts/globalShortcuts';
import { shortcutManager } from './lib/shortcuts/ShortcutManager';
import { resolveBinding, toTauriAccelerator } from './lib/shortcuts/keyboardShortcuts';

// Side-effect import: registers built-in action handlers for global shortcuts.
import './lib/shortcuts/globalShortcutActions';

import AppTitleBar from './components/layout/AppTitleBar';
import ActivityBar from './components/layout/ActivityBar';
import DocumentSidebar from './components/documents/DocumentSidebar';
import DocumentTabs from './components/documents/DocumentTabs';
import TerminalPanel from './components/terminal/TerminalPanel';
import AgentChatPanel from './components/agent/AgentChatPanel';
import AgentSidebar from './components/agent/AgentSidebar';
import BrowserPanel from './components/panels/BrowserPanel';
import DeferredWorkspaceContent from './components/workspace/DeferredWorkspaceContent';
import SettingsPanel from './components/settings/SettingsPanel';
import CommandPalette from './components/editor/CommandPalette';
import { ToastContainer } from './components/ui/Toast';

export default function App() {
  const { t } = useI18n();
  const init = useStore((s) => s.init);
  const isLoading = useStore((s) => s.isLoading);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const isSettingsOpen = useStore((s) => s.isSettingsOpen);
  const activeSidebarView = useStore((s) => s.activeSidebarView);
  const keyboardShortcuts = useStore((s) => s.keyboardShortcuts);

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

  // Keep the macOS native Find menu accelerator aligned with the effective
  // user binding. Other platforms accept this command as a no-op.
  useEffect(() => {
    if (isLoading) return;
    const binding = resolveBinding('app.find', keyboardShortcuts);
    const accelerator = toTauriAccelerator(binding);
    invoke('set_native_menu_accelerator', {
      commandId: 'app.find',
      accelerator,
    }).catch((error) => {
      console.error('[App] Failed to sync native Find accelerator:', error);
    });
  }, [isLoading, keyboardShortcuts]);

  // Keep the macOS native "Inline Code" menu accelerator aligned with the
  // effective user binding. The menu item claims the Cmd+` key equivalent
  // so macOS doesn't swallow it as the system "Cycle Windows" accelerator
  // (see src-tauri/src/lib.rs::build_app_menu + docs/bug-graveyard.md #001).
  // Other platforms accept this command as a no-op.
  useEffect(() => {
    if (isLoading) return;
    const binding = resolveBinding('editor.inlineCode', keyboardShortcuts);
    const accelerator = toTauriAccelerator(binding);
    invoke('set_native_menu_accelerator', {
      commandId: 'editor.inlineCode',
      accelerator,
    }).catch((error) => {
      console.error('[App] Failed to sync native Inline Code accelerator:', error);
    });
  }, [isLoading, keyboardShortcuts]);

  // ── Document abnormal-shrink detection ──
  // Backend emits this when `write_document` detects the new content is
  // suspiciously smaller than the old (e.g. a bug overwrote the doc with a
  // blank block). Warn the user so they can restore from backup.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ docId: string; oldCount: number; newCount: number }>(
      'document:abnormal-shrink',
      (event) => {
        const { docId, oldCount, newCount } = event.payload;
        const doc = useStore.getState().documents.find((d) => d.id === docId);
        const title = doc?.title || docId;
        toast.warning(t('backup.abnormalShrink', { title, oldCount, newCount }), 8000);
      },
    ).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [t]);

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
          store.openDocumentTab(id);
          store.setSearchQuery('');
        } else if (kind === 'session') {
          store.setActiveSession(id);
        } else if (kind === 'settings') {
          store.setSettingsOpen(true);
          store.setSettingsActiveSection(id as 'general');
        }
      });

      // Listen for window-close-requested events (traffic-light close button
      // on macOS). Cmd+W is now handled separately via the native menu event
      // ("app.closeTab" -> executeShortcutAction), so this listener only
      // fires when the user clicks the window's close button.
      // Frontend decides: close tab if multiple tabs exist, or close window
      // if it's the last tab.
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

  // Agent view: agent panel takes over the full editor area (like terminal).
  const isAgentView =
    !isSettingsOpen && activeSidebarView === 'agent';

  // Browser view: inline browser panel takes over the full editor area
  // (like terminal/agent). Native child webviews are positioned on top of
  // the React UI via the ResizeObserver rect reported by BrowserPanel.
  const isBrowserView =
    !isSettingsOpen && activeSidebarView === 'browser';

  // hasTerminalTab is computed above via useStore, before the early return.

  return (
    <div className="h-screen w-full flex flex-col bg-[var(--vscode-activityBar-background)] text-[var(--vscode-editor-foreground)] font-sans tracking-tight overflow-hidden">
      {/* ==============================
          Title Bar (full width, macOS traffic lights + global search)
         ============================== */}
      <AppTitleBar />

      {/* ==============================
          Main row: Activity Bar + Sidebar + Content
         ============================== */}
      <div className="flex-1 min-h-0 flex">
        {/* Activity Bar (left-most) */}
        <ActivityBar />

        {/* Secondary sidebar: hidden in terminal view and settings */}
        {/* Document sidebar: shown when sidebar is open and not in terminal/agent/browser/settings view */}
        {isSidebarOpen && !isSettingsOpen && !isTerminalView && !isAgentView && !isBrowserView && (
          <DocumentSidebar />
        )}

        {/* Agent sidebar: shown when in agent view */}
        {isAgentView && <AgentSidebar />}

        {/* Main content area (right) */}
        <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden relative">
          {/* Document Tab Bar */}
          {!isSettingsOpen && !isTerminalView && !isAgentView && !isBrowserView && <DocumentTabs />}

          {/* Terminal panel: mount-once, CSS-hide */}
          {(hasTerminalTab || isTerminalView) && (
            <div
              className={`absolute inset-0 ${
                isTerminalView ? '' : 'hidden'
              }`}
            >
              <TerminalPanel hidden={!isTerminalView} />
            </div>
          )}

          {/* Agent chat panel: mount-once, CSS-hide */}
          <div
            className={`absolute inset-0 ${
              isAgentView ? '' : 'hidden'
            }`}
          >
            <AgentChatPanel hidden={!isAgentView} />
          </div>

          {/* Browser panel: mount-once, CSS-hide */}
          <div
            className={`absolute inset-0 ${
              isBrowserView ? '' : 'hidden'
            }`}
          >
            <BrowserPanel hidden={!isBrowserView} />
          </div>

          {/* Keep workspace content mounted so concurrent tab transitions can finish safely. */}
          <DeferredWorkspaceContent
            visible={!isSettingsOpen && !isTerminalView && !isAgentView && !isBrowserView}
          />

          {/* Settings take priority over workspace content. */}
          {isSettingsOpen && <SettingsPanel />}
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
