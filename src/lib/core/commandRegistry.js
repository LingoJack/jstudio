import {
  FilePlus2,
  FileText,
  FileDown,
  FolderDown,
  PackageOpen,
  Package,
  PanelLeft,
  ListTree,
  Moon,
  Sun,
  Monitor,
  SunMoon,
  ChevronLeft,
  ChevronRight,
  X,
  SquareTerminal
} from "lucide-react";
import { ipc } from "./ipc";
import { ACTIVITY_ITEM_META } from "./activityMeta";
import { createTerminalWindow } from "../windows/terminalDetach";
import { getFocusedEditor } from "../editor/focusedEditorRegistry";
import { getSelectAllHandler } from "../editor/selectAllRegistry";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { tSync } from "./i18n";
import { confirmExitIfEnabled } from "./exitConfirm";
const SHORTCUT_ACTIONS = [
  // ── Global / App ──
  {
    id: "app.commandPalette",
    perform: (store) => store.setCommandPaletteOpen(true)
  },
  { id: "app.newDocument", perform: (store) => store.createDocument() },
  {
    id: "app.newTab",
    perform: (store) => {
      if (store.activeSidebarView === "terminal") {
        store.createSession();
      } else {
        store.setOpenDocDialogOpen(true);
      }
    }
  },
  { id: "app.toggleSidebar", perform: (store) => store.toggleSidebar() },
  { id: "app.toggleOutline", perform: (store) => store.toggleOutline() },
  { id: "app.openSettings", perform: (store) => store.setSettingsOpen(true) },
  { id: "app.find", perform: (store) => store.setFindBarOpen(true) },
  {
    id: "app.goToDocuments",
    perform: (store) => {
      store.setSettingsOpen(false);
      store.setActiveSidebarView("documents");
      if (!store.isSidebarOpen) store.toggleSidebar();
    }
  },
  {
    id: "app.goToTerminal",
    perform: (store) => {
      store.setSettingsOpen(false);
      store.setActiveSidebarView("terminal");
      if (!store.isSidebarOpen) store.toggleSidebar();
    }
  },
  {
    id: "app.goToBrowser",
    perform: (store) => {
      store.setSettingsOpen(false);
      store.setActiveSidebarView("browser");
    }
  },
  { id: "app.cycleTabLeft", perform: (store) => store.cycleTab(-1) },
  { id: "app.cycleTabRight", perform: (store) => store.cycleTab(1) },
  {
    id: "app.closeTab",
    perform: (store) => {
      const currentLabel = getCurrentWindow().label;
      if (currentLabel !== "main") {
        invoke("close_window").catch(
          (err) => console.error("Failed to close window:", err)
        );
        return;
      }
      if (!document.hasFocus()) return;
      if (!store.activeTabId) return;
      if (store.tabs.length > 1) {
        store.closeTab(store.activeTabId);
      } else {
        confirmExitIfEnabled(
          tSync("dialog.exitConfirmTitle"),
          tSync("dialog.exitConfirmMessage"),
          tSync("dialog.confirm"),
          tSync("dialog.cancel")
        ).then((ok) => {
          if (!ok) return;
          invoke("close_window").catch(
            (err) => console.error("Failed to close window:", err)
          );
        });
      }
    }
  },
  {
    id: "app.quit",
    perform: () => {
      confirmExitIfEnabled(
        tSync("dialog.exitConfirmTitle"),
        tSync("dialog.exitConfirmMessage"),
        tSync("dialog.confirm"),
        tSync("dialog.cancel")
      ).then((ok) => {
        if (!ok) return;
        ipc.quitApp().catch((err) => console.error("Failed to quit:", err));
      });
    }
  },
  { id: "app.toggleDarkMode", perform: (store) => store.toggleDarkMode() },
  { id: "app.setDarkTheme", perform: (store) => store.setThemeMode("dark") },
  { id: "app.setLightTheme", perform: (store) => store.setThemeMode("light") },
  {
    id: "app.setSystemTheme",
    perform: (store) => store.setThemeMode("system")
  },
  { id: "app.importMarkdown", perform: importMarkdown },
  // ── Terminal Tabs ──
  { id: "terminal.newTab", perform: (store) => store.createSession() },
  {
    id: "terminal.detachTab",
    perform: (store) => {
      if (store.groups.length < 2) return;
      if (!store.activeGroupId) return;
      createTerminalWindow(store.activeGroupId);
    }
  },
  // ── Terminal Panes ──
  { id: "terminal.splitPane", perform: (store) => store.splitPane() },
  {
    id: "terminal.closePane",
    perform: (store) => {
      if (store.activeSessionId) store.closePane(store.activeSessionId);
    }
  },
  { id: "terminal.focusPrevPane", perform: (store) => store.focusPrevPane() },
  { id: "terminal.focusNextPane", perform: (store) => store.focusNextPane() },
  { id: "terminal.cycleLayout", perform: (store) => store.cyclePaneLayout() },
  { id: "terminal.movePane", perform: (store) => store.moveActivePane() },
  // ── Editor Blocks ── (handled by TipTap, listed here for completeness)
  {
    id: "editor.insertBlockBelow",
    perform: () => {
    }
  },
  {
    id: "editor.insertBlockAbove",
    perform: () => {
    }
  },
  {
    id: "editor.inlineCode",
    perform: () => {
      const editor = getFocusedEditor();
      if (!editor || editor.isDestroyed) return;
      editor.chain().focus().toggleCode().run();
    }
  },
  {
    id: "editor.undo",
    perform: () => {
      const editor = getFocusedEditor();
      if (!editor || editor.isDestroyed) return;
      editor.chain().focus().undo().run();
    }
  },
  {
    id: "editor.redo",
    perform: () => {
      const editor = getFocusedEditor();
      if (!editor || editor.isDestroyed) return;
      editor.chain().focus().redo().run();
    }
  },
  {
    id: "app.selectAll",
    perform: (store) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        active.select();
        return;
      }
      const editor = getFocusedEditor();
      if (editor && !editor.isDestroyed) {
        const handler = getSelectAllHandler();
        if (handler) {
          handler();
          return;
        }
      }
      if (store.activeSidebarView === "browser") {
        invoke("select_all_in_active_browser_tab").catch(console.error);
        return;
      }
      document.execCommand("selectAll");
    }
  }
];
function getShortcutAction(id) {
  const action = SHORTCUT_ACTIONS.find((a) => a.id === id);
  return action?.perform ?? null;
}
function executeShortcutAction(id, store) {
  const action = getShortcutAction(id);
  if (!action) {
    console.warn(`[CommandRegistry] No shortcut action registered for "${id}"`);
    return false;
  }
  action(store);
  return true;
}
async function importMarkdown(store) {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const filePath = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown"] }]
  });
  if (!filePath || typeof filePath !== "string") return;
  const bytes = await ipc.readFileBytes(filePath);
  const md = new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  const filename = filePath.split(/[/\\]/).pop() ?? "Untitled.md";
  await store.importDocumentFromMarkdown(filename, md);
}
async function importMarkdownDirectory(store) {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const dirPath = await open({ directory: true, multiple: false });
  if (!dirPath || typeof dirPath !== "string") return;
  await store.importMarkdownDirectory(dirPath);
}
async function exportBundle(store) {
  const docId = store.activeDocId;
  if (!docId) return;
  try {
    await store.exportDocumentBundle(docId);
  } catch (e) {
    console.error("Failed to export bundle:", e);
  }
}
async function importBundle(store) {
  try {
    await store.importDocumentBundle();
  } catch (e) {
    console.error("Failed to import bundle:", e);
  }
}
function buildCommands() {
  return [
    // ── Navigation ──
    {
      id: "nav.documents",
      icon: ACTIVITY_ITEM_META.documents.icon,
      titleZh: "\u8F6C\u5230\u6587\u6863",
      titleEn: "Go to Documents",
      categoryZh: "\u5BFC\u822A",
      categoryEn: "Navigation",
      shortcutId: "app.goToDocuments",
      keywordsZh: ["\u6587\u6863", "\u5217\u8868", "\u4FA7\u8FB9\u680F"],
      keywordsEn: ["docs", "files", "sidebar", "list"],
      perform: (store) => {
        store.setSettingsOpen(false);
        store.setActiveSidebarView("documents");
        if (!store.isSidebarOpen) store.toggleSidebar();
      }
    },
    {
      id: "nav.terminal",
      icon: ACTIVITY_ITEM_META.terminal.icon,
      titleZh: "\u8F6C\u5230\u7EC8\u7AEF",
      titleEn: "Go to Terminal",
      categoryZh: "\u5BFC\u822A",
      categoryEn: "Navigation",
      shortcutId: "app.goToTerminal",
      keywordsZh: ["\u7EC8\u7AEF", "\u547D\u4EE4\u884C", "shell"],
      keywordsEn: ["term", "shell", "console", "cli"],
      perform: (store) => {
        store.setSettingsOpen(false);
        store.setActiveSidebarView("terminal");
        if (!store.isSidebarOpen) store.toggleSidebar();
      }
    },
    {
      id: "nav.browser",
      icon: ACTIVITY_ITEM_META.browser.icon,
      titleZh: "\u6253\u5F00\u6D4F\u89C8\u5668",
      titleEn: "Open Browser",
      categoryZh: "\u5BFC\u822A",
      categoryEn: "Navigation",
      shortcutId: "app.goToBrowser",
      keywordsZh: ["\u6D4F\u89C8\u5668", "\u7F51\u9875", "\u94FE\u63A5", "\u9884\u89C8"],
      keywordsEn: ["browser", "web", "link", "preview"],
      perform: (store) => {
        store.setSettingsOpen(false);
        store.setActiveSidebarView("browser");
      }
    },
    {
      id: "nav.settings",
      icon: ACTIVITY_ITEM_META.settings.icon,
      titleZh: "\u6253\u5F00\u8BBE\u7F6E",
      titleEn: "Open Settings",
      categoryZh: "\u5BFC\u822A",
      categoryEn: "Navigation",
      shortcutId: "app.openSettings",
      keywordsZh: ["\u8BBE\u7F6E", "\u914D\u7F6E", "\u9996\u9009\u9879"],
      keywordsEn: ["settings", "preferences", "config"],
      perform: (store) => store.setSettingsOpen(true)
    },
    // ── Workspace Tabs ──
    {
      id: "workspace.cycleTabLeft",
      icon: ChevronLeft,
      titleZh: "\u4E0A\u4E00\u4E2A\u6807\u7B7E\u9875",
      titleEn: "Previous Tab",
      categoryZh: "\u6807\u7B7E\u9875",
      categoryEn: "Tabs",
      shortcutId: "app.cycleTabLeft",
      keywordsZh: ["\u6807\u7B7E", "\u4E0A\u4E00\u4E2A", "\u5207\u6362", "\u5DE6"],
      keywordsEn: ["tab", "previous", "switch", "left"],
      perform: (store) => store.cycleTab(-1)
    },
    {
      id: "workspace.cycleTabRight",
      icon: ChevronRight,
      titleZh: "\u4E0B\u4E00\u4E2A\u6807\u7B7E\u9875",
      titleEn: "Next Tab",
      categoryZh: "\u6807\u7B7E\u9875",
      categoryEn: "Tabs",
      shortcutId: "app.cycleTabRight",
      keywordsZh: ["\u6807\u7B7E", "\u4E0B\u4E00\u4E2A", "\u5207\u6362", "\u53F3"],
      keywordsEn: ["tab", "next", "switch", "right"],
      perform: (store) => store.cycleTab(1)
    },
    {
      id: "workspace.closeTab",
      icon: X,
      titleZh: "\u5173\u95ED\u5F53\u524D\u6807\u7B7E\u9875",
      titleEn: "Close Current Tab",
      categoryZh: "\u6807\u7B7E\u9875",
      categoryEn: "Tabs",
      shortcutId: "app.closeTab",
      keywordsZh: ["\u6807\u7B7E", "\u5173\u95ED"],
      keywordsEn: ["tab", "close"],
      perform: (store) => {
        if (store.activeTabId) store.closeTab(store.activeTabId);
      }
    },
    {
      id: "workspace.newTerminalTab",
      icon: SquareTerminal,
      titleZh: "\u65B0\u5EFA\u7EC8\u7AEF\u6807\u7B7E\u9875",
      titleEn: "New Terminal Tab",
      categoryZh: "\u6807\u7B7E\u9875",
      categoryEn: "Tabs",
      shortcutId: "terminal.newTab",
      keywordsZh: ["\u7EC8\u7AEF", "\u6807\u7B7E", "\u65B0\u5EFA"],
      keywordsEn: ["terminal", "tab", "new"],
      perform: (store) => store.createSession()
    },
    // ── Document ──
    {
      id: "doc.new",
      icon: FilePlus2,
      titleZh: "\u65B0\u5EFA\u6587\u6863",
      titleEn: "New Document",
      categoryZh: "\u6587\u6863",
      categoryEn: "Document",
      shortcutId: "app.newDocument",
      keywordsZh: ["\u521B\u5EFA", "\u65B0\u5EFA"],
      keywordsEn: ["create", "add"],
      perform: (store) => store.createDocument()
    },
    {
      id: "doc.open",
      icon: FileText,
      titleZh: "\u6253\u5F00\u6587\u6863",
      titleEn: "Open Document",
      categoryZh: "\u6587\u6863",
      categoryEn: "Document",
      keywordsZh: ["\u6253\u5F00", "\u5207\u6362", "\u641C\u7D22", "\u73B0\u6709"],
      keywordsEn: ["open", "switch", "search", "existing"],
      perform: (store) => store.setOpenDocDialogOpen(true)
    },
    {
      id: "doc.import",
      icon: FileDown,
      titleZh: "\u5BFC\u5165 Markdown",
      titleEn: "Import Markdown",
      categoryZh: "\u6587\u6863",
      categoryEn: "Document",
      shortcutId: "app.importMarkdown",
      keywordsZh: ["\u5BFC\u5165", "markdown", "md"],
      keywordsEn: ["import", "md", "markdown"],
      perform: importMarkdown
    },
    {
      id: "doc.importDirectory",
      icon: FolderDown,
      titleZh: "\u5BFC\u5165\u76EE\u5F55",
      titleEn: "Import Directory",
      categoryZh: "\u6587\u6863",
      categoryEn: "Document",
      keywordsZh: ["\u5BFC\u5165", "\u76EE\u5F55", "\u6587\u4EF6\u5939", "\u6279\u91CF"],
      keywordsEn: ["import", "directory", "folder", "batch"],
      perform: importMarkdownDirectory
    },
    {
      id: "doc.exportBundle",
      icon: Package,
      titleZh: "\u5BFC\u51FA\u5907\u4EFD (.jnote)",
      titleEn: "Export Backup (.jnote)",
      categoryZh: "\u6587\u6863",
      categoryEn: "Document",
      keywordsZh: ["\u5BFC\u51FA", "\u5907\u4EFD", "\u65E0\u635F", "\u6253\u5305", "jnote"],
      keywordsEn: ["export", "backup", "lossless", "bundle", "jnote"],
      perform: exportBundle
    },
    {
      id: "doc.importBundle",
      icon: PackageOpen,
      titleZh: "\u5BFC\u5165\u5907\u4EFD (.jnote)",
      titleEn: "Import Backup (.jnote)",
      categoryZh: "\u6587\u6863",
      categoryEn: "Document",
      keywordsZh: ["\u5BFC\u5165", "\u5907\u4EFD", "\u65E0\u635F", "jnote"],
      keywordsEn: ["import", "backup", "lossless", "bundle", "jnote"],
      perform: importBundle
    },
    // ── View ──
    {
      id: "view.sidebar",
      icon: PanelLeft,
      titleZh: "\u5207\u6362\u4FA7\u8FB9\u680F",
      titleEn: "Toggle Sidebar",
      categoryZh: "\u89C6\u56FE",
      categoryEn: "View",
      shortcutId: "app.toggleSidebar",
      keywordsZh: ["\u4FA7\u8FB9\u680F", "\u663E\u793A\u9690\u85CF"],
      keywordsEn: ["sidebar", "panel"],
      perform: (store) => store.toggleSidebar()
    },
    {
      id: "view.outline",
      icon: ListTree,
      titleZh: "\u5207\u6362\u5927\u7EB2",
      titleEn: "Toggle Outline",
      categoryZh: "\u89C6\u56FE",
      categoryEn: "View",
      shortcutId: "app.toggleOutline",
      keywordsZh: ["\u5927\u7EB2", "\u76EE\u5F55", "\u6807\u9898"],
      keywordsEn: ["outline", "toc", "headings"],
      perform: (store) => store.toggleOutline()
    },
    // ── Appearance ──
    {
      id: "appearance.toggleDark",
      icon: SunMoon,
      titleZh: "\u5207\u6362\u6DF1\u8272\u6A21\u5F0F",
      titleEn: "Toggle Dark Mode",
      categoryZh: "\u5916\u89C2",
      categoryEn: "Appearance",
      shortcutId: "app.toggleDarkMode",
      keywordsZh: ["\u6DF1\u8272", "\u6D45\u8272", "\u4E3B\u9898", "\u5207\u6362"],
      keywordsEn: ["dark", "light", "theme", "toggle"],
      perform: (store) => store.toggleDarkMode()
    },
    {
      id: "appearance.dark",
      icon: Moon,
      titleZh: "\u5207\u6362\u5230\u6DF1\u8272\u4E3B\u9898",
      titleEn: "Switch to Dark Theme",
      categoryZh: "\u5916\u89C2",
      categoryEn: "Appearance",
      shortcutId: "app.setDarkTheme",
      keywordsZh: ["\u6DF1\u8272", "\u4E3B\u9898"],
      keywordsEn: ["dark", "theme"],
      perform: (store) => store.setThemeMode("dark")
    },
    {
      id: "appearance.light",
      icon: Sun,
      titleZh: "\u5207\u6362\u5230\u6D45\u8272\u4E3B\u9898",
      titleEn: "Switch to Light Theme",
      categoryZh: "\u5916\u89C2",
      categoryEn: "Appearance",
      shortcutId: "app.setLightTheme",
      keywordsZh: ["\u6D45\u8272", "\u4E3B\u9898"],
      keywordsEn: ["light", "theme"],
      perform: (store) => store.setThemeMode("light")
    },
    {
      id: "appearance.system",
      icon: Monitor,
      titleZh: "\u8DDF\u968F\u7CFB\u7EDF\u4E3B\u9898",
      titleEn: "Switch to System Theme",
      categoryZh: "\u5916\u89C2",
      categoryEn: "Appearance",
      shortcutId: "app.setSystemTheme",
      keywordsZh: ["\u7CFB\u7EDF", "\u81EA\u52A8", "\u4E3B\u9898"],
      keywordsEn: ["system", "auto", "theme"],
      perform: (store) => store.setThemeMode("system")
    }
  ];
}
function scoreMatch(haystack, query) {
  const lower = haystack.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) return { score: 0, index: -1 };
  const positionBonus = (lower.length - idx) / lower.length;
  const prefixBonus = idx === 0 ? 50 : 0;
  return { score: 100 * positionBonus + prefixBonus, index: idx };
}
function filterCommands(commands, query, lang) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return commands.map((command) => ({ command, score: 0, titleMatch: null }));
  }
  const results = [];
  for (const command of commands) {
    const title = lang === "zh" ? command.titleZh : command.titleEn;
    const category = lang === "zh" ? command.categoryZh : command.categoryEn;
    const keywords = lang === "zh" ? command.keywordsZh ?? [] : command.keywordsEn ?? [];
    let bestScore = 0;
    let titleMatch = null;
    const titleResult = scoreMatch(title, q);
    if (titleResult.score > 0) {
      bestScore = titleResult.score;
      titleMatch = [titleResult.index, titleResult.index + q.length];
    }
    const catResult = scoreMatch(category, q);
    if (catResult.score > 0) {
      const catScore = catResult.score * 0.6;
      if (catScore > bestScore) bestScore = catScore;
    }
    for (const kw of keywords) {
      const kwResult = scoreMatch(kw, q);
      if (kwResult.score > 0) {
        const kwScore = kwResult.score * 0.3;
        if (kwScore > bestScore) bestScore = kwScore;
      }
    }
    if (bestScore > 0) {
      results.push({ command, score: bestScore, titleMatch });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
export {
  SHORTCUT_ACTIONS,
  buildCommands,
  executeShortcutAction,
  filterCommands,
  getShortcutAction
};
