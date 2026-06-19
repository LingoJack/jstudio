import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { useI18n } from './lib/i18n';
import { Terminal, Plus } from 'lucide-react';
import TitleBar from './components/TitleBar';
import ActivityBar from './components/ActivityBar';
import DocumentList from './components/DocumentList';
import TerminalPanel from './components/terminal/TerminalPanel';
import BlockEditor from './components/BlockEditor';
import Settings from './components/Settings';
import EmptyState from './components/EmptyState';

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
  const activeSessionId = useStore((s) => s.activeSessionId);
  const createSession = useStore((s) => s.createSession);

  useEffect(() => {
    init();
  }, [init]);

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
          <div className="flex-1 min-h-0 overflow-hidden">
            {isSettingsOpen ? (
              <Settings />
            ) : isTerminalView ? (
              activeSessionId ? (
                <TerminalPanel />
              ) : (
                /* Empty terminal state */
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-[var(--vscode-descriptionForeground)]">
                  <Terminal className="w-12 h-12 opacity-30" />
                  <button
                    onClick={() => createSession()}
                    className="jstudio-btn-primary"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('terminal.newSession')}</span>
                  </button>
                </div>
              )
            ) : hasActiveDoc ? (
              <BlockEditor />
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
