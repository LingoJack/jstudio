import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { useI18n } from './lib/i18n';
import { TerminalSquare } from 'lucide-react';
import TitleBar from './components/TitleBar';
import ActivityBar from './components/ActivityBar';
import DocumentList from './components/DocumentList';
import TerminalSessionList from './components/TerminalSessionList';
import TerminalPanel from './components/TerminalPanel';
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

  // Determine which sidebar panel to show
  const showTerminalSidebar =
    isSidebarOpen && !isSettingsOpen && activeSidebarView === 'terminal';

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

        {/* Secondary sidebar: switches between Document list and Terminal sessions */}
        {isSidebarOpen && !isSettingsOpen && (
          showTerminalSidebar ? <TerminalSessionList /> : <DocumentList />
        )}

        {/* Main content area (right) */}
        <div className="flex-1 min-w-0 h-full bg-[var(--vscode-editor-background)] flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            {isSettingsOpen ? (
              <Settings />
            ) : showTerminalSidebar ? (
              activeSessionId ? (
                <TerminalPanel />
              ) : (
                /* Empty terminal state */
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-[var(--vscode-descriptionForeground)]">
                  <TerminalSquare className="w-12 h-12 opacity-30" />
                  <p className="text-sm">{t('terminal.empty')}</p>
                  <button
                    onClick={() => createSession()}
                    className="text-xs px-3 py-1.5 rounded-md bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors cursor-pointer"
                  >
                    {t('terminal.newSession')}
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
