/**
 * main.ts — Electron main process.
 *
 * Owns everything the Tauri shell used to own natively:
 *   - main window (hiddenInset, mirrors Overlay title bar) + child windows
 *   - macOS menu → `native-command` events to the focused window
 *   - `jstudio-asset://` protocol (replaces assetProtocol)
 *   - dialogs / clipboard / shell.openExternal / devtools
 *   - sidecar JSON-RPC bridge + unified 'jstudio-event' bus
 *
 * Window/menu/webview commands from the old `window.rs` are INTERCEPTED in
 * the `sidecar-invoke` handler (they never reach the Rust sidecar).
 */

import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import * as path from 'node:path';
import * as http from 'node:http';
import { Sidecar } from './sidecar';
import { setupMenu, setMenuAccelerator } from './menu';
import { registerAssetProtocol, handleAssetRequests } from './protocol';
import { registerOne, unregisterOne, unregisterAll, SHORTCUT_EVENT } from './globalShortcuts';
import { TabsManager, type PanelRect } from './browserTabs';
import { importChromeLoginState } from './chromeLogin';

// Vite dev server; overridable so a second dev instance can coexist with
// the Tauri shell's `make dev` (which owns 1420 with strictPort).
const DEV_URL = process.env.JSTUDIO_DEV_URL ?? 'http://127.0.0.1:1420';

// Electron's dev-only security audit warns on every page without a meta CSP
// — including every third-party site the embedded browser opens (most sites
// set CSP via response headers, which the audit doesn't inspect). Pure
// console spam for this app; packaged builds never show these warnings.
// Renderers inherit the env, so set it before any window exists.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// ── Window registry (label → BrowserWindow) ─────────────────────────────────
const windows = new Map<string, BrowserWindow>();
/** Currently-focused window label (menu commands route here). */
let focusedLabel = 'main';
/** Set when the renderer explicitly asks to close (close_window) — bypasses
 *  the main window's close-button interception for that one close. */
let mainCloseAllowed = false;

let sidecar: Sidecar | null = null;

// ── Browser tab managers (label → TabsManager) ──────────────────────────────
const tabsManagers = new Map<string, TabsManager>();
let linkPreviewCounter = 1;

function emitTabsChanged(label: string, state: unknown): void {
  const win = windows.get(label);
  if (win) sendTo(win, 'link-preview:tabs-updated', label, state);
}

function getTabsManager(label: string): TabsManager | null {
  return tabsManagers.get(label) ?? null;
}

/** Inline browser panel manager (host = main window, label "main"). */
function getOrCreateInlineManager(): TabsManager {
  let m = tabsManagers.get('main');
  if (!m) {
    const host = windows.get('main');
    if (!host) throw new Error('main window not ready');
    m = new TabsManager('main', host, true, emitTabsChanged, (label) => {
      const win = windows.get(label);
      if (win) sendTo(win, 'browser-panel:empty', label, null);
    });
    tabsManagers.set('main', m);
  }
  return m;
}

function isLinkPreviewLabel(label: string): boolean {
  return label.startsWith('link-preview-tabs-');
}

async function openLinkPreviewTabsWindow(url: string): Promise<string> {
  const label = `link-preview-tabs-${linkPreviewCounter++}`;
  await createChildWindow(label, {
    url: `index.html?window=link-preview-tabs&label=${encodeURIComponent(label)}`,
    width: 1100,
    height: 800,
    minWidth: 400,
    minHeight: 300,
    title: 'Link Preview',
  });
  const host = windows.get(label)!;
  const manager = new TabsManager(label, host, false, emitTabsChanged, () => {});
  tabsManagers.set(label, manager);
  manager.addTab(url);
  host.on('closed', () => {
    manager.destroy();
    tabsManagers.delete(label);
  });
  return label;
}

registerAssetProtocol(); // must run before app-ready

/** Send an event onto the unified bus of one window. */
function sendTo(win: BrowserWindow, event: string, label: string | undefined, payload: unknown) {
  if (!win.isDestroyed()) win.webContents.send('jstudio-event', event, label, payload);
}

/** Broadcast to every window (sender included — matches Tauri's emit). */
function broadcast(event: string, label: string | undefined, payload: unknown) {
  for (const win of windows.values()) sendTo(win, event, label, payload);
}

