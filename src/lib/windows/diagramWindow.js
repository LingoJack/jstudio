import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { logger } from "../core/logger";
let diagramCounter = 0;
async function openDiagramWindow(snapshot, onUpdate, darkMode, blockId, onClosed, mindmapScheme) {
  diagramCounter += 1;
  const label = `diagram-${Date.now()}-${diagramCounter}`;
  logger.debug("DiagramWindow", "Opening new window: " + label);
  const payload = { snapshot, darkMode, blockId, mindmapScheme };
  try {
    await invoke("set_preview_data", { label, data: payload });
    logger.debug("DiagramWindow", "Data stored in Rust cache for " + label);
  } catch (e) {
    console.error("[DiagramWindow] Failed to store data:", e);
    return () => {
    };
  }
  let stopped = false;
  let lastApplied = snapshot;
  const poll = async () => {
    logger.debug("DiagramWindow", "Poll loop started for " + label);
    while (!stopped) {
      try {
        const data = await invoke(
          "get_diagram_update",
          { label }
        );
        if (typeof data?.snapshot === "string" && data.snapshot !== lastApplied && (!blockId || !data.blockId || data.blockId === blockId)) {
          logger.debug("DiagramWindow", "Received update from window, length: " + data.snapshot.length);
          lastApplied = data.snapshot;
          onUpdate(data.snapshot, data.mindmapScheme);
        }
      } catch (e) {
        console.error("[DiagramWindow] Poll error:", e);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    logger.debug("DiagramWindow", "Poll loop stopped for " + label);
  };
  poll();
  const webviewWindow = new WebviewWindow(label, {
    url: `index.html?window=diagram&label=${encodeURIComponent(label)}`,
    title: "\u753B\u677F\u7F16\u8F91",
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
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
    logger.debug("DiagramWindow", "Window created: " + label);
  });
  webviewWindow.once("tauri://error", (e) => {
    console.error("[DiagramWindow] Error:", e);
    onClosed?.();
  });
  webviewWindow.once("tauri://destroyed", () => {
    logger.debug("DiagramWindow", "Window destroyed: " + label);
    stopped = true;
    onClosed?.();
  });
  return () => {
    stopped = true;
    invoke("clear_diagram_update", { label }).catch(() => {
    });
  };
}
function resolveLabel() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("label");
  if (fromUrl) return fromUrl;
  try {
    return getCurrentWindow().label;
  } catch {
    return "";
  }
}
let cachedFetch = null;
function fetchDiagramData() {
  if (cachedFetch) return cachedFetch;
  const doFetch = async () => {
    const label = resolveLabel();
    logger.debug("DiagramWindow", "Fetching data for label: " + label);
    for (let i = 0; i < 20; i++) {
      try {
        const data = await invoke("get_preview_data", {
          label
        });
        if (data) {
          logger.debug("DiagramWindow", "Data retrieved on attempt " + (i + 1));
          return data;
        }
      } catch (e) {
        console.error("[DiagramWindow] Error fetching data:", e);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    console.error("[DiagramWindow] Failed to retrieve data after retries");
    return null;
  };
  cachedFetch = doFetch();
  return cachedFetch;
}
async function sendDiagramUpdate(snapshot, mindmapScheme) {
  const label = resolveLabel();
  logger.debug("DiagramWindow", "Sending update for label: " + label + " snapshot length: " + snapshot.length);
  try {
    const payload = await fetchDiagramData();
    await invoke("set_diagram_update", {
      label,
      data: {
        snapshot,
        blockId: payload?.blockId,
        mindmapScheme
      }
    });
    logger.debug("DiagramWindow", "Update stored in Rust cache OK");
  } catch (e) {
    console.error("[DiagramWindow] Failed to send update:", e);
  }
}
function closeDiagramWindow() {
  getCurrentWindow().close();
}
export {
  closeDiagramWindow,
  fetchDiagramData,
  openDiagramWindow,
  sendDiagramUpdate
};
