/**
 * browserTabs.ts — tabbed browsing via WebContentsView (replaces
 * src-tauri/src/commands/link_tabs.rs, which relied on Tauri's unstable
 * multi-webview API).
 *
 * Two host kinds share one TabsManager implementation:
 *   - "main"  → the inline browser panel: content views attach to the MAIN
 *     window, positioned by the React-reported BrowserPanelRect.
 *   - "link-preview-tabs-N" → standalone windows: host window renders the
 *     React tab strip (?window=link-preview-tabs), content views attach
 *     below the 90px UI strip.
 *
 * New-window requests (target=_blank / window.open) become new tabs in the
 * same manager — matching the old WKUIDelegate on_new_window behavior.
 */

import { BrowserWindow, WebContentsView } from 'electron';

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  loading: boolean;
}

export interface TabsState {
  tabs: TabInfo[];
  activeTabId: string | null;
}

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Height of the React chrome (tab strip + address bar) in standalone windows. */
const UI_HEIGHT = 90;

let tabCounter = 1;

interface Tab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  view: WebContentsView;
}

export class TabsManager {
  readonly label: string;
  private host: BrowserWindow;
  private isInline: boolean;
  private tabs: Tab[] = [];
  private activeTabId: string | null = null;
  /** Inline panel only: last rect reported by React; visibility flag. */
  private rect: PanelRect | null = null;
  private visible = false;
  private onChanged: (label: string, state: TabsState) => void;
  private onEmpty: (label: string) => void;

  constructor(
    label: string,
    host: BrowserWindow,
    isInline: boolean,
    onChanged: (label: string, state: TabsState) => void,
    onEmpty: (label: string) => void,
  ) {
    this.label = label;
    this.host = host;
    this.isInline = isInline;
    this.onChanged = onChanged;
    this.onEmpty = onEmpty;
    if (!isInline) {
      host.on('resize', () => this.layout());
    }
  }

  // ── state ──

  state(): TabsState {
    return {
      tabs: this.tabs.map(({ id, url, title, loading }) => ({ id, url, title, loading })),
      activeTabId: this.activeTabId,
    };
  }

  isVisible(): boolean {
    return this.isInline ? this.visible : true;
  }

  private emitChanged(): void {
    this.onChanged(this.label, this.state());
    if (this.isInline && this.tabs.length === 0) this.onEmpty(this.label);
  }

  // ── geometry ──

  private contentRect(): PanelRect | null {
    if (this.isInline) return this.rect;
    const [w, h] = this.host.getContentSize();
    return { x: 0, y: UI_HEIGHT, width: w, height: Math.max(1, h - UI_HEIGHT) };
  }

  layout(): void {
    const rect = this.contentRect();
    const active = this.tabs.find((t) => t.id === this.activeTabId);
    for (const tab of this.tabs) {
      const shouldShow = tab === active && rect !== null && this.isVisible();
      const child = this.host.contentView.children.includes(tab.view);
      if (shouldShow && rect) {
        if (!child) this.host.contentView.addChildView(tab.view);
        tab.view.setBounds({
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.max(1, Math.round(rect.width)),
          height: Math.max(1, Math.round(rect.height)),
        });
      } else if (child) {
        // Detached views keep their state (unlike display:none) — this is
        // both the inactive-tab and the hidden-panel case.
        this.host.contentView.removeChildView(tab.view);
      }
    }
  }

  /** Inline panel: React's ResizeObserver reports the webview area. */
  setRect(rect: PanelRect): void {
    this.rect = rect;
    this.layout();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.layout();
  }

  // ── tab ops ──

  addTab(url: string): TabInfo {
    const view = new WebContentsView({
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    const tab: Tab = {
      id: `tab-${tabCounter++}`,
      url,
      title: '',
      loading: false,
      view,
    };
    const wc = view.webContents;

    wc.on('did-start-loading', () => {
      tab.loading = true;
      this.emitChanged();
    });
    wc.on('did-stop-loading', () => {
      tab.loading = false;
      tab.url = wc.getURL() || tab.url;
      this.emitChanged();
    });
    wc.on('page-title-updated', (_e, title) => {
      tab.title = title;
      this.emitChanged();
    });
    const onNav = (_e: unknown, navUrl: string) => {
      tab.url = navUrl;
      this.emitChanged();
    };
    wc.on('did-navigate', onNav);
    wc.on('did-navigate-in-page', onNav);

    // target=_blank / window.open → new tab in the same manager.
    wc.setWindowOpenHandler(({ url: openUrl }) => {
      this.addTab(openUrl);
      return { action: 'deny' };
    });

    this.tabs.push(tab);
    this.activeTabId = tab.id;
    void wc.loadURL(url).catch(() => {});
    this.layout();
    this.emitChanged();
    return { id: tab.id, url: tab.url, title: tab.title, loading: tab.loading };
  }

  switchTab(tabId: string): void {
    if (!this.tabs.some((t) => t.id === tabId)) return;
    this.activeTabId = tabId;
    this.layout();
    this.emitChanged();
  }

  closeTab(tabId: string): void {
    const idx = this.tabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    const [tab] = this.tabs.splice(idx, 1);
    if (this.host.contentView.children.includes(tab.view)) {
      this.host.contentView.removeChildView(tab.view);
    }
    tab.view.webContents.close();
    if (this.activeTabId === tabId) {
      this.activeTabId = this.tabs[Math.min(idx, this.tabs.length - 1)]?.id ?? null;
    }
    this.layout();
    this.emitChanged();
  }

  closeActiveTab(): void {
    if (this.activeTabId) this.closeTab(this.activeTabId);
  }

  navigate(tabId: string, url: string): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.url = url;
    void tab.view.webContents.loadURL(url).catch(() => {});
    this.emitChanged();
  }

  refresh(tabId: string): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    tab?.view.webContents.reload();
  }

  selectAllInActive(): void {
    const tab = this.tabs.find((t) => t.id === this.activeTabId);
    tab?.view.webContents.selectAll();
  }

  hasTabs(): boolean {
    return this.tabs.length > 0;
  }

  destroy(): void {
    for (const tab of [...this.tabs]) this.closeTab(tab.id);
  }
}
