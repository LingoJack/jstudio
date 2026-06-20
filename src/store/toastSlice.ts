import type { SliceCreator } from './storeHelpers';

/** Toast severity — controls icon and accent colour. */
export type ToastType = 'success' | 'error' | 'info' | 'warning';

/** A single toast notification entry. */
export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  /** Auto-dismiss delay in ms. `0` means persistent (manual close only). */
  duration: number;
}

/** Default auto-dismiss duration per type (ms). */
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3000,
  info: 3000,
  warning: 5000,
  error: 5000,
};

/** Maximum number of toasts shown simultaneously. */
const MAX_TOASTS = 5;

/** Timer registry — tracks pending auto-dismiss timers by toast id. */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Toast slice — manages a queue of transient notification messages.
 * Any component can push a toast via `addToast`; the `ToastContainer`
 * component subscribes to `toasts` for rendering.
 */
export const createToastSlice: SliceCreator = (set, get) => ({
  toasts: [],

  addToast: (type, message, duration) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ms = duration ?? DEFAULT_DURATION[type];

    // Enqueue, then trim to MAX_TOASTS (drop oldest).
    set((s) => {
      const next = [...s.toasts, { id, type, message, duration: ms }];
      if (next.length > MAX_TOASTS) next.shift();
      return { toasts: next };
    });

    // Schedule auto-dismiss (unless persistent).
    if (ms > 0) {
      const timer = setTimeout(() => {
        timers.delete(id);
        get().removeToast(id);
      }, ms);
      timers.set(id, timer);
    }
  },

  removeToast: (id) => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  clearToasts: () => {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    set({ toasts: [] });
  },
});
