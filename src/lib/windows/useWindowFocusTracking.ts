/**
 * useWindowFocusTracking — proactively report this window's label to the
 * Rust-side `FocusedWindow` state whenever the OS window gains focus.
 *
 * Why: Tauri's `WindowEvent::Focused` is unreliable for child webview
 * windows (see menu.rs `on_menu_event` comment). Native menu commands
 * (Cmd+W, Cmd+T, etc.) route to whichever window `FocusedWindow`
 * currently names; if the event never fires for a child window, the
 * state stays on "main" and Cmd+W pressed inside a diagram/preview/
 * terminal child window gets misrouted to the main window.
 *
 * How: each window (main + all child window types) mounts this hook
 * once at the root. On `window` `focus` we call `ipc.reportWindowFocus`
 * with `getCurrentWindow().label`. The browser engine fires `focus`
 * reliably when the OS window becomes key, bypassing the Tauri bug.
 *
 * We do NOT clear the state on `blur` — the next window to gain focus
 * overwrites it. When the app loses focus entirely the state stays at
 * the last-focused window, which is harmless because native menu
 * commands only fire when some window has key status (and thus has
 * already reported itself).
 */
import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ipc } from '../core/ipc';

export function useWindowFocusTracking(): void {
  useEffect(() => {
    const label = getCurrentWindow().label;
    const report = () => {
      ipc.reportWindowFocus(label).catch(() => {
        /* best-effort; failures don't matter — the next focus retries */
      });
    };
    // Report once on mount so a freshly-created window is tracked even
    // before its first focus event fires (Tauri sometimes delays the
    // initial focus event for child webviews).
    report();
    window.addEventListener('focus', report);
    return () => window.removeEventListener('focus', report);
  }, []);
}
