/**
 * exitConfirm — shared gate for app-exit confirmation.
 *
 * Used by the last-tab close path (App.tsx window-close-requested listener
 * + commandRegistry `app.closeTab`) and the Cmd+Q path (commandRegistry
 * `app.quit`). When the user has disabled `confirmOnExit` in General
 * settings, this resolves `true` immediately so the caller proceeds
 * without prompting.
 *
 * The dialog is the native Tauri confirm (tauri-plugin-dialog), which
 * blocks the webview event loop until the user responds — the intended
 * behavior for an exit gate.
 */
import { useStore } from '../../store/useStore';

export async function confirmExitIfEnabled(
  title: string,
  message: string,
  okLabel: string,
  cancelLabel: string,
): Promise<boolean> {
  if (!useStore.getState().confirmOnExit) return true;
  const { confirm } = await import('@tauri-apps/plugin-dialog');
  return confirm(message, { title, okLabel, cancelLabel });
}
