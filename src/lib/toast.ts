import { useStore } from '../store/useStore';

/**
 * Imperative toast API.
 *
 * Usage (anywhere — component or plain TS):
 * ```ts
 * import { toast } from '@/lib/toast';
 * toast.success('Saved');
 * toast.error('Failed: ' + err);
 * ```
 *
 * Delegates to the Zustand toast slice, so no React context or hooks
 * are needed at the call site.
 */
export const toast = {
  success: (message: string, duration?: number) =>
    useStore.getState().addToast('success', message, duration),
  error: (message: string, duration?: number) =>
    useStore.getState().addToast('error', message, duration),
  info: (message: string, duration?: number) =>
    useStore.getState().addToast('info', message, duration),
  warning: (message: string, duration?: number) =>
    useStore.getState().addToast('warning', message, duration),
};
