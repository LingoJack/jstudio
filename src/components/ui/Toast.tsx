import { memo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Info,
  AlertTriangle,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import type { ToastType } from '../../store/toastSlice';

/** Icon + accent colour per toast severity. */
const TOAST_META: Record<ToastType, { Icon: LucideIcon; iconClass: string }> = {
  success: {
    Icon: CheckCircle2,
    iconClass: 'text-[var(--vscode-testing-iconPassed)]',
  },
  error: {
    Icon: XCircle,
    iconClass: 'text-[var(--vscode-errorForeground)]',
  },
  warning: {
    Icon: AlertTriangle,
    iconClass: 'text-[var(--vscode-editorWarning-foreground)]',
  },
  info: {
    Icon: Info,
    iconClass: 'text-[var(--vscode-textLink-foreground,#3794ff)]',
  },
};

/** A single toast card — matches the app's floating-panel visual language. */
const ToastCard = memo(function ToastCard({
  id,
  type,
  message,
}: {
  id: string;
  type: ToastType;
  message: string;
}) {
  const removeToast = useStore((s) => s.removeToast);
  const { Icon, iconClass } = TOAST_META[type];

  return (
    <div
      className="jstudio-toast-enter flex items-center gap-2.5 w-80 pl-3 pr-2 py-2.5 rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-xl"
      role="alert"
    >
      <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} />
      <span className="flex-1 text-sm text-[var(--vscode-foreground)] leading-snug break-words">
        {message}
      </span>
      <button
        type="button"
        onClick={() => removeToast(id)}
        className="shrink-0 p-1 rounded-md cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150"
        aria-label="Close"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

/**
 * Global toast container — fixed in the top-right corner.
 *
 * Mounted once at the App root. Subscribes to the toast queue in the
 * Zustand store and renders each entry as a `ToastCard`.
 */
export const ToastContainer = memo(function ToastContainer() {
  const toasts = useStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard id={t.id} type={t.type} message={t.message} />
        </div>
      ))}
    </div>
  );
});
