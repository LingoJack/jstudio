import type { LucideIcon } from "lucide-react";
import {
  FilePlus2,
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
  SquareTerminal,
} from "lucide-react";
import type { StoreState } from "../../store/storeHelpers";
import { storage } from "./storage";
import { ACTIVITY_ITEM_META } from "../activityMeta";
import { createTerminalWindow } from "../windows/terminalDetach";
import { getFocusedEditor } from "../editor/focusedEditorRegistry";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ──────────────────────────────────────────────────────────────────
// Shortcut Action Registry
// ──────────────────────────────────────────────────────────────────

/**
 * ShortcutAction — maps shortcut ID to a store action.
 * Used by ShortcutManager to dispatch keyboard shortcuts.
 */
export interface ShortcutAction {
  id: string;
  perform: (store: StoreState) => void;
}

/**
 * All shortcut actions, indexed by shortcut ID.
 * This is the single source of truth for what each shortcut does.
 * Terminal-scope actions are included here; ShortcutManager will
 * only invoke them when the terminal view is active.
 */
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  // ── Global / App ──
  {
    id: "app.commandPalette",
    perform: (store) => store.setCommandPaletteOpen(true),
  },
  { id: "app.newDocument", perform: (store) => store.createDocument() },
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
    },
  },
  {
    id: "app.goToTerminal",
    perform: (store) => {
      store.setSettingsOpen(false);
      store.setActiveSidebarView("terminal");
      if (!store.isSidebarOpen) store.toggleSidebar();
    },
  },
  {
    id: "app.goToBrowser",
    perform: (store) => {
      store.setSettingsOpen(false);
      store.setActiveSidebarView("browser");
    },
  },
  { id: "app.cycleTabLeft", perform: (store) => store.cycleTab(-1) },
  { id: "app.cycleTabRight", perform: (store) => store.cycleTab(1) },
  {
    id: "app.closeTab",
    perform: (store) => {
      // Triggered by the macOS native Window > Close Tab menu item (Cmd+W).
      // PredefinedMenuItem::close_window would trigger the WKWebView's native
      // window-close flow, requiring a separate on_window_event intercept.
      // By using a custom MenuItem the keypress routes through on_menu_event
      // -> "native-command" -> here, same pattern as editor.undo.
      //
      // In a detached child window (e.g. a torn-off document window) there
      // are no workspace tabs to manage — Cmd+W should close that window.
      // `close_window` destroys whichever window invoked it, so in a child
      // window it closes the child, not the main window.
      const currentLabel = getCurrentWindow().label;
      if (currentLabel !== "main") {
        invoke("close_window").catch((err) =>
          console.error("Failed to close window:", err),
        );
        return;
      }
      // Main window: close the current tab, or the whole window when only
      // one tab remains (matching the window-close-requested handler in
      // App.tsx).
      if (!store.activeTabId) return;
      if (store.tabs.length > 1) {
        store.closeTab(store.activeTabId);
      } else {
        invoke("close_window").catch((err) =>
          console.error("Failed to close window:", err),
        );
      }
    },
  },
  { id: "app.toggleDarkMode", perform: (store) => store.toggleDarkMode() },
  { id: "app.setDarkTheme", perform: (store) => store.setThemeMode("dark") },
  { id: "app.setLightTheme", perform: (store) => store.setThemeMode("light") },
  {
    id: "app.setSystemTheme",
    perform: (store) => store.setThemeMode("system"),
  },
  { id: "app.importMarkdown", perform: importMarkdown },

  // ── Terminal Tabs ──
  { id: "terminal.newTab", perform: (store) => store.createSession() },
  {
    id: "terminal.detachTab",
    perform: (store) => {
      // Only detach if there are multiple groups (tabs)
      if (store.groups.length < 2) return;
      if (!store.activeGroupId) return;
      createTerminalWindow(store.activeGroupId);
    },
  },

  // ── Terminal Panes ──
  { id: "terminal.splitPane", perform: (store) => store.splitPane() },
  {
    id: "terminal.closePane",
    perform: (store) => {
      if (store.activeSessionId) store.closePane(store.activeSessionId);
    },
  },
  { id: "terminal.focusPrevPane", perform: (store) => store.focusPrevPane() },
  { id: "terminal.focusNextPane", perform: (store) => store.focusNextPane() },
  { id: "terminal.cycleLayout", perform: (store) => store.cyclePaneLayout() },
  { id: "terminal.movePane", perform: (store) => store.moveActivePane() },

  // ── Editor Blocks ── (handled by TipTap, listed here for completeness)
  {
    id: "editor.insertBlockBelow",
    perform: () => {
      /* TipTap handles */
    },
  },
  {
    id: "editor.insertBlockAbove",
    perform: () => {
      /* TipTap handles */
    },
  },
  {
    id: "editor.inlineCode",
    perform: () => {
      // Triggered by the macOS native Format > Inline Code menu item
      // (Cmd+` is bound there to prevent the OS from swallowing it as the
      // system "cycle windows" accelerator — see docs/bug-graveyard.md #001
      // for the same family of WKWebView quirk). Also fires when the user
      // rebinds the shortcut and triggers it via the global ShortcutManager.
      const editor = getFocusedEditor();
      if (!editor || editor.isDestroyed) return;
      editor.chain().focus().toggleCode().run();
    },
  },
  {
    id: "editor.undo",
    perform: () => {
      // Triggered by the macOS native Edit > Undo menu item (Cmd+Z).
      // PredefinedMenuItem::undo would call WKWebView's native undo, which
      // tracks DOM `input` events (typing) but NOT ProseMirror transactions
      // (e.g. paste via insertContent). We use a custom MenuItem so the
      // event is forwarded here, letting us call ProseMirror's undo which
      // covers ALL editor transactions.
      const editor = getFocusedEditor();
      if (!editor || editor.isDestroyed) return;
      editor.chain().focus().undo().run();
    },
  },
  {
    id: "editor.redo",
    perform: () => {
      // Triggered by the macOS native Edit > Redo menu item (Cmd+Shift+Z).
      // Same rationale as editor.undo above.
      const editor = getFocusedEditor();
      if (!editor || editor.isDestroyed) return;
      editor.chain().focus().redo().run();
    },
  },
];

