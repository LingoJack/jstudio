import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LogOut } from 'lucide-react';
import { useDialogTransition } from './useDialogTransition';
import { useExitConfirm, resolveExitConfirm } from '../../lib/core/exitConfirm';

/**
 * In-app exit-confirmation dialog. Replaces the native Tauri `confirm()`
 * to match the app's VSCode-style dialog look. Renders via portal at the
 * document body; state + Promise resolver live in `lib/core/exitConfirm`.
 *
 * Mounted once in `App.tsx`. Cancel is the safer default — auto-focused
 * so Enter doesn't accidentally quit.
 */
export default function ExitConfirmDialog() {
  const open = useExitConfirm((s) => s.open);
  const title = useExitConfirm((s) => s.title);
  const okLabel = useExitConfirm((s) => s.okLabel);
  const cancelLabel = useExitConfirm((s) => s.cancelLabel);
  const transition = useDialogTransition(open);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  // Esc cancels.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveExitConfirm(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Auto-focus Cancel on open (safer default — don't accidentally quit).
  useEffect(() => {
    if (transition !== 'enter') return;
    const id = requestAnimationFrame(() => {
      cancelBtnRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [transition]);

  if (transition === 'closed') return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 ${
        transition === 'exit'
          ? 'animate-dialog-backdrop-out'
          : 'animate-dialog-backdrop-in'
      }`}
      onClick={() => resolveExitConfirm(false)}
    >
      <div
        className={`w-[min(360px,92vw)] flex flex-col rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-2xl dark:shadow-none ${
          transition === 'exit'
            ? 'animate-dialog-panel-out'
            : 'animate-dialog-panel-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3.5">
          <LogOut className="w-4 h-4 text-[var(--vscode-descriptionForeground)]" />
          <h2 className="flex-1 text-sm font-semibold text-[var(--vscode-foreground)]">
            {title}
          </h2>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3">
          <button
            ref={cancelBtnRef}
            onClick={() => resolveExitConfirm(false)}
            className="px-3 py-1.5 text-sm rounded border border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => resolveExitConfirm(true)}
            className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] cursor-pointer transition-colors"
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
