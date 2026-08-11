import { useStore } from "../../store/useStore";
const toast = {
  success: (message, duration) => useStore.getState().addToast("success", message, duration),
  error: (message, duration) => useStore.getState().addToast("error", message, duration),
  info: (message, duration) => useStore.getState().addToast("info", message, duration),
  warning: (message, duration) => useStore.getState().addToast("warning", message, duration)
};
export {
  toast
};