/**
 * Fast lookup: shortcut ID → action function.
 */
export function getShortcutAction(
  id: string,
): ((store: StoreState) => void) | null {
  const action = SHORTCUT_ACTIONS.find((a) => a.id === id);
  return action?.perform ?? null;
}

/** Execute a shortcut command through the shared action registry. */
export function executeShortcutAction(id: string, store: StoreState): boolean {
  const action = getShortcutAction(id);
  if (!action) {
    console.warn(`[CommandRegistry] No shortcut action registered for "${id}"`);
    return false;
  }
  action(store);
  return true;
}

// ──────────────────────────────────────────────────────────────────

export interface PaletteCommand {
  id: string;
  icon: LucideIcon;
  /** Command name (without category prefix) */
  titleZh: string;
  titleEn: string;
  /** Category name for "Category: Title" display */
  categoryZh: string;
  categoryEn: string;
  /** References a shortcut ID in the SHORTCUTS registry for dynamic display & rebinding */
  shortcutId?: string;
  keywordsZh?: string[];
  keywordsEn?: string[];
  perform: (store: StoreState) => void | Promise<void>;
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/** Triggers the markdown import file picker (same logic as DocumentSidebar). */
async function importMarkdown(store: StoreState) {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const filePath = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown"] }],
  });
  if (!filePath || typeof filePath !== "string") return;
  const bytes = await storage.readFileBytes(filePath);
  const md = new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  const filename = filePath.split(/[/\\]/).pop() ?? "Untitled.md";
  await store.importDocumentFromMarkdown(filename, md);
}