/** Route a native menu command to the focused window (Tauri on_menu_event). */
function routeNativeCommand(command: string) {
  // Link-preview windows handle Cmd+T / Cmd+W / Cmd+A natively on their tab
  // manager (mirrors menu.rs — routing native-command would double-fire in
  // the main window's ShortcutManager).
  if (isLinkPreviewLabel(focusedLabel)) {
    const manager = getTabsManager(focusedLabel);
    if (manager) {
      if (command === 'app.newTab') return void manager.addTab('about:blank');
      if (command === 'app.closeTab') {
        manager.closeActiveTab();
        if (!manager.hasTabs()) windows.get(focusedLabel)?.close();
        return;
      }
      if (command === 'app.selectAll') return void manager.selectAllInActive();
    }
  }

  // Inline browser panel visible in the main window: Cmd+T / Cmd+W act on
  // the browser tabs, not the editor's document tabs.
  if (focusedLabel === 'main') {
    const inline = getTabsManager('main');
    if (inline?.isVisible()) {
      if (command === 'app.newTab') return void inline.addTab('about:blank');
      if (command === 'app.closeTab') return void inline.closeActiveTab();
    }
  }

  // Cmd+Shift+V (paste plain text): set the JS flag first so the paste
  // handler strips formatting, then forward the native paste (menu.rs).
  if (command === 'app.pastePlainText') {
    const win = windows.get(focusedLabel) ?? windows.get('main');
    if (win) {
      void win.webContents
        .executeJavaScript('window.__setPlainTextPaste && window.__setPlainTextPaste();')
        .then(() => win.webContents.paste());
    }
    return;
  }

  // Toggle DevTools on the focused window (View menu, ⌥⌘I). F12 is wired
  // separately per-webContents below.
  if (command === 'app.devtools') {
    const win = windows.get(focusedLabel) ?? windows.get('main');
    if (win) {
      const wc = win.webContents;
      if (wc.isDevToolsOpened()) wc.closeDevTools();
      else wc.openDevTools({ mode: 'detach' });
    }
    return;
  }

  const win = windows.get(focusedLabel) ?? windows.get('main');
  if (win) sendTo(win, 'native-command', win === windows.get('main') ? undefined : focusedLabel, command);
}

function trackWindow(label: string, win: BrowserWindow): void {
  windows.set(label, win);
  win.on('focus', () => {
    focusedLabel = label;
    broadcast('window-focus-changed', label, { label, focused: true });
  });
  win.on('blur', () => {
    broadcast('window-focus-changed', label, { label, focused: false });
  });
  win.on('closed', () => {
    windows.delete(label);
    // Notify remaining windows (sender included — matches Tauri's emit).
    // The tauriShim maps this to WebviewWindow 'tauri://destroyed', which
    // e.g. the embedded diagram block listens on to re-enable its
    // maximize button after the detached editor closes.
    broadcast('window-closed', undefined, { label });
  });
}

/** Reverse lookup: which registered window owns this webContents? */
function labelOf(contents: Electron.WebContents): string {
  for (const [label, win] of windows) {
    if (win.webContents === contents) return label;
  }
  return 'main';
}

/** Probe the vite dev server; fall back to the built dist when offline. */
function devServerUp(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function loadApp(win: BrowserWindow, query = ''): Promise<void> {
  if (await devServerUp(DEV_URL)) {
    await win.loadURL(query ? `${DEV_URL}/?${query}` : DEV_URL);
  } else {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      search: query || undefined,
    });
  }
}

function webPrefs() {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
  };
}

async function createMainWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    // Mirrors tauri.conf.json's `titleBarStyle: Overlay` + hidden title:
    // content punches up to the window top, traffic lights float over it.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#1e1e1e',
    webPreferences: webPrefs(),
  });
  trackWindow('main', win);

  // Close-button interception (main window only): let the frontend decide
  // whether to close the current tab or the whole window — it calls
  // `close_window` when it really wants out.
  win.on('close', (e) => {
    if (mainCloseAllowed) return;
    e.preventDefault();
    sendTo(win, 'window-close-requested', undefined, null);
  });

  await loadApp(win);
}

// ── Child windows (detach / preview / palette) ──────────────────────────────

