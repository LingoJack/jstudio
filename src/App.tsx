import { useEffect, useMemo } from 'react';
import { useStore } from './store/useStore';
import { useI18n } from './lib/i18n';
import { eventToBinding, resolveBinding } from './lib/shortcuts';
import { buildCommands } from './lib/commandRegistry';
import TitleBar from './components/TitleBar';
import ActivityBar from './components/ActivityBar';
import DocumentList from './components/DocumentList';
import TerminalPanel from './components/terminal/TerminalPanel';
import BlockEditor from './components/BlockEditor';
import Settings from './components/Settings';
import EmptyState from './components/EmptyState';
import CommandPalette from './components/CommandPalette';
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
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const isSettingsOpen = useStore((s) => s.isSettingsOpen);
  const activeSidebarView = useStore((s) => s.activeSidebarView);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const binding = eventToBinding(e);
      if (!binding) return;

      const overrides = useStore.getState().keyboardShortcuts;

      // Check all registered shortcut commands
      for (const [shortcutId, perform] of shortcutCommandMap) {
        const target = resolveBinding(shortcutId, overrides);
        if (binding !== target) continue;

        // Editor conflict protection: when the focus is inside a contenteditable
        // element, let the editor handle known formatting shortcuts (bold,
        // italic, underline, strikethrough, inline code) to avoid hijacking.
        const active = document.activeElement;
        const inEditor =
          active instanceof HTMLElement &&
          (active.isContentEditable ||
            active.closest('[contenteditable="true"], [data-editor-surface]'));
        const EDITOR_RESERVED = new Set([
          'mod+b', 'mod+i', 'mod+u', 'mod+e', 'mod+shift+s',
        ]);
        if (inEditor && EDITOR_RESERVED.has(binding)) return;

        e.preventDefault();
        perform(useStore.getState());
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcutCommandMap]);

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

        {/* Secondary sidebar: only shown in documents view */}
        {isSidebarOpen && !isSettingsOpen && !isTerminalView && (
          <DocumentList />
        )}

        {/* Main content area (right) */}
        <div className="flex-1 min-w-0 h-full bg-[var(--vscode-editor-background)] flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {/* Terminal panel stays mounted (CSS-hidden when inactive) to
                preserve xterm instances + PTY listeners + scrollback. */}
            <div
              className={`absolute inset-0 ${
                isTerminalView && !isSettingsOpen ? '' : 'hidden'
              }`}
            >
              <TerminalPanel hidden={isSettingsOpen || !isTerminalView} />
            </div>

            {/* Settings / Editor / EmptyState overlaid on top */}
            {isSettingsOpen ? (
              <Settings />
            ) : !isTerminalView ? (
              hasActiveDoc ? (
                <BlockEditor />
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
