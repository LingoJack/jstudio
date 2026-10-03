/**
 * LeftPanelColumn — the left column when the outline docks left
 * (settings > general > 文档大纲位置 = 左侧).
 *
 * Replaces the standalone DocumentSidebar in App's main row. Structure:
 *   - top row (mt-9, clears the glass title bar): sliding SegmentedToggle
 *     between 目录树 (folder tree) and 文档大纲 (document outline), or a
 *     compact expand button while the embedded tree is collapsed (a full
 *     toggle row would otherwise widen the 48px collapsed rail column).
 *   - body: the selected panel. Width is content-driven (no explicit width
 *     here, NO overflow-hidden) so the sidebar's hover-overlay negative
 *     margin trick keeps working — hover expansion overlays the editor
 *     without reflowing it.
 *
 * The outline mode renders only a slot div; DocumentPanel portals its
 * SectionOutline into it via LeftOutlineSlotContext (it owns the editor
 * refs and staticBlocks).
 */

import { useState } from 'react';
import { FolderTree, List, PanelLeftOpen } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { SegmentedToggle } from '../ui/SegmentedToggle';
import DocumentSidebar from '../documents/DocumentSidebar';
import SidebarHeaderButtons from '../documents/SidebarHeaderButtons';
import { OUTLINE_WIDTH } from '../editor/sectionEditor/SectionOutline';

export default function LeftPanelColumn({
  onSlotElChange,
}: {
  onSlotElChange: (el: HTMLDivElement | null) => void;
}) {
  const { t } = useI18n();
  const leftPanelTab = useStore((s) => s.leftPanelTab);
  const setLeftPanelTab = useStore((s) => s.setLeftPanelTab);
  const setSidebarPinMode = useStore((s) => s.setSidebarPinMode);
  const sidebarPinModeBeforeCollapse = useStore((s) => s.sidebarPinModeBeforeCollapse);
  // Reported by the embedded DocumentSidebar (all pin modes): while the
  // tree is collapsed to its rail, the toggle row shrinks to one icon so
  // the column keeps the rail's 48px width instead of a wide empty strip.
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  const showCompactRow = leftPanelTab === 'tree' && treeCollapsed;

  return (
    <div className="shrink-0 flex flex-col relative z-30 -mt-9 h-[calc(100%+2.25rem)] bg-[var(--vscode-sideBar-background)]">
      {/* Version row — topmost, below the glass title bar. Identity up here,
          functionality in the row below (user's layout call). Hidden while
          the tree is collapsed (the column is a 48px rail then). */}
      {!showCompactRow && (
        <div className="mt-9 h-9 shrink-0 flex items-center px-3">
          <span className="text-[11px] text-[var(--vscode-descriptionForeground)] opacity-70 truncate">
            JStudio v{__APP_VERSION__}{import.meta.env.DEV ? " · dev" : ""}
          </span>
        </div>
      )}

      {/* Toggle row — 目录树/文档大纲 switch; when the tree tab is active the
          sidebar header actions (search / collapse / more) share this row so
          all functionality sits together below the version. */}
      {showCompactRow ? (
        <div className="mt-[52px] h-9 shrink-0 flex items-center px-2">
          <button
            onClick={() => setSidebarPinMode(sidebarPinModeBeforeCollapse)}
            title={t('titlebar.expandSidebar')}
            className="p-1.5 rounded-md text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="h-9 shrink-0 flex items-center px-3 gap-2">
          <SegmentedToggle
            compact
            options={[
              { value: 'tree', label: t('outline.tabTree'), icon: FolderTree },
              {
                value: 'outline',
                label: t('outline.tabOutline'),
                icon: List,
              },
            ]}
            value={leftPanelTab}
            onChange={setLeftPanelTab}
          />
          <div className="flex-1" />
          <SidebarHeaderButtons />
        </div>
      )}

      {/* Body — content-driven width; overflow must stay visible for the
          sidebar's hover-overlay negative margin. */}
      <div className="flex-1 min-h-0 flex">
        {leftPanelTab === 'tree' ? (
          <DocumentSidebar
            embedded
            onCollapsedChange={setTreeCollapsed}
          />
        ) : (
          <div
            ref={onSlotElChange}
            className="h-full shrink-0"
            style={{ width: OUTLINE_WIDTH }}
          />
        )}
      </div>
    </div>
  );
}