interface WindowCreateOptions {
  url?: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  title?: string;
  resizable?: boolean;
  decorations?: boolean;
  focus?: boolean;
  center?: boolean;
  x?: number;
  y?: number;
  transparent?: boolean;
  alwaysOnTop?: boolean;
  skipTaskbar?: boolean;
}

async function createChildWindow(label: string, opts: WindowCreateOptions): Promise<void> {
  const existing = windows.get(label);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }

  // Content child windows share the main window's chrome-less look: keep
  // the native frame (traffic lights) but hide the title-bar strip via
  // hiddenInset — the renderer provides the drag region instead
  // (ChildWindowDragBar). The link-preview browser window keeps the full
  // native title bar: its top edge is fully interactive (glass tab strip,
  // see .link-preview-root notes in vscode-theme.css), leaving no room for
  // a drag region.
  const hideTitleBar = (opts.decorations ?? true) && !isLinkPreviewLabel(label);
  const win = new BrowserWindow({
    width: opts.width ?? 900,
    height: opts.height ?? 700,
    minWidth: opts.minWidth,
    minHeight: opts.minHeight,
    title: opts.title,
    resizable: opts.resizable ?? true,
    // Tauri `decorations: false` ↔ Electron `frame: false`.
    frame: opts.decorations ?? true,
    titleBarStyle: hideTitleBar ? 'hiddenInset' : undefined,
    trafficLightPosition: hideTitleBar ? { x: 12, y: 12 } : undefined,
    transparent: opts.transparent,
    alwaysOnTop: opts.alwaysOnTop,
    skipTaskbar: opts.skipTaskbar,
    x: opts.x,
    y: opts.y,
    show: false,
    webPreferences: webPrefs(),
  });
  trackWindow(label, win);

  if (opts.center ?? !opts.x) win.center();
  win.once('ready-to-show', () => {
    if (opts.focus !== false) {
      win.show();
      win.focus();
    } else {
      win.showInactive();
    }
  });

  // The `url` option is app-relative, e.g. '/?window=terminal&label=term-1'.
  const query = opts.url?.includes('?') ? opts.url.split('?')[1] : '';
  await loadApp(win, query);
}

// ── sidecar ─────────────────────────────────────────────────────────────────

// ── Graceful quit ───────────────────────────────────────────────────────────
// `app.exit()` alone skips will-quit handlers (sidecar would be orphaned),
// and killing the sidecar without notice orphans the user's PTY login
// shells. So: tell the sidecar to kill all PTYs (bounded wait), THEN stop
// it, then exit. mainCloseAllowed lets the main window's close interception
// pass through during teardown.
let quitting = false;

function gracefulQuit(): void {
  if (quitting) return;
  quitting = true;
  mainCloseAllowed = true;

  const finish = () => {
    unregisterAll();
    sidecar?.stop();
    app.exit(0);
  };

  if (!sidecar) return finish();
  Promise.race([
    sidecar.invoke('pty_kill_all').catch(() => {}),
    new Promise((r) => setTimeout(r, 800)),
  ]).then(finish);
}

