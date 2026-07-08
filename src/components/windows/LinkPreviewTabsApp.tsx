/**
 * LinkPreviewTabsApp — 链接预览窗口的浏览器式标签页 UI。
 *
 * 布局（仿浏览器）：
 *   ┌────────────────────────────────────────────────────┐
 *   │ [Tab1] [Tab2] [Tab3] [+]          ← tab strip 36px │
 *   ├────────────────────────────────────────────────────┤
 *   │ 🏠 [https://example.com        ] 🔄 ↗ ← address 38px│
 *   └────────────────────────────────────────────────────┘
 *   │                                                    │
 *   │  Content Webview (由 Rust 端管理，位于此 UI 下方)   │
 *   │                                                    │
 *
 * UI webview 高度 80px（tab strip + address bar），content webview
 * 从 Y=80 开始填充剩余空间（由 Rust 端 link_tabs.rs 控制）。
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Loader2, ExternalLink, RefreshCw, Home, Globe, Plus } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useWindowThemeSync } from '../../lib/windows/useWindowThemeSync';
import { useI18n } from '../../lib/core/i18n';
import { MenuList, MenuItem, MenuDivider } from '../ui/MenuList';

// ── Types ──────────────────────────────────────────────────────────────

interface TabInfo {
  id: string;
  url: string;
  title: string;
  loading: boolean;
}

interface TabsState {
  tabs: TabInfo[];
  active_tab_id: string | null;
}

// ── Main Component ─────────────────────────────────────────────────────

export default function LinkPreviewTabsApp() {
  // 从 URL 参数获取窗口标签
  const [windowLabel] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('windowLabel');
  });
  const [state, setState] = useState<TabsState>({ tabs: [], active_tab_id: null });
  const [addressBarUrl, setAddressBarUrl] = useState('');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  // Sync theme with main window (includes app theme colors)
  useWindowThemeSync();

  // 初始化：获取标签列表
  useEffect(() => {
    if (!windowLabel) return;
    invoke<TabsState>('get_link_preview_tabs_state', { windowLabel })
      .then(setState)
      .catch(console.error);
  }, [windowLabel]);

  // 监听 Rust 端事件 — 统一通过 tabs-updated 同步全量状态
  useEffect(() => {
    if (!windowLabel) return;

    const unlistenTabsUpdate = listen<TabsState>('link-preview:tabs-updated', (event) => {
      setState(event.payload);
    });

    return () => {
      unlistenTabsUpdate.then((f) => f());
    };
  }, [windowLabel]);

  // 同步地址栏显示当前活动标签的 URL（about:blank 显示为空）
  useEffect(() => {
    const activeTab = state.tabs.find((t) => t.id === state.active_tab_id);
    const url = activeTab?.url ?? '';
    setAddressBarUrl(url === 'about:blank' ? '' : url);
  }, [state.active_tab_id, state.tabs]);

  // ── Actions ───────────────────────────────────────────────────────────

  const switchTab = useCallback((tabId: string) => {
    if (!windowLabel) return;
    invoke('switch_link_preview_tab', { windowLabel, tabId }).catch(console.error);
  }, [windowLabel]);

  const closeTab = useCallback((tabId: string) => {
    if (!windowLabel) return;
    invoke('close_link_preview_tab', { windowLabel, tabId }).catch(console.error);
  }, [windowLabel]);

  const addNewTab = useCallback(() => {
    if (!windowLabel) return;
    invoke('add_link_preview_tab', { windowLabel, url: 'about:blank' }).catch(console.error);
  }, [windowLabel]);

  const navigateToUrl = useCallback((url: string) => {
    if (!url.trim() || !windowLabel) return;

    // URL 规范化
    let normalizedUrl = url.trim();
    if (
      !normalizedUrl.startsWith('http://') &&
      !normalizedUrl.startsWith('https://') &&
      !normalizedUrl.startsWith('about:')
    ) {
      // 如果看起来像域名（含点），加 https://；否则当作搜索
      if (normalizedUrl.includes('.') && !normalizedUrl.includes(' ')) {
        normalizedUrl = 'https://' + normalizedUrl;
      } else {
        normalizedUrl = 'https://www.google.com/search?q=' + encodeURIComponent(normalizedUrl);
      }
    }

    const activeTab = state.tabs.find((t) => t.id === state.active_tab_id);
    if (activeTab) {
      setIsLoadingUrl(true);
      invoke('navigate_link_preview_tab', { windowLabel, tabId: activeTab.id, url: normalizedUrl })
        .catch(console.error)
        .finally(() => setIsLoadingUrl(false));
    } else {
      setIsLoadingUrl(true);
      invoke('add_link_preview_tab', { windowLabel, url: normalizedUrl })
        .catch(console.error)
        .finally(() => setIsLoadingUrl(false));
    }
  }, [windowLabel, state.tabs, state.active_tab_id]);

  const refreshTab = useCallback(() => {
    if (!windowLabel) return;
    const activeTab = state.tabs.find((t) => t.id === state.active_tab_id);
    if (activeTab) {
      invoke('refresh_link_preview_tab', { windowLabel, tabId: activeTab.id }).catch(console.error);
    }
  }, [windowLabel, state.tabs, state.active_tab_id]);

  const openInBrowser = useCallback(() => {
    const activeTab = state.tabs.find((t) => t.id === state.active_tab_id);
    if (activeTab) {
      invoke('open_url_in_browser', { url: activeTab.url }).catch(console.error);
    }
  }, [state.tabs, state.active_tab_id]);

  const handleAddressKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      navigateToUrl(addressBarUrl);
    } else if (e.key === 'Escape') {
      const activeTab = state.tabs.find((t) => t.id === state.active_tab_id);
      const url = activeTab?.url ?? '';
      setAddressBarUrl(url === 'about:blank' ? '' : url);
      addressInputRef.current?.blur();
    }
  }, [addressBarUrl, navigateToUrl, state.tabs]);

  // ── Context menu ─────────────────────────────────────────────────────

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    requestAnimationFrame(() => window.addEventListener('click', handler));
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  const activeTab = state.tabs.find((t) => t.id === state.active_tab_id);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="link-preview-root">
      {/* ── Tab strip (browser-style, edge-to-edge) ── */}
      <div className="link-preview-tab-strip">
        <div className="link-preview-tabs-scroll">
          {state.tabs.map((tab) => {
            const isActive = tab.id === state.active_tab_id;
            const canClose = state.tabs.length > 1;
            return (
              <div
                key={tab.id}
                className={`link-preview-tab ${isActive ? 'link-preview-tab-active' : ''}`}
                onClick={() => switchTab(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                }}
                title={tab.title || tab.url}
              >
                <span className="link-preview-tab-icon">
                  {tab.loading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Globe size={13} />
                  )}
                </span>
                <span className="link-preview-tab-title">
                  {tab.url === 'about:blank' ? 'New Tab' : (tab.title || tab.url || 'New Tab')}
                </span>
                {canClose && (
                  <button
                    className="link-preview-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* New tab button */}
        <button
          className="link-preview-tab-new"
          onClick={addNewTab}
          title={t('linkPreview.newTab')}
        >
          <Plus size={15} />
        </button>
      </div>

      {/* ── Address bar + toolbar ── */}
      <div className="link-preview-address-bar">
        <button
          type="button"
          className="link-preview-toolbar-btn"
          onClick={() => navigateToUrl('https://www.google.com')}
          title={t('linkPreview.home')}
        >
          <Home size={14} />
        </button>

        <input
          ref={addressInputRef}
          type="text"
          className="link-preview-address-input"
          value={addressBarUrl}
          onChange={(e) => setAddressBarUrl(e.target.value)}
          onKeyDown={handleAddressKeyDown}
          placeholder={t('linkPreview.urlPlaceholder')}
          disabled={isLoadingUrl}
          onFocus={(e) => e.target.select()}
        />

        {isLoadingUrl && (
          <Loader2 size={14} className="link-preview-address-loading animate-spin" />
        )}

        <button
          type="button"
          className="link-preview-toolbar-btn"
          onClick={refreshTab}
          disabled={!activeTab}
          title={t('linkPreview.refresh')}
        >
          <RefreshCw size={14} />
        </button>

        <button
          type="button"
          className="link-preview-toolbar-btn"
          onClick={openInBrowser}
          disabled={!activeTab}
          title={t('linkPreview.openBrowser')}
        >
          <ExternalLink size={14} />
        </button>
      </div>

      {/* ── Context menu ── */}
      {contextMenu && (
        <MenuList x={contextMenu.x} y={contextMenu.y} onClick={(e) => e.stopPropagation()}>
          <MenuItem
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={() => {
              if (windowLabel) {
                invoke('refresh_link_preview_tab', { windowLabel, tabId: contextMenu.tabId }).catch(console.error);
              }
              setContextMenu(null);
            }}
          >
            {t('linkPreview.refresh')}
          </MenuItem>

          <MenuItem
            icon={<ExternalLink className="w-4 h-4" />}
            onClick={() => {
              const tab = state.tabs.find((t) => t.id === contextMenu.tabId);
              if (tab) {
                invoke('open_url_in_browser', { url: tab.url }).catch(console.error);
              }
              setContextMenu(null);
            }}
          >
            {t('linkPreview.openBrowser')}
          </MenuItem>

          {state.tabs.length > 1 && <MenuDivider />}

          {state.tabs.length > 1 && (
            <MenuItem
              variant="danger"
              icon={<X className="w-4 h-4" />}
              onClick={() => {
                closeTab(contextMenu.tabId);
                setContextMenu(null);
              }}
            >
              {t('linkPreview.closeTab')}
            </MenuItem>
          )}
        </MenuList>
      )}
    </div>
  );
}
