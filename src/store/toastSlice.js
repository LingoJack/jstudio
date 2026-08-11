const DEFAULT_DURATION = {
  success: 3e3,
  info: 3e3,
  warning: 5e3,
  error: 5e3
};
const MAX_TOASTS = 5;
const timers = /* @__PURE__ */ new Map();
const createToastSlice = (set, get) => ({
  toasts: [],
  addToast: (type, message, duration) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ms = duration ?? DEFAULT_DURATION[type];
    set((s) => {
      const next = [...s.toasts, { id, type, message, duration: ms }];
      if (next.length > MAX_TOASTS) next.shift();
      return { toasts: next };
    });
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
  }
});
export {
  createToastSlice
};
