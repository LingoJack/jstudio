import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
function useCloseOnCmdW() {
  useEffect(() => {
    let unlisten = null;
    listen("native-command", (event) => {
      if (event.payload !== "app.closeTab") return;
      getCurrentWindow().close().catch((err) => {
        console.error("[useCloseOnCmdW] Failed to close window:", err);
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);
}
export {
  useCloseOnCmdW
};