/** window.rs / devtools methods are handled HERE, never forwarded to Rust. */
function handleMainOnly(
  method: string,
  params: unknown,
  sender: Electron.WebContents,
): { handled: boolean; result?: unknown } {
  const p = (params ?? {}) as Record<string, unknown>;
  switch (method) {
    case 'quit_app':
      gracefulQuit();
      return { handled: true, result: null };
    case 'close_window': {
      const win = BrowserWindow.fromWebContents(sender);
      if (win === windows.get('main')) mainCloseAllowed = true;
      win?.close();
      return { handled: true, result: null };
    }
    case 'open_devtools':
      sender.openDevTools({ mode: 'detach' });
      return { handled: true, result: null };
    case 'report_window_focus':
      if (typeof p.label === 'string') focusedLabel = p.label;
      return { handled: true, result: null };
    case 'set_native_menu_accelerator':
      if (typeof p.command === 'string' && typeof p.accelerator === 'string') {
        setMenuAccelerator(p.command, p.accelerator);
      }
      return { handled: true, result: null };
    case 'disable_text_interaction':
      // WKWebView-only (macOS Live Text). No-op on Chromium.
      return { handled: true, result: null };
    case 'register_global_shortcut':
      registerOne(p.shortcutStr as string, p.actionConfigJson, (payload) =>
        broadcast(SHORTCUT_EVENT, undefined, payload),
      );
      return { handled: true, result: null };
    case 'unregister_global_shortcut':
      unregisterOne(p.shortcutStr as string);
      return { handled: true, result: null };
    case 'unregister_all_global_shortcuts':
      unregisterAll();
      return { handled: true, result: null };

    // ── link preview / browser tabs (Electron-owned, replaces link_tabs.rs) ──
    case 'open_link_preview':
    case 'open_link_preview_with_tabs':
      return { handled: true, result: openLinkPreviewTabsWindow(p.url as string) };
    case 'open_or_focus_link_preview': {
      const existing = [...tabsManagers.keys()].find(isLinkPreviewLabel);
      if (existing) {
        const win = windows.get(existing);
        win?.show();
        win?.focus();
        getTabsManager(existing)?.addTab('about:blank');
        return { handled: true, result: existing };
      }
      return { handled: true, result: openLinkPreviewTabsWindow('about:blank') };
    }
    case 'get_link_preview_tabs_state':
      return {
        handled: true,
        result: getTabsManager(p.windowLabel as string)?.state() ?? { tabs: [], activeTabId: null },
      };
    case 'add_link_preview_tab': {
      const m = getTabsManager(p.windowLabel as string);
      if (!m) throw new Error(`no tabs manager for ${p.windowLabel}`);
      return { handled: true, result: m.addTab(p.url as string) };
    }
    case 'switch_link_preview_tab':
      getTabsManager(p.windowLabel as string)?.switchTab(p.tabId as string);
      return { handled: true, result: null };
    case 'close_link_preview_tab':
      getTabsManager(p.windowLabel as string)?.closeTab(p.tabId as string);
      return { handled: true, result: null };
    case 'navigate_link_preview_tab':
      getTabsManager(p.windowLabel as string)?.navigate(p.tabId as string, p.url as string);
      return { handled: true, result: null };
    case 'refresh_link_preview_tab':
      getTabsManager(p.windowLabel as string)?.refresh(p.tabId as string);
      return { handled: true, result: null };
    case 'open_url_in_browser':
      void shell.openExternal(p.url as string);
      return { handled: true, result: null };
    case 'get_current_window_label':
      return { handled: true, result: labelOf(sender) };
    case 'show_browser_panel': {
      const m = getOrCreateInlineManager();
      m.setVisible(true);
      if (!m.hasTabs()) m.addTab('about:blank');
      return { handled: true, result: null };
    }
    case 'hide_browser_panel':
      getTabsManager('main')?.setVisible(false);
      return { handled: true, result: null };
    case 'update_browser_panel_rect':
      getOrCreateInlineManager().setRect(p.rect as PanelRect);
      return { handled: true, result: null };
    case 'get_browser_panel_tabs_state':
      return { handled: true, result: getOrCreateInlineManager().state() };
    case 'select_all_in_active_browser_tab':
      getTabsManager('main')?.selectAllInActive();
      return { handled: true, result: null };
    case 'browser_go_back':
      getTabsManager('main')?.goBack();
      return { handled: true, result: null };
    case 'browser_go_forward':
      getTabsManager('main')?.goForward();
      return { handled: true, result: null };
    case 'import_chrome_login_state':
      // One-time Chrome login-state import into the default session, so the
      // inline browser (and AI navigation) reuses the user's Chrome logins.
      // Electron-side (Keychain + node:sqlite + crypto, see chromeLogin.ts);
      // resolves {imported, failed} or {error} with a readable message.
      return {
        handled: true,
        result: importChromeLoginState().catch((e) => ({
          error: String((e as Error)?.message ?? e),
        })),
      };

    default:
      return { handled: false };
  }
}

function wireSidecar(): void {
  const binary = Sidecar.binaryPath(app.getAppPath(), app.isPackaged, process.resourcesPath);
  sidecar = new Sidecar((event, label, payload) => {
    // P2: broadcast every notification; label-directed routing lands with
    // the detach windows in P3.
    broadcast(event, label, payload);
  });
  sidecar.start(binary);

  ipcMain.handle('sidecar-invoke', (e, method: string, params?: unknown) => {
    const local = handleMainOnly(method, params, e.sender);
    if (local.handled) return local.result;
    return sidecar!.invoke(method, params);
  });
}

