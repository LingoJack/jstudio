import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store/useStore";
let detachCounter = 0;
const NEW_WINDOW_WIDTH = 800;
const NEW_WINDOW_HEIGHT = 600;
async function createDocumentWindow(docId, tabId, pos) {
  const store = useStore.getState();
  if (store.tabs.length <= 1) return;
  detachCounter += 1;
  const label = `document-${Date.now()}-${detachCounter}`;
  const payload = { docId };
  try {
    await invoke("set_terminal_detach_payload", { label, payload });
  } catch (e) {
    console.error("[DocumentDetach] Failed to store payload:", e);
    return;
  }
  const meta = store.docList.find((d) => d.id === docId);
  const title = meta?.title || "Document";
  const options = {
    url: `index.html?window=document&label=${encodeURIComponent(label)}`,
    title,
    width: NEW_WINDOW_WIDTH,
    height: NEW_WINDOW_HEIGHT,
    minWidth: 400,
    minHeight: 300,
    resizable: true,
    decorations: true,
    focus: true
  };
  if (pos) {
    options.x = Math.round(pos.x);
    options.y = Math.round(pos.y);
  } else {
    options.center = true;
  }
  const w = new WebviewWindow(label, options);
  let created = false;
  w.once("tauri://created", () => {
    created = true;
    const id = tabId ?? store.tabs.find((t) => t.kind === "document" && t.docId === docId)?.id;
    if (id) store.closeTab(id);
  });
  w.once("tauri://error", (e) => {
    console.error("[DocumentDetach] Window creation error:", e);
    invoke("clear_terminal_detach_payload", { label }).catch(() => {
    });
  });
  setTimeout(() => {
    if (!created) {
      const id = tabId ?? useStore.getState().tabs.find((t) => t.kind === "document" && t.docId === docId)?.id;
      if (id) useStore.getState().closeTab(id);
    }
  }, 1500);
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
function fetchDocumentDetachPayload() {
  if (cachedFetch) return cachedFetch;
  const doFetch = async () => {
    const label = resolveLabel();
    for (let i = 0; i < 20; i++) {
      try {
        const data = await invoke(
          "get_terminal_detach_payload",
          { label }
        );
        if (data) return data;
      } catch (e) {
        console.error("[DocumentDetach] Error fetching payload:", e);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    console.error("[DocumentDetach] Failed to retrieve payload after retries");
    return null;
  };
  cachedFetch = doFetch();
  return cachedFetch;
}
export {
  createDocumentWindow,
  fetchDocumentDetachPayload
};
