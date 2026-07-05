/**
 * Native Menu Setup — macOS keyboard event interception.
 *
 * On macOS WKWebView, certain keyboard shortcuts like `Cmd+W`, `Cmd+Q`, `Cmd+C`,
 * `Cmd+V` are intercepted by the native layer before reaching JavaScript. The
 * workaround is to register native menu items with the same accelerators — WebKit
 * routes the event to the menu instead of handling it natively.
 *
 * This module creates:
 *   - "Edit" menu: Copy, Cut, Paste, Select All (standard edit commands)
 *   - "File" menu: Quit (Cmd+Q)
 *   - "Window" menu: Close Tab (Cmd+W)
 *
 * For Copy/Cut/Paste/SelectAll, we use PredefinedMenuItem which invokes the
 * browser's native edit actions automatically (WebKit knows to route these to
 * the focused contentEditable / input element).
 *
 * For Quit, we use PredefinedMenuItem which calls app.quit() natively.
 *
 * For Close Tab, we emit a Tauri event that the frontend listens for.
 */
import { Menu, Submenu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { emit } from '@tauri-apps/api/event';

/** Event name emitted when the native "Close Tab" menu item is triggered. */
export const NATIVE_CLOSE_TAB_EVENT = 'native-menu-close-tab';

/**
 * Initialize the native app menu with Edit, File, and Window submenus.
 *
 * Platform-specific:
 * - macOS: Creates menus in the global menubar to intercept Cmd shortcuts.
 * - Windows/Linux: No effect (WebView2 doesn't intercept Ctrl shortcuts the same way).
 */
export async function setupNativeMenu(): Promise<void> {
  try {
    // ── Edit Menu (standard editing commands) ──
    // PredefinedMenuItem automatically gets the system default accelerator
    // (Cmd+C, Cmd+X, Cmd+V, Cmd+A on macOS) and invokes the native edit action.
    const copyItem = await PredefinedMenuItem.new({ item: 'Copy' });
    const cutItem = await PredefinedMenuItem.new({ item: 'Cut' });
    const pasteItem = await PredefinedMenuItem.new({ item: 'Paste' });
    const selectAllItem = await PredefinedMenuItem.new({ item: 'SelectAll' });

    const editMenu = await Submenu.new({
      id: 'edit',
      text: 'Edit',
      items: [copyItem, cutItem, pasteItem, selectAllItem],
    });

    // ── File Menu (Quit) ──
    // PredefinedMenuItem 'Quit' calls app.quit() natively with Cmd+Q accelerator.
    const quitItem = await PredefinedMenuItem.new({ item: 'Quit' });

    const fileMenu = await Submenu.new({
      id: 'file',
      text: 'File',
      items: [quitItem],
    });

    // ── Window Menu (Close Tab) ──
    // Custom action: emit event to frontend for closeTab handling.
    const closeTabItem = await MenuItem.new({
      id: 'close-tab',
      text: 'Close Tab',
      accelerator: 'CommandOrControl+W',
      action: async () => {
        await emit(NATIVE_CLOSE_TAB_EVENT);
      },
    });

    const windowMenu = await Submenu.new({
      id: 'window',
      text: 'Window',
      items: [closeTabItem],
    });

    // ── Assemble and set as AppMenu ──
    // The order follows macOS convention: File, Edit, Window.
    const menu = await Menu.new({
      id: 'main-menu',
      items: [fileMenu, editMenu, windowMenu],
    });

    await menu.setAsAppMenu();
  } catch (err) {
    console.error('[nativeMenu] Failed to setup native menu:', err);
  }
}