/**
 * LinkPreviewTabsApp — 链接预览窗口的标签页 UI。
 *
 * 此组件渲染标签栏和地址栏，实际网页内容由 Rust 端通过
 * child webview 管理。前端通过 IPC 告知 Rust 切换/添加/关闭标签。
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Plus, Loader2, ExternalLink, RefreshCw, Home } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useWindowThemeSync } from '../../lib/windows/useWindowThemeSync';
import { useI18n } from '../../lib/core/i18n';

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
  const [windowLabel, setWindowLabel] = useState<string | null>(() => {
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

  // 监听 Rust 端事件
  useEffect(() => {
    const unlistenTabAdded = listen<TabInfo>('link-preview:tab-added', (event) => {
      setState((prev) => ({
        tabs: [...prev.tabs.filter(t => t.id !== event.payload.id), event.payload],
        active_tab_id: event.payload.id,
      }));
    });

    const unlistenTabsUpdate = listen<TabsState>('link-preview:tabs-updated', (event) => {
      setState(event.payload);
    });

    return () => {
      unlistenTabAdded.then((f) => f());
      unlistenTabsUpdate.then((f) => f());
    };
  }, []);

  // 同步地址栏显示当前活动标签的 URL
  useEffect(() => {
    const activeTab = state.tabs.find((t) => t.id === state.active_tab_id);
    setAddressBarUrl(activeTab?.url ?? '');
  }, [state.active_tab_id, state.tabs]);

  // ── Actions ───────────────────────────────────────────────────────────

  const switchTab = useCallback((tabId: string) => {
    if (!windowLabel) return;
    invoke('switch_link_preview_tab', { windowLabel, tabId }).catch(console.error);
    setState((prev) => ({ ...prev, active_tab_id: tabId }));
  }, [windowLabel]);

  const closeTab = useCallback((tabId: string) => {
    if (!windowLabel) return;
    invoke('close_link_preview_tab', { windowLabel, tabId }).catch(console.error);
    setState((prev) => {
      const newTabs = prev.tabs.filter((t) => t.id !== tabId);
      let newActiveId = prev.active_tab_id;
      if (prev.active_tab_id === tabId) {
        const idx = prev.tabs.findIndex((t) => t.id === tabId);
        newActiveId = newTabs[idx]?.id ?? newTabs[idx - 1]?.id ?? null;
        if (newActiveId && windowLabel) {
          invoke('switch_link_preview_tab', { windowLabel, tabId: newActiveId }).catch(console.error);
        }
      }
      return { tabs: newTabs, active_tab_id: newActiveId };
    });
  }, [windowLabel]);

  const addNewTab = useCallback(() => {
    if (!windowLabel) return;
    // 新标签默认打开空白页
    invoke('add_link_preview_tab', { windowLabel, url: 'about:blank' }).catch(console.error);
  }, [windowLabel]);

  const navigateToUrl = useCallback((url: string) => {
    if (!url.trim() || !windowLabel) return;
    
    // URL 规范化
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://') && !normalizedUrl.startsWith('about:')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    const activeTab = state.tabs.find((t) => t.id === state.active_tab_id);
    if (activeTab) {
      setIsLoadingUrl(true);
      invoke('navigate_link_preview_tab', { windowLabel, tabId: activeTab.id, url: normalizedUrl })
        .catch(console.error)
        .finally(() => setIsLoadingUrl(false));
    } else {
      // 没有活动标签，创建新标签
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
      setAddressBarUrl(activeTab?.url ?? '');
      addressInputRef.current?.blur();
    }
  }, [addressBarUrl, navigateToUrl, state.tabs]);

  // ── Render ────────────────────────────────────────────────────────────

  const activeTab = state.tabs.find((t) => t.id === state.active_tab_id);

  return (
    <div className="link-preview-tabs-root">
      {/* 标签栏 */}
      <div className="link-preview-tabs-bar">
        <div className="link-preview-tabs-list">
          {state.tabs.map((tab) => (
            <div
              key={tab.id}
              className={`link-preview-tab ${tab.id === state.active_tab_id ? 'active' : ''}`}
              onClick={() => switchTab(tab.id)}
              title={tab.url}
            >
              {tab.loading ? (
                <Loader2 size={14} className="link-preview-tab-loading animate-spin" />
              ) : (
                <span className="link-preview-tab-title">{tab.title || tab.url}</span>
              )}
              <button
                type="button"
                className="link-preview-tab-close"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                title={t('linkPreview.closeTab')}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="link-preview-add-tab"
            onClick={addNewTab}
            title={t('linkPreview.newTab')}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* 工具按钮 */}
        <div className="link-preview-toolbar">
          <button
            type="button"
            className="link-preview-toolbar-btn"
            onClick={refreshTab}
            disabled={!activeTab}
            title={t('linkPreview.refresh')}
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            className="link-preview-toolbar-btn"
            onClick={openInBrowser}
            disabled={!activeTab}
            title={t('linkPreview.openBrowser')}
          >
            <ExternalLink size={16} />
          </button>
        </div>
      </div>

      {/* 地址栏 */}
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
        />
        {isLoadingUrl && (
          <Loader2 size={14} className="link-preview-address-loading animate-spin" />
        )}
      </div>
    </div>
  );
}