import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { ACTIVITY_ITEM_META } from '../../lib/activityMeta';
import type { ActivityItemId } from '../../lib/core/storage';

/**
 * Activity Bar — the leftmost narrow strip (48px).
 *
 * Renders entries dynamically based on the `activityBarItems` config from
 * the UI store. Each entry can be toggled visible/hidden and reordered.
 *
 * Layout:
 *   - Top section: all non-settings entries (documents, terminal, …) in
 *     their configured order.
 *   - Bottom section: settings is pinned at the bottom (VSCode-style).
 */
export default function ActivityBar() {
  const { t } = useI18n();
  const isSettingsOpen = useStore((s) => s.isSettingsOpen);
  const isSidebarOpen = useStore((s) => s.isSidebarOpen);
  const activeSidebarView = useStore((s) => s.activeSidebarView);
  const activityBarItems = useStore((s) => s.activityBarItems);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setActiveSidebarView = useStore((s) => s.setActiveSidebarView);
  const tabs = useStore((s) => s.tabs);
  const setActiveTab = useStore((s) => s.setActiveTab);

  const activeClass = 'text-[var(--vscode-foreground)]';
  const inactiveClass =
    'text-[var(--vscode-activityBar-foreground)] opacity-40 hover:opacity-80 hover:bg-[var(--vscode-list-hoverBackground)]';

  // Whether the documents icon should show as active.
  const isDocsActive =
    !isSettingsOpen &&
    isSidebarOpen &&
    activeSidebarView === 'documents';

  // Whether the terminal icon should show as active (terminal view hides
  // the sidebar, so we only check view + not settings).
  const isTerminalActive =
    !isSettingsOpen && activeSidebarView === 'terminal';

  /** Determine whether a given entry should render as active. */
  function isActive(id: ActivityItemId): boolean {
    if (id === 'documents') return isDocsActive;
    if (id === 'terminal') return isTerminalActive;
    if (id === 'settings') return isSettingsOpen;
    return false;
  }

  /** Click handler for a given entry. */
  function handleClick(id: ActivityItemId) {
    if (id === 'documents') {
      setSettingsOpen(false);
      // If there are document tabs, focus the most recent one.
      const lastDocTab = [...tabs].reverse().find((t) => t.kind === 'document');
      if (lastDocTab) {
        setActiveTab(lastDocTab.id);
      } else {
        // No document tabs — just switch the view.
        setActiveSidebarView('documents');
      }
    } else if (id === 'terminal') {
      setSettingsOpen(false);
      // If there are terminal tabs, focus the most recent one.
      const lastTermTab = [...tabs].reverse().find((t) => t.kind === 'terminal');
      if (lastTermTab) {
        setActiveTab(lastTermTab.id);
      } else {
        // No terminal tabs — switch to terminal view; TerminalPanel
        // will auto-create the first session.
        setActiveSidebarView('terminal');
      }
    } else if (id === 'settings') {
      setSettingsOpen(true);
    }
  }

  // Split config: top items vs. bottom (settings is always pinned to bottom).
  const topItems = activityBarItems.filter(
    (item) => item.visible && item.id !== 'settings',
  );
  const settingsItem = activityBarItems.find(
    (item) => item.id === 'settings' && item.visible,
  );

  /** Render a single activity bar entry. */
  function renderEntry(id: ActivityItemId) {
    const meta = ACTIVITY_ITEM_META[id];
    if (!meta) return null;
    const Icon = meta.icon;
    return (
      <button
        key={id}
        onClick={() => handleClick(id)}
        className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors duration-150 cursor-pointer ${
          isActive(id) ? activeClass : inactiveClass
        }`}
        title={t(meta.labelKey)}
      >
        <Icon className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="w-12 shrink-0 flex flex-col items-center justify-between bg-[var(--vscode-activityBar-background)] border-r border-[var(--vscode-activityBar-border)] py-2 select-none">
      {/* Top: configurable entries (documents, terminal, …) */}
      <div className="flex flex-col items-center gap-1">
        {topItems.map((item) => renderEntry(item.id))}
      </div>

      {/* Bottom: settings (pinned) */}
      {settingsItem && (
        <div className="flex flex-col items-center gap-1">
          {renderEntry('settings')}
        </div>
      )}
    </div>
  );
}
