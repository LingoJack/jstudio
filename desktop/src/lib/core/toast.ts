import { useStore } from '../../store/useStore';
import type { ToastAction } from '../../store/toastSlice';

/**
 * Imperative toast API.
 *
 * Usage (anywhere — component or plain TS):
 * ```ts
 * import { toast } from '@/lib/core/toast';
 * toast.success('Saved');
 * toast.error('Failed: ' + err);
 * toast.warning('Content dropped', 8000, { label: 'Restore', onClick: () => openRestore() });
 * ```
 *
 * Delegates to the Zustand toast slice, so no React context or hooks
 * are needed at the call site.
 */
export const toast = {
  success: (message: string, duration?: number, action?: ToastAction) =>
    useStore.getState().addToast('success', message, duration, action),
  error: (message: string, duration?: number, action?: ToastAction) =>
    useStore.getState().addToast('error', message, duration, action),
  info: (message: string, duration?: number, action?: ToastAction) =>
    useStore.getState().addToast('info', message, duration, action),
  warning: (message: string, duration?: number, action?: ToastAction) =>
    useStore.getState().addToast('warning', message, duration, action),
};
