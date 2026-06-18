import { useStore } from '../store/useStore';
import { useI18n } from '../lib/i18n';
import { FileText, Settings as SettingsIcon } from 'lucide-react';

/**
 * Activity Bar — the leftmost narrow strip (48px).
 *
 * Contains two entries:
 *   - Top:    Documents (toggles sidebar / exits Settings)
 *   - Bottom: Settings  (opens the Settings page)
 *
 * The active item is highlighted with a border or full color depending on
 * the `activityBarBorder` preference from the UI store.
 */
export default function ActivityBar() {
  const { t } = useI18n();
  const isSettingsOpen = useStore((s) => s.isSettingsOpen);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const activityBarBorder = useStore((s) => s.activityBarBorder);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  const activeClass = activityBarBorder
    ? 'text-[var(--vscode-foreground)] border border-[var(--vscode-focusBorder)]'
    : 'text-[var(--vscode-foreground)]';
  const inactiveClass =
    'text-[var(--vscode-activityBar-foreground)] opacity-40 hover:opacity-80 hover:bg-[var(--vscode-list-hoverBackground)]';

  return (
    <div className="w-12 shrink-0 flex flex-col items-center justify-between bg-[var(--vscode-activityBar-background)] border-r border-[var(--vscode-activityBar-border)] py-2 select-none">
      {/* Top: Documents entry */}
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => {
            setSettingsOpen(false);
            if (!isSidebarOpen) toggleSidebar();
          }}
          className={`w-10 h-10 flex items-center justify-center rounded-md transition-colors duration-150 cursor-pointer ${
            !isSettingsOpen ? activeClass : inactiveClass
          }`}
          title={t('app.documents')}
        >
          <FileText className="w-5 h-5" />
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
