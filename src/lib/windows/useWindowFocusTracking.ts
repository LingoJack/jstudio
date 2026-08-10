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
 * First-report robustness: a freshly created child webview may fire its
 * initial `focus` event *before* React mounts and registers the
 * listener. We therefore attempt the first report in a `useEffect`
 * (post-mount) and retry a couple of times in case the Tauri runtime
 * isn't ready to dispatch the IPC yet. Subsequent focus changes are
 * picked up by the `focus` event listener.
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

    // First-report retry loop. The Tauri runtime inside a freshly
    // created webview can take a few ticks to be ready to dispatch
    // IPC; if the very first report fails, retry a couple of times.
    let attempts = 0;
    const maxAttempts = 3;
    const firstReport = () => {
      ipc
        .reportWindowFocus(label)
        .then(() => {
          /* reported ok */
        })
        .catch(() => {
          attempts += 1;
          if (attempts < maxAttempts) {
            setTimeout(firstReport, 100);
          }
        });
    };
    // setTimeout(0) ensures we run after the current synchronous batch,
    // giving the Tauri runtime a chance to finish wiring up the webview.
    const timer = setTimeout(firstReport, 0);

    window.addEventListener('focus', report);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', report);
    };
  }, []);
}
