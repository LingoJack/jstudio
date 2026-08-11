import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../../store/useStore";
import { serializeSession } from "../../components/terminal/terminalRegistry";
let detachCounter = 0;
const NEW_WINDOW_WIDTH = 900;
const NEW_WINDOW_HEIGHT = 600;
async function createTerminalWindow(groupId, pos) {
  const store = useStore.getState();
  const group = store.groups.find((g) => g.id === groupId);
  if (!group) return;
  if (store.groups.length <= 1) return;
  const panes = group.sessionIds.map((sid) => {
    const session = store.sessions.find((s) => s.id === sid);
    return {
      sessionId: sid,
      title: session?.title ?? "Terminal",
      customTitle: session?.customTitle ?? null,
      autoTitle: session?.autoTitle ?? null,
      templateId: session?.templateId ?? null,
      cwd: session?.cwd ?? "~",
      scrollback: serializeSession(sid)
    };
  });
  const payload = {
    groupId: group.id,
    layout: group.layout,
    activeSessionId: group.activeSessionId,
    panes
  };
  detachCounter += 1;
  const label = `terminal-${Date.now()}-${detachCounter}`;
  try {
    await invoke("set_terminal_detach_payload", { label, payload });
  } catch (e) {
    console.error("[TerminalDetach] Failed to store payload:", e);
    return;
  }
  const options = {
    url: `index.html?window=terminal&label=${encodeURIComponent(label)}`,
    title: panes.find((p) => p.sessionId === group.activeSessionId)?.customTitle ?? "\u7EC8\u7AEF",
    width: NEW_WINDOW_WIDTH,
    height: NEW_WINDOW_HEIGHT,
    minWidth: 400,
    minHeight: 240,
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
    store.detachGroup(groupId);
  });
  w.once("tauri://error", (e) => {
    console.error("[TerminalDetach] Window creation error:", e);
    invoke("clear_terminal_detach_payload", { label }).catch(() => {
    });
  });
  setTimeout(() => {
    if (!created) {
      store.detachGroup(groupId);
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
function fetchDetachPayload() {
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
        console.error("[TerminalDetach] Error fetching payload:", e);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    console.error("[TerminalDetach] Failed to retrieve payload after retries");
    return null;
  };
  cachedFetch = doFetch();
  return cachedFetch;
}
export {
  createTerminalWindow,
  fetchDetachPayload
};
