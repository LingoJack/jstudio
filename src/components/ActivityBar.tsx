import { useStore } from '../store/useStore';
import { useI18n } from '../lib/i18n';
import { FileText, Settings as SettingsIcon, TerminalSquare } from 'lucide-react';

/**
 * Activity Bar — the leftmost narrow strip (48px).
 *
 * Contains three entries:
 *   - Top:    Documents (toggles sidebar / exits Settings)
 *   - Mid:    Terminal  (switches sidebar to terminal session list)
 *   - Bottom: Settings  (opens the Settings page)
 *
 * The active item is highlighted with a border or full color depending on
 * the `activityBarBorder` preference from the UI store.
 */
export default function ActivityBar() {
  const { t } = useI18n();
  const isSettingsOpen = useStore((s) => s.isSettingsOpen);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const activeSidebarView = useStore((s) => s.activeSidebarView);
  const activityBarBorder = useStore((s) => s.activityBarBorder);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setActiveSidebarView = useStore((s) => s.setActiveSidebarView);

  const activeClass = activityBarBorder
    ? 'text-[var(--vscode-foreground)] border border-[var(--vscode-focusBorder)]'
    : 'text-[var(--vscode-foreground)]';
  const inactiveClass =
    'text-[var(--vscode-activityBar-foreground)] opacity-40 hover:opacity-80 hover:bg-[var(--vscode-list-hoverBackground)]';

  // Whether the documents icon should show as active.
  const isDocsActive =
    !isSettingsOpen &&
    isSidebarOpen &&
    activeSidebarView === 'documents';

  // Whether the terminal icon should show as active.
  const isTerminalActive =
    !isSettingsOpen &&
    isSidebarOpen &&
    activeSidebarView === 'terminal';

  return (
    <div className="w-12 shrink-0 flex flex-col items-center justify-between bg-[var(--vscode-activityBar-background)] border-r border-[var(--vscode-activityBar-border)] py-2 select-none">
      {/* Top: Documents + Terminal entries */}
      <div className="flex flex-col items-center gap-1">
        {/* Documents */}
        <button
          onClick={() => {
            setSettingsOpen(false);
            if (activeSidebarView !== 'documents') {
              setActiveSidebarView('documents');
              if (!isSidebarOpen) toggleSidebar();
            } else if (!isSidebarOpen) {
              toggleSidebar();
            }
          }}
          className={`w-10 h-10 flex items-center justify-center rounded-md transition-colors duration-150 cursor-pointer ${
            isDocsActive ? activeClass : inactiveClass
          }`}
          title={t('app.documents')}
        >
          <FileText className="w-5 h-5" />
        </button>

        {/* Terminal */}
        <button
          onClick={() => {
            setSettingsOpen(false);
            if (activeSidebarView !== 'terminal') {
              setActiveSidebarView('terminal');
              if (!isSidebarOpen) toggleSidebar();
            } else if (!isSidebarOpen) {
              toggleSidebar();
            }
          }}
          className={`w-10 h-10 flex items-center justify-center rounded-md transition-colors duration-150 cursor-pointer ${
            isTerminalActive ? activeClass : inactiveClass
          }`}
          title={t('app.terminal')}
        >
          <TerminalSquare className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom: Settings entry */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => setSettingsOpen(true)}
          className={`w-10 h-10 flex items-center justify-center rounded-md transition-colors duration-150 cursor-pointer ${
            isSettingsOpen ? activeClass : inactiveClass
          }`}
          title={t('app.settings')}
        >
          <SettingsIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
