/**
 * useCloseOnCmdW — close a child window on the native "Close Tab" menu command.
 *
 * macOS routes Cmd+W to the global "app.closeTab" menu item, which the Rust
 * side forwards to the *focused* window as a `native-command` event. The main
 * window handles it via ShortcutManager (close tab / close window). Child
 * windows that don't run ShortcutManager (preview, diagram, terminal,
 * link-preview-tabs, command-palette) use this hook so Cmd+W closes them
 * instead of being ignored — or, before the lib.rs focus-tracking fix, closing
 * the main window by mistake.
 *
 * Only `app.closeTab` is handled; other native commands are left to whichever
 * window cares about them.
 */
import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function useCloseOnCmdW(): void {
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<string>('native-command', (event) => {
      if (event.payload !== 'app.closeTab') return;
      // close() triggers CloseRequested; lib.rs lets child windows close
      // directly (only the main window is intercepted), so this proceeds.
      // For the diagram window this also fires its beforeunload safety net.
      getCurrentWindow().close().catch((err) => {
        console.error('[useCloseOnCmdW] Failed to close window:', err);
      });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);
}
