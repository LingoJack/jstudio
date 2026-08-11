import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ipc } from "../core/ipc";
function useWindowFocusTracking() {
  useEffect(() => {
    const label = getCurrentWindow().label;
    const report = () => {
      ipc.reportWindowFocus(label).catch(() => {
      });
    };
    let attempts = 0;
    const maxAttempts = 3;
    const firstReport = () => {
      ipc.reportWindowFocus(label).then(() => {
      }).catch(() => {
        attempts += 1;
        if (attempts < maxAttempts) {
          setTimeout(firstReport, 100);
        }
      });
    };
    const timer = setTimeout(firstReport, 0);
    window.addEventListener("focus", report);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", report);
    };
  }, []);
}
export {
  useWindowFocusTracking
};
