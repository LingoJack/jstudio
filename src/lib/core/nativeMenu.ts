/**
 * Native Menu Setup — macOS keyboard event interception.
 *
 * On macOS WKWebView, certain keyboard shortcuts like `Cmd+W` are intercepted
 * by the native layer before reaching JavaScript. The workaround is to register
 * a native menu item with the same accelerator — WebKit routes the event to the
 * menu instead of closing the window directly.
 *
 * This module creates a minimal "Window" menu with a "Close Tab" item bound to
 * `Cmd+W`. When triggered, it emits a Tauri event that the frontend listens for
 * and executes the close-tab action.
 */
import { Menu, Submenu, MenuItem } from '@tauri-apps/api/menu';
import { emit } from '@tauri-apps/api/event';

/** Event name emitted when the native "Close Tab" menu item is triggered. */
export const NATIVE_CLOSE_TAB_EVENT = 'native-menu-close-tab';

/**
 * Initialize the native app menu with a "Window" submenu containing "Close Tab".
 *
 * Platform-specific:
 * - macOS: Creates a "Window" menu in the global menubar.
 * - Windows/Linux: No effect (WebView2 doesn't intercept `Ctrl+W` the same way).
 */
export async function setupNativeMenu(): Promise<void> {
  try {
    // Create the "Close Tab" menu item with Cmd+W accelerator.
    const closeTabItem = await MenuItem.new({
      id: 'close-tab',
      text: 'Close Tab',
      accelerator: 'CommandOrControl+W',
      action: async () => {
        // Emit event to frontend — App.tsx listens and executes closeTab.
        await emit(NATIVE_CLOSE_TAB_EVENT);
      },
    });

    // Create the "Window" submenu containing the close item.
    const windowMenu = await Submenu.new({
      id: 'window',
      text: 'Window',
      items: [closeTabItem],
    });

    // Create the main menu bar and attach the Window submenu.
    const menu = await Menu.new({
      id: 'main-menu',
      items: [windowMenu],
    });

    // Set as the app-wide menu bar on macOS.
    await menu.setAsAppMenu();
  } catch (err) {
    console.error('[nativeMenu] Failed to setup native menu:', err);
  }
}