/** Triggers the directory import picker and imports all Markdown files. */
async function importMarkdownDirectory(store: StoreState) {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const dirPath = await open({ directory: true, multiple: false });
  if (!dirPath || typeof dirPath !== "string") return;
  await store.importMarkdownDirectory(dirPath);
}

/** Export the active document to a lossless `.jnote` backup bundle. */
async function exportBundle(store: StoreState) {
  const docId = store.activeDocId;
  if (!docId) return;
  try {
    await store.exportDocumentBundle(docId);
  } catch (e) {
    console.error("Failed to export bundle:", e);
  }
}

/** Import a `.jnote` backup bundle as a new document. */
async function importBundle(store: StoreState) {
  try {
    await store.importDocumentBundle();
  } catch (e) {
    console.error("Failed to import bundle:", e);
  }
}

// ──────────────────────────────────────────────────────────────────
// Command registry
// ──────────────────────────────────────────────────────────────────

export function buildCommands(): PaletteCommand[] {
  return [
    // ── Navigation ──
    {
      id: "nav.documents",
      icon: ACTIVITY_ITEM_META.documents.icon,
      titleZh: "转到文档",
      titleEn: "Go to Documents",
      categoryZh: "导航",
      categoryEn: "Navigation",
      shortcutId: "app.goToDocuments",
      keywordsZh: ["文档", "列表", "侧边栏"],
      keywordsEn: ["docs", "files", "sidebar", "list"],
      perform: (store) => {
        store.setSettingsOpen(false);
        store.setActiveSidebarView("documents");
        if (!store.isSidebarOpen) store.toggleSidebar();
      },
    },
    {
      id: "nav.terminal",
      icon: ACTIVITY_ITEM_META.terminal.icon,
      titleZh: "转到终端",
      titleEn: "Go to Terminal",
      categoryZh: "导航",
      categoryEn: "Navigation",
      shortcutId: "app.goToTerminal",
      keywordsZh: ["终端", "命令行", "shell"],
      keywordsEn: ["term", "shell", "console", "cli"],
      perform: (store) => {
        store.setSettingsOpen(false);
        store.setActiveSidebarView("terminal");
        if (!store.isSidebarOpen) store.toggleSidebar();
      },
    },
    {
      id: "nav.browser",
      icon: ACTIVITY_ITEM_META.browser.icon,
      titleZh: "打开浏览器",
      titleEn: "Open Browser",
      categoryZh: "导航",
      categoryEn: "Navigation",
      shortcutId: "app.goToBrowser",
      keywordsZh: ["浏览器", "网页", "链接", "预览"],
      keywordsEn: ["browser", "web", "link", "preview"],
      perform: (store) => {
        store.setSettingsOpen(false);
        store.setActiveSidebarView("browser");
      },
    },
    {
      id: "nav.settings",
      icon: ACTIVITY_ITEM_META.settings.icon,
      titleZh: "打开设置",
      titleEn: "Open Settings",
      categoryZh: "导航",
      categoryEn: "Navigation",
      shortcutId: "app.openSettings",
      keywordsZh: ["设置", "配置", "首选项"],
      keywordsEn: ["settings", "preferences", "config"],
      perform: (store) => store.setSettingsOpen(true),
    },

    // ── Workspace Tabs ──
    {
      id: "workspace.cycleTabLeft",
      icon: ChevronLeft,
      titleZh: "上一个标签页",
      titleEn: "Previous Tab",
      categoryZh: "标签页",
      categoryEn: "Tabs",
      shortcutId: "app.cycleTabLeft",
      keywordsZh: ["标签", "上一个", "切换", "左"],
      keywordsEn: ["tab", "previous", "switch", "left"],
      perform: (store) => store.cycleTab(-1),
    },
    {
      id: "workspace.cycleTabRight",
      icon: ChevronRight,
      titleZh: "下一个标签页",
      titleEn: "Next Tab",
      categoryZh: "标签页",
      categoryEn: "Tabs",
      shortcutId: "app.cycleTabRight",
      keywordsZh: ["标签", "下一个", "切换", "右"],
      keywordsEn: ["tab", "next", "switch", "right"],
      perform: (store) => store.cycleTab(1),
    },
    {
      id: "workspace.closeTab",
      icon: X,
      titleZh: "关闭当前标签页",
      titleEn: "Close Current Tab",
      categoryZh: "标签页",
      categoryEn: "Tabs",
      shortcutId: "app.closeTab",
      keywordsZh: ["标签", "关闭"],
      keywordsEn: ["tab", "close"],
      perform: (store) => {
        if (store.activeTabId) store.closeTab(store.activeTabId);
      },
    },
    {
      id: "workspace.newTerminalTab",
      icon: SquareTerminal,
      titleZh: "新建终端标签页",
      titleEn: "New Terminal Tab",
      categoryZh: "标签页",
      categoryEn: "Tabs",
      shortcutId: "terminal.newTab",
      keywordsZh: ["终端", "标签", "新建"],
      keywordsEn: ["terminal", "tab", "new"],
      perform: (store) => store.createSession(),
    },

    // ── Document ──
    {
      id: "doc.new",
      icon: FilePlus2,
      titleZh: "新建文档",
      titleEn: "New Document",
      categoryZh: "文档",
      categoryEn: "Document",
      shortcutId: "app.newDocument",
      keywordsZh: ["创建", "新建"],
      keywordsEn: ["create", "add"],
      perform: (store) => store.createDocument(),
    },
    {
      id: "doc.import",
      icon: FileDown,
      titleZh: "导入 Markdown",
      titleEn: "Import Markdown",
      categoryZh: "文档",
      categoryEn: "Document",
      shortcutId: "app.importMarkdown",
      keywordsZh: ["导入", "markdown", "md"],
      keywordsEn: ["import", "md", "markdown"],
      perform: importMarkdown,
    },
    {
      id: "doc.importDirectory",
      icon: FolderDown,
      titleZh: "导入目录",
      titleEn: "Import Directory",
      categoryZh: "文档",
      categoryEn: "Document",
      keywordsZh: ["导入", "目录", "文件夹", "批量"],
      keywordsEn: ["import", "directory", "folder", "batch"],
      perform: importMarkdownDirectory,
    },
    {
      id: "doc.exportBundle",
      icon: Package,
      titleZh: "导出备份 (.jnote)",
      titleEn: "Export Backup (.jnote)",
      categoryZh: "文档",
      categoryEn: "Document",
      keywordsZh: ["导出", "备份", "无损", "打包", "jnote"],
      keywordsEn: ["export", "backup", "lossless", "bundle", "jnote"],
      perform: exportBundle,
    },
    {
      id: "doc.importBundle",
      icon: PackageOpen,
      titleZh: "导入备份 (.jnote)",
      titleEn: "Import Backup (.jnote)",
      categoryZh: "文档",
      categoryEn: "Document",
      keywordsZh: ["导入", "备份", "无损", "jnote"],
      keywordsEn: ["import", "backup", "lossless", "bundle", "jnote"],
      perform: importBundle,
    },

    // ── View ──
    {
      id: "view.sidebar",
      icon: PanelLeft,
      titleZh: "切换侧边栏",
      titleEn: "Toggle Sidebar",
      categoryZh: "视图",
      categoryEn: "View",
      shortcutId: "app.toggleSidebar",
      keywordsZh: ["侧边栏", "显示隐藏"],
      keywordsEn: ["sidebar", "panel"],
      perform: (store) => store.toggleSidebar(),
    },
    {
      id: "view.outline",
      icon: ListTree,
      titleZh: "切换大纲",
      titleEn: "Toggle Outline",
      categoryZh: "视图",
      categoryEn: "View",
      shortcutId: "app.toggleOutline",
      keywordsZh: ["大纲", "目录", "标题"],
      keywordsEn: ["outline", "toc", "headings"],
      perform: (store) => store.toggleOutline(),
    },

    // ── Appearance ──
    {
      id: "appearance.toggleDark",
      icon: SunMoon,
      titleZh: "切换深色模式",
      titleEn: "Toggle Dark Mode",
      categoryZh: "外观",
      categoryEn: "Appearance",
      shortcutId: "app.toggleDarkMode",
      keywordsZh: ["深色", "浅色", "主题", "切换"],
      keywordsEn: ["dark", "light", "theme", "toggle"],
      perform: (store) => store.toggleDarkMode(),
    },
    {
      id: "appearance.dark",
      icon: Moon,
      titleZh: "切换到深色主题",
      titleEn: "Switch to Dark Theme",
      categoryZh: "外观",
      categoryEn: "Appearance",
      shortcutId: "app.setDarkTheme",
      keywordsZh: ["深色", "主题"],
      keywordsEn: ["dark", "theme"],
      perform: (store) => store.setThemeMode("dark"),
    },
    {
      id: "appearance.light",
      icon: Sun,
      titleZh: "切换到浅色主题",
      titleEn: "Switch to Light Theme",
      categoryZh: "外观",
      categoryEn: "Appearance",
      shortcutId: "app.setLightTheme",
      keywordsZh: ["浅色", "主题"],
      keywordsEn: ["light", "theme"],
      perform: (store) => store.setThemeMode("light"),
    },
    {
      id: "appearance.system",
      icon: Monitor,
      titleZh: "跟随系统主题",
      titleEn: "Switch to System Theme",
      categoryZh: "外观",
      categoryEn: "Appearance",
      shortcutId: "app.setSystemTheme",
      keywordsZh: ["系统", "自动", "主题"],
      keywordsEn: ["system", "auto", "theme"],
      perform: (store) => store.setThemeMode("system"),
    },
  ];
}