// ── ipc handlers ────────────────────────────────────────────────────────────

// F12: toggle DevTools on whichever surface the key landed on (main renderer
// or a browser-panel tab view). Not a menu accelerator — macOS swallows F12
// as a media key unless "use F1/F2 as standard function keys" is enabled.
app.on('web-contents-created', (_event, wc) => {
  wc.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      if (wc.isDevToolsOpened()) wc.closeDevTools();
      else wc.openDevTools({ mode: 'detach' });
    }
  });
});

function wireIpc(): void {
  ipcMain.on('renderer-broadcast', (_e, event: string, payload: unknown) => {
    broadcast(event, undefined, payload);
  });

  ipcMain.handle('window-op', (_e, label: string, op: string) => {
    const win = windows.get(label);
    if (!win || win.isDestroyed()) return null;
    switch (op) {
      case 'close':
        win.close();
        return null;
      case 'show':
        win.show();
        return null;
      case 'hide':
        win.hide();
        return null;
      case 'focus':
        win.focus();
        return null;
      case 'isFocused':
        return win.isFocused();
      case 'isVisible':
        return win.isVisible();
      case 'destroy':
        win.destroy();
        return null;
      default:
        return null;
    }
  });

  ipcMain.handle('window-create', (_e, label: string, options: WindowCreateOptions) =>
    createChildWindow(label, options).then(() => null),
  );

  ipcMain.handle('window-get-by-label', (_e, label: string) => windows.has(label));

  ipcMain.handle('dialog-open', async (e, options: Electron.OpenDialogOptions) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showOpenDialog(win!, options ?? {});
    return r.canceled ? null : r.filePaths.length === 1 ? r.filePaths[0] : r.filePaths;
  });

  ipcMain.handle('dialog-save', async (e, options: Electron.SaveDialogOptions) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showSaveDialog(win!, options ?? {});
    return r.canceled ? null : r.filePath;
  });

  ipcMain.handle('clipboard-read-text', () => clipboard.readText());

  ipcMain.handle('clipboard-read-image', () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    return { width, height, rgba: img.getBitmap() };
  });

  ipcMain.handle('shell-open', (_e, url: string) => shell.openExternal(url));

  ipcMain.handle('open-devtools', (e) => {
    e.sender.openDevTools({ mode: 'detach' });
  });
}

// ── lifecycle ───────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  handleAssetRequests();
  setupMenu(routeNativeCommand);
  wireSidecar();
  wireIpc();

  // Self-test mode quits right after the echo — skip the window entirely.
  if (process.env.JSTUDIO_SIDECAR_SELFTEST !== '1') void createMainWindow();

  // Quit-flow self-test (dev tool): JSTUDIO_QUIT_SELFTEST=<ms> triggers
  // gracefulQuit() (the quit_app path) after the delay.
  const quitAfter = Number(process.env.JSTUDIO_QUIT_SELFTEST ?? 0);
  if (quitAfter > 0) setTimeout(gracefulQuit, quitAfter);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
  });

});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Any quit path that bypasses `quit_app` (Dock quit, Cmd+Q when the menu
// role ever changes) funnels into the same graceful teardown.
app.on('before-quit', (e) => {
  if (!quitting) {
    e.preventDefault();
    gracefulQuit();
  }
});

app.on('will-quit', () => {
  unregisterAll();
  sidecar?.stop();
});

// Transport self-test (dev tool): JSTUDIO_SIDECAR_SELFTEST=1 electron .
// invokes `echo` once and quits, so CI/CLI can verify the bridge.
if (process.env.JSTUDIO_SIDECAR_SELFTEST === '1') {
  app.whenReady().then(() => {
    sidecar!
      .invoke('echo', { selftest: true })
      .then((result) => {
        console.log('[selftest] sidecar echo ok:', JSON.stringify(result));
        app.exit(0);
      })
      .catch((err) => {
        console.error('[selftest] sidecar echo failed:', err);
        app.exit(1);
      });
  });
}
