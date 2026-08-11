import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LayoutGrid, TerminalSquare, Eye } from "lucide-react";
import { ipc } from "../core/ipc";
import { registerActionDef } from "./globalShortcuts";
let panelWindowCounter = 0;
registerActionDef({
  type: "open-panel",
  labelKey: "globalShortcut.action.openPanel",
  descriptionKey: "globalShortcut.action.openPanelDesc",
  icon: LayoutGrid,
  paramFields: [
    {
      key: "panelId",
      labelKey: "globalShortcut.param.panel",
      type: "select",
      options: [
        { value: "command-palette", labelKey: "globalShortcut.panel.commandPalette" }
      ],
      defaultValue: "command-palette"
    }
  ],
  handler: async (params) => {
    const panelId = params.panelId || "command-palette";
    const label = `cp-${panelId}`;
    const { WebviewWindow: WV } = await import("@tauri-apps/api/webviewWindow");
    const existing = await WV.getByLabel(label);
    if (existing) {
      await existing.close();
    }
    panelWindowCounter += 1;
    if (panelId === "command-palette") {
      const w = new WebviewWindow(label, {
        url: `index.html?window=command-palette&label=${encodeURIComponent(label)}`,
        title: "Command Palette",
        width: 680,
        height: 600,
        maxWidth: 680,
        maxHeight: 600,
        minWidth: 480,
        minHeight: 56,
        resizable: false,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        center: true,
        focus: true,
        shadow: false
        // skipTaskbar: true, // Not available in all platforms
      });
      w.once("tauri://error", (e) => {
        console.error("[globalShortcuts] Command palette window error:", e);
      });
    }
  }
});
let terminalWindowCounter = 0;
registerActionDef({
  type: "open-terminal",
  labelKey: "globalShortcut.action.openTerminal",
  descriptionKey: "globalShortcut.action.openTerminalDesc",
  icon: TerminalSquare,
  paramFields: [
    {
      key: "cwd",
      labelKey: "globalShortcut.param.workingDirectory",
      type: "directory",
      placeholderKey: "globalShortcut.param.workingDirectoryPlaceholder",
      defaultValue: "~"
    },
    {
      key: "command",
      labelKey: "globalShortcut.param.command",
      type: "text",
      placeholderKey: "globalShortcut.param.commandPlaceholder"
    }
  ],
  handler: async (params) => {
    const cwd = params.cwd || "~";
    const command = params.command?.trim();
    const session = await ipc.ptyCreate({
      cwd,
      cols: 80,
      rows: 24
    });
    if (command) {
      await new Promise((r) => setTimeout(r, 300));
      await ipc.ptyWrite(session.id, command + "\n");
    }
    terminalWindowCounter += 1;
    const label = `terminal-gs-${Date.now()}-${terminalWindowCounter}`;
    const { invoke } = await import("@tauri-apps/api/core");
    const payload = {
      groupId: `gs-group-${label}`,
      layout: "tabs",
      activeSessionId: session.id,
      panes: [
        {
          sessionId: session.id,
          title: session.title,
          customTitle: null,
          autoTitle: null,
          templateId: null,
          cwd,
          scrollback: ""
        }
      ]
    };
    try {
      await invoke("set_terminal_detach_payload", { label, payload });
    } catch (e) {
      console.error("[globalShortcuts] Failed to store terminal payload:", e);
      return;
    }
    new WebviewWindow(label, {
      url: `index.html?window=terminal&label=${encodeURIComponent(label)}`,
      title: command ? `\u7EC8\u7AEF: ${command}` : "\u7EC8\u7AEF",
      width: 900,
      height: 600,
      minWidth: 400,
      minHeight: 240,
      resizable: true,
      decorations: true,
      center: true,
      focus: true
    });
  }
});
registerActionDef({
  type: "toggle-window",
  labelKey: "globalShortcut.action.toggleWindow",
  descriptionKey: "globalShortcut.action.toggleWindowDesc",
  icon: Eye,
  paramFields: [],
  handler: async () => {
    const win = getCurrentWindow();
    if (await win.isVisible()) {
      const focused = await win.isFocused();
      if (focused) {
        await win.hide();
      } else {
        await win.setFocus();
      }
    } else {
      await win.show();
      await win.setFocus();
    }
  }
});