// ──────────────────────────────────────────────────────────────────
// Scoring & filtering
// ──────────────────────────────────────────────────────────────────

export interface ScoredCommand {
  command: PaletteCommand;
  score: number;
  /** [start, end] match ranges in the title string for highlighting */
  titleMatch: [number, number] | null;
}

function scoreMatch(
  haystack: string,
  query: string,
): { score: number; index: number } {
  const lower = haystack.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) return { score: 0, index: -1 };
  // Earlier match → higher score; exact prefix match gets a bonus
  const positionBonus = (lower.length - idx) / lower.length;
  const prefixBonus = idx === 0 ? 50 : 0;
  return { score: 100 * positionBonus + prefixBonus, index: idx };
}

/**
 * Filters and ranks commands by query against category + title + keywords.
 * Returns commands sorted by descending score.
 */
export function filterCommands(
  commands: PaletteCommand[],
  query: string,
  lang: "zh" | "en",
): ScoredCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return commands.map((command) => ({ command, score: 0, titleMatch: null }));
  }

  const results: ScoredCommand[] = [];

  for (const command of commands) {
    const title = lang === "zh" ? command.titleZh : command.titleEn;
    const category = lang === "zh" ? command.categoryZh : command.categoryEn;
    const keywords =
      lang === "zh" ? (command.keywordsZh ?? []) : (command.keywordsEn ?? []);

    let bestScore = 0;
    let titleMatch: [number, number] | null = null;

    // Title match (highest weight)
    const titleResult = scoreMatch(title, q);
    if (titleResult.score > 0) {
      bestScore = titleResult.score;
      titleMatch = [titleResult.index, titleResult.index + q.length];
    }

    // Category match (medium weight)
    const catResult = scoreMatch(category, q);
    if (catResult.score > 0) {
      const catScore = catResult.score * 0.6;
      if (catScore > bestScore) bestScore = catScore;
    }

    // Keywords match (lower weight)
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
