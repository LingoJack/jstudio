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

/** Height of the native chrome overlay (address capsule strip) for the
 *  inline panel — matches the `h-9` title-bar row in AppTitleBar. */
const STRIP_HEIGHT = 36;

/** Tabs still on the new-tab placeholder — their native webview stays parked. */
function isBlankUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u === '' || u === 'about:blank';
}

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
  /**
   * Inline panel only: transparent chrome overlay (address capsule strip).
   * The page views cover ALL React DOM (native children stack above the
   * window's own webContents), so the title-bar capsule can't stay in React
   * once a page is loaded — it lives in this always-on-top transparent view
   * instead, floating over the full-bleed page content.
   */
  private chromeView: WebContentsView | null = null;
  private onChanged: (label: string, state: TabsState) => void;
  private onEmpty: (label: string) => void;

  constructor(
    label: string,
    host: BrowserWindow,
    isInline: boolean,
    onChanged: (label: string, state: TabsState) => void,
    onEmpty: (label: string) => void,
    chromeView?: WebContentsView,
  ) {
    this.label = label;
    this.host = host;
    this.isInline = isInline;
    this.onChanged = onChanged;
    this.onEmpty = onEmpty;
    this.chromeView = chromeView ?? null;
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
    // 'closed' fires after the host is destroyed; contentView access would throw.
    if (this.host.isDestroyed()) return;
    const rect = this.contentRect();
    const active = this.tabs.find((t) => t.id === this.activeTabId);
    // A blank active tab parks its webview (detached) so the React start
    // page underneath stays visible — BrowserPanel renders BrowserStartPage
    // for exactly this state (parity with the old Tauri link_tabs.rs).
    const activeIsBlank = !!active && isBlankUrl(active.url);
    for (const tab of this.tabs) {
      const shouldShow =
        tab === active && rect !== null && this.isVisible() && !activeIsBlank;
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
    this.layoutChrome();
  }

  /**
   * Position the chrome overlay and keep it the TOP-most child — page views
   * are appended on addTab and would otherwise bury it.
   */
  private layoutChrome(): void {
    const chrome = this.chromeView;
    if (!chrome || this.host.isDestroyed()) return;
    const children = this.host.contentView.children;
    const child = children.includes(chrome);
    if (this.isVisible()) {
      if (!child || children[children.length - 1] !== chrome) {
        if (child) this.host.contentView.removeChildView(chrome);
        this.host.contentView.addChildView(chrome);
      }
      const [w] = this.host.getContentSize();
      chrome.setBounds({ x: 0, y: 0, width: Math.max(1, w), height: STRIP_HEIGHT });
    } else if (child) {
      this.host.contentView.removeChildView(chrome);
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
    // Host window may already be destroyed (TabsManager.destroy runs on the
    // 'closed' event, which fires post-destruction) — every native accessor
    // below would throw "Object has been destroyed".
    if (!this.host.isDestroyed()) {
      if (this.host.contentView.children.includes(tab.view)) {
        this.host.contentView.removeChildView(tab.view);
      }
    }
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
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
    // A parked blank tab must re-attach its webview on first navigation.
    this.layout();
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
    if (this.chromeView) {
      if (
        !this.host.isDestroyed() &&
        this.host.contentView.children.includes(this.chromeView)
      ) {
        this.host.contentView.removeChildView(this.chromeView);
      }
      if (!this.chromeView.webContents.isDestroyed()) {
        this.chromeView.webContents.close();
      }
      this.chromeView = null;
    }
  }
}
