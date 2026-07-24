import { useCallback } from 'react';
import { Loader2, ExternalLink, RefreshCw, Globe, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { storage, type LinkPreviewTabInfo } from '../../lib/core/storage';
import { MenuList, MenuItem, MenuDivider } from '../ui/MenuList';
import TabBar, { type TabItem } from '../ui/TabBar';

/**
 * Browser window label used by the Rust backend to key the main window's
 * inline-browser tab manager (`TabManager` for `"main"` in link_tabs.rs).
 */
export const BROWSER_WINDOW_LABEL = 'main';

export interface BrowserTabsProps {
  tabs: LinkPreviewTabInfo[];
  activeTabId: string | null;
  /**
   * Explicit glass opacity, used by the standalone tab-bar overlay window
   * (which doesn't share the main window's hydrated zustand store). Falls
   * back to the global `tabBarGlassOpacity` setting when omitted.
   */
  glassOpacity?: number;
  /**
   * Explicit tab-bar position, used by the standalone tab-bar overlay
   * window. Falls back to the global `tabBarPosition` setting when omitted.
   */
  position?: 'top' | 'bottom';
}

/**
 * BrowserTabs — tab bar for the inline browser panel.
 *
 * Mirrors the structure of DocumentTabs / TerminalTabs: maps tab data to
 * `TabItem`s, owns the right-click context menu, and renders the shared
 * `TabBar` component with the global `tabBarPosition` / `tabBarGlassOpacity`
 * settings.
 *
 * Unlike DocumentTabs / TerminalTabs (which read global workspace state),
 * the browser tab list is panel-scoped — it arrives from the Rust backend
 * via `link-preview:tabs-updated` and is passed in by BrowserPanel as props.
 * Actions (switch / close / new / refresh) call the storage IPC layer
 * directly with the `"main"` window label.
 */
export default function BrowserTabs({
  tabs,
  activeTabId,
  glassOpacity,
  position,
}: BrowserTabsProps) {
  const { t } = useI18n();
  const storeGlassOpacity = useStore((s) => s.tabBarGlassOpacity);
  const storePosition = useStore((s) => s.tabBarPosition);
  const tabBarGlassOpacity = glassOpacity ?? storeGlassOpacity;
  const tabBarPosition = position ?? storePosition;

  // ── Actions (storage IPC, scoped to the main window's tab manager) ──

  const switchTab = useCallback((tabId: string) => {
    storage.switchLinkPreviewTab(BROWSER_WINDOW_LABEL, tabId).catch(console.error);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    storage.closeLinkPreviewTab(BROWSER_WINDOW_LABEL, tabId).catch(console.error);
  }, []);

  const addNewTab = useCallback(() => {
    storage.addLinkPreviewTab(BROWSER_WINDOW_LABEL, 'about:blank').catch(console.error);
  }, []);

  // ── Map LinkPreviewTabInfo → TabItem ──────────────────────────────

  const tabItems: TabItem[] = tabs.map((tab) => ({
    id: tab.id,
    title: tab.url === 'about:blank' ? 'New Tab' : tab.title || tab.url || 'New Tab',
    isActive: tab.id === activeTabId,
    icon: tab.loading ? (
      <Loader2 size={12} className="animate-spin" />
    ) : (
      <Globe size={12} />
    ),
    canClose: tabs.length > 1,
    canDrag: tabs.length > 1,
  }));

  // ── Context menu renderer ─────────────────────────────────────────

  const renderContextMenu = useCallback(
    (tabId: string, x: number, y: number, close: () => void) => {
      const tab = tabs.find((tb) => tb.id === tabId);
      return (
        <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
          <MenuItem
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={() => {
              storage.refreshLinkPreviewTab(BROWSER_WINDOW_LABEL, tabId).catch(console.error);
              close();
            }}
          >
            {t('linkPreview.refresh')}
          </MenuItem>

          <MenuItem
            icon={<ExternalLink className="w-4 h-4" />}
            onClick={() => {
              if (tab) storage.openUrlInBrowser(tab.url).catch(console.error);
              close();
            }}
          >
            {t('linkPreview.openBrowser')}
          </MenuItem>

          {tabs.length > 1 && <MenuDivider />}

          {tabs.length > 1 && (
            <MenuItem
              variant="danger"
              icon={<X className="w-4 h-4" />}
              onClick={() => {
                closeTab(tabId);
                close();
              }}
            >
              {t('linkPreview.closeTab')}
            </MenuItem>
          )}
        </MenuList>
      );
    },
    [tabs, closeTab, t],
  );

  return (
    <TabBar
      tabs={tabItems}
      activeTabId={activeTabId}
      onTabClick={switchTab}
      onTabClose={closeTab}
      onNew={addNewTab}
      renderContextMenu={renderContextMenu}
      rippleColor="rgba(255,255,255,0.2)"
      glassOpacity={tabBarGlassOpacity}
      position={tabBarPosition}
    />
  );
}
