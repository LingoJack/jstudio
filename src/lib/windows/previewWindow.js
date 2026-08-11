import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { logger } from "../core/logger";
let previewCounter = 0;
async function openPreviewWindow(payload) {
  previewCounter += 1;
  const label = `preview-${Date.now()}-${previewCounter}`;
  logger.debug("PreviewWindow", "Opening new window: " + label + " " + payload.fileName);
  const shortName = payload.fileName.length > 40 ? payload.fileName.slice(0, 37) + "..." : payload.fileName;
  try {
    await invoke("set_preview_data", { label, data: payload });
    logger.debug("PreviewWindow", "Data stored in Rust cache for " + label);
  } catch (e) {
    console.error("[PreviewWindow] Failed to store preview data:", e);
    return;
  }
  const webviewWindow = new WebviewWindow(label, {
    url: "index.html?window=preview",
    title: `\u9884\u89C8 - ${shortName}`,
    width: 1280,
    height: 860,
    minWidth: 480,
    minHeight: 360,
    resizable: true,
    maximizable: true,
    minimizable: true,
    closable: true,
    decorations: true,
    transparent: false,
    shadow: true,
    center: true
  });
  webviewWindow.once("tauri://created", () => {
    logger.debug("PreviewWindow", "Window created successfully: " + label);
  });
  webviewWindow.once("tauri://error", (e) => {
    console.error("[PreviewWindow] Failed to create window:", e);
  });
}
async function openHtmlPreviewWindow(html, title = "HTML") {
  const fileSize = new Blob([html]).size;
  await openPreviewWindow({
    src: "",
    html,
    fileName: title,
    fileSize,
    category: "html"
  });
}
let cachedPreviewFetch = null;
function fetchPreviewData() {
  if (cachedPreviewFetch) return cachedPreviewFetch;
  const doFetch = async () => {
    const label = getCurrentWindow().label;
    logger.debug("PreviewWindow", "Fetching preview data for label: " + label);
    for (let i = 0; i < 20; i++) {
      try {
        const data = await invoke("get_preview_data", { label });
        if (data) {
          logger.debug("PreviewWindow", "Data retrieved on attempt " + (i + 1));
          return data;
        }
      } catch (e) {
        console.error("[PreviewWindow] Error fetching data:", e);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    console.error("[PreviewWindow] Failed to retrieve preview data after retries");
    return null;
  };
  cachedPreviewFetch = doFetch();
  return cachedPreviewFetch;
}
function closePreviewWindow() {
  getCurrentWindow().close();
}
export {
  closePreviewWindow,
  fetchPreviewData,
  openHtmlPreviewWindow,
  openPreviewWindow
};
