import { useStore } from "../../store/useStore";
async function confirmExitIfEnabled(title, message, okLabel, cancelLabel) {
  if (!useStore.getState().confirmOnExit) return true;
  const { confirm } = await import("@tauri-apps/plugin-dialog");
  return confirm(message, { title, okLabel, cancelLabel });
}
export {
  confirmExitIfEnabled
};
