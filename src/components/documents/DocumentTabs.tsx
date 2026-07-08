import { useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { createDocumentWindow } from '../../lib/windows/documentDetach';
import { X, FileText, ExternalLink } from 'lucide-react';
import { MenuList, MenuItem, MenuDivider } from '../ui/MenuList';
import TabBar, { type TabItem } from '../ui/TabBar';
import type { UnifiedTab } from '../../store/workspaceSlice';

/**
 * DocumentTabs — tab bar for document tabs only.
 *
 * Terminal tabs have their own tab bar inside TerminalPanel/TerminalTabs.
 * Both share the same workspace state (workspaceSlice), so the global
 * cycle shortcut (Cmd+Option+←/→) can jump between document and terminal
 * tabs.
 *
 * Features:
 *   - Click tab → switch to that document
 *   - Close button (X) on each tab (hidden when only 1 remains)
 *   - Right-click → context menu (Detach / Close / Close Others)
 *   - Drag a tab outside → tear off into a new OS window
 *   - `+` button → new document
 *   - Apple-style sliding indicator + ripple effect on `+`
 */
export default function DocumentTabs() {
  const { t } = useI18n();
  const allTabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);
  const closeOtherTabs = useStore((s) => s.closeOtherTabs);
  const docList = useStore((s) => s.docList);
  const createDocument = useStore((s) => s.createDocument);
  const tabBarGlassOpacity = useStore((s) => s.tabBarGlassOpacity);

  // Filter to document tabs only.
  const docTabs = allTabs.filter((tab) => tab.kind === 'document');

  // ── Resolve document title ───────────────────────────────────────
  const getDocTitle = useCallback(
    (tab: UnifiedTab): string => {
      const meta = docList.find((d) => d.id === tab.docId);
      return meta?.title || t('doclist.untitled');
    },
    [docList, t],
  );

  // ── Map UnifiedTab → TabItem ─────────────────────────────────────
  const tabItems: TabItem[] = docTabs.map((tab) => ({
    id: tab.id,
    title: getDocTitle(tab),
    icon: <FileText className="w-4 h-4 shrink-0 opacity-70" />,
    isActive: tab.id === activeTabId,
    canClose: allTabs.length > 1,
    canDrag: allTabs.length > 1,
  }));

  // ── Detach handler ───────────────────────────────────────────────
  const handleDetach = useCallback((tabId: string) => {
    const tab = allTabs.find((t) => t.id === tabId);
    if (tab?.docId) createDocumentWindow(tab.docId, tab.id);
  }, [allTabs]);

  // ── Context menu renderer ───────────────────────────────────────
  const renderContextMenu = useCallback(
    (tabId: string, x: number, y: number, close: () => void) => {
      const tab = allTabs.find((t) => t.id === tabId);
      return (
        <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
          {allTabs.length > 1 && tab?.docId && (
            <>
              <MenuItem
                icon={<ExternalLink className="w-4 h-4" />}
                onClick={() => {
                  createDocumentWindow(tab.docId!, tabId);
                  close();
                }}
              >
                {t('workspace.detachToWindow')}
              </MenuItem>
              <MenuDivider />
            </>
          )}
          <MenuItem
            icon={<X className="w-4 h-4" />}
            onClick={() => {
              closeTab(tabId);
              close();
            }}
          >
            {t('workspace.closeTab')}
          </MenuItem>
          {docTabs.length > 1 && (
            <MenuItem
              onClick={() => {
                closeOtherTabs(tabId);
                close();
              }}
            >
              {t('workspace.closeOthers')}
            </MenuItem>
          )}
        </MenuList>
      );
    },
    [allTabs, docTabs, closeTab, closeOtherTabs, t]
  );

  // Don't render if there are no document tabs.
  if (docTabs.length === 0) return null;

  return (
    <TabBar
      tabs={tabItems}
      activeTabId={activeTabId}
      onTabClick={setActiveTab}
      onTabClose={closeTab}
      onNew={createDocument}
      onDetach={handleDetach}
      renderContextMenu={renderContextMenu}
      rippleColor="rgba(255,255,255,0.25)"
      glassOpacity={tabBarGlassOpacity}
    />
  );
}
