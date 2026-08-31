/**
 * exitConfirm — shared gate for app-exit confirmation.
 *
 * Used by the last-tab close path (App.tsx window-close-requested listener
 * + commandRegistry `app.closeTab`) and the Cmd+Q path (commandRegistry
 * `app.quit`). When the user has disabled `confirmOnExit` in General
 * settings, this resolves `true` immediately so the caller proceeds
 * without prompting.
 *
 * The dialog is rendered in-app by `<ExitConfirmDialog />` (mounted once
 * in App.tsx) — replaces the native Tauri `confirm()` so the prompt
 * matches the app's VSCode-style dialog look. This module owns a tiny
 * Zustand store holding the dialog state; the Promise resolver is kept
 * in a module-level ref so the store state stays serializable. Callers
 * `await confirmExitIfEnabled(...)` while the dialog collects the
 * user's choice.
 */
import { create } from 'zustand';
import { useStore } from '../../store/useStore';

export interface ExitConfirmState {
  open: boolean;
  title: string;
  okLabel: string;
  cancelLabel: string;
}

const useExitConfirmStore = create<ExitConfirmState>(() => ({
  open: false,
  title: '',
  okLabel: '',
  cancelLabel: '',
}));

/** Module-level resolver — set when the dialog opens, cleared on close. */
let resolverRef: ((ok: boolean) => void) | undefined;

/**
 * Subscribe to the exit-confirm dialog state. Used by `<ExitConfirmDialog />`.
 */
export function useExitConfirm<T>(selector: (s: ExitConfirmState) => T): T {
  return useExitConfirmStore(selector);
}

/**
 * Show the exit-confirmation dialog (if enabled) and resolve with the
 * user's choice — `true` to proceed, `false` to cancel.
 */
export async function confirmExitIfEnabled(
  title: string,
  okLabel: string,
  cancelLabel: string,
): Promise<boolean> {
  if (!useStore.getState().confirmOnExit) return true;
  return new Promise<boolean>((resolve) => {
    resolverRef = resolve;
    useExitConfirmStore.setState({
      open: true,
      title,
      okLabel,
      cancelLabel,
    });
  });
}

/** Called by the dialog when the user picks Confirm/Cancel. */
export function resolveExitConfirm(ok: boolean): void {
  useExitConfirmStore.setState({ open: false });
  const r = resolverRef;
  resolverRef = undefined;
  r?.(ok);
}
