import type { LucideIcon } from 'lucide-react';
import {
  FilePlus2,
  FileDown,
  PanelLeft,
  ListTree,
  Moon,
  Sun,
  Monitor,
  SunMoon,
  FileText,
  TerminalSquare,
  Settings,
} from 'lucide-react';
import type { StoreState } from '../store/storeHelpers';
import { storage } from '../lib/storage';

// ──────────────────────────────────────────────────────────────────
// Types
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
  shortcut?: string;
  keywordsZh?: string[];
  keywordsEn?: string[];
  perform: (store: StoreState) => void | Promise<void>;
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/** Triggers the markdown import file picker (same logic as DocumentList). */
async function importMarkdown(store: StoreState) {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const filePath = await open({
    multiple: false,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] }],
  });
  if (!filePath || typeof filePath !== 'string') return;
  const bytes = await storage.readFileBytes(filePath);
  const md = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  const filename = filePath.split(/[/\\]/).pop() ?? 'Untitled.md';
  await store.importDocumentFromMarkdown(filename, md);
}

// ──────────────────────────────────────────────────────────────────
// Command registry
// ──────────────────────────────────────────────────────────────────

export function buildCommands(): PaletteCommand[] {
  return [
    // ── Navigation ──
    {
      id: 'nav.documents',
      icon: FileText,
      titleZh: '转到文档',
      titleEn: 'Go to Documents',
      categoryZh: '导航',
      categoryEn: 'Navigation',
      keywordsZh: ['文档', '列表', '侧边栏'],
      keywordsEn: ['docs', 'files', 'sidebar', 'list'],
      perform: (store) => {
        store.setSettingsOpen(false);
        store.setActiveSidebarView('documents');
        if (!store.isSidebarOpen) store.toggleSidebar();
      },
    },
    {
      id: 'nav.terminal',
      icon: TerminalSquare,
      titleZh: '转到终端',
      titleEn: 'Go to Terminal',
      categoryZh: '导航',
      categoryEn: 'Navigation',
      keywordsZh: ['终端', '命令行', 'shell'],
      keywordsEn: ['term', 'shell', 'console', 'cli'],
      perform: (store) => {
        store.setSettingsOpen(false);
        store.setActiveSidebarView('terminal');
        if (!store.isSidebarOpen) store.toggleSidebar();
      },
    },
    {
      id: 'nav.settings',
      icon: Settings,
      titleZh: '打开设置',
      titleEn: 'Open Settings',
      categoryZh: '导航',
      categoryEn: 'Navigation',
      keywordsZh: ['设置', '配置', '首选项'],
      keywordsEn: ['settings', 'preferences', 'config'],
      perform: (store) => store.setSettingsOpen(true),
    },

    // ── Document ──
    {
      id: 'doc.new',
      icon: FilePlus2,
      titleZh: '新建文档',
      titleEn: 'New Document',
      categoryZh: '文档',
      categoryEn: 'Document',
      shortcut: '⌘N',
      keywordsZh: ['创建', '新建'],
      keywordsEn: ['create', 'add'],
      perform: (store) => store.createDocument(),
    },
    {
      id: 'doc.import',
      icon: FileDown,
      titleZh: '导入 Markdown',
      titleEn: 'Import Markdown',
      categoryZh: '文档',
      categoryEn: 'Document',
      keywordsZh: ['导入', 'markdown', 'md'],
      keywordsEn: ['import', 'md', 'markdown'],
      perform: importMarkdown,
    },

    // ── View ──
    {
      id: 'view.sidebar',
      icon: PanelLeft,
      titleZh: '切换侧边栏',
      titleEn: 'Toggle Sidebar',
      categoryZh: '视图',
      categoryEn: 'View',
      shortcut: '⌘B',
      keywordsZh: ['侧边栏', '显示隐藏'],
      keywordsEn: ['sidebar', 'panel'],
      perform: (store) => store.toggleSidebar(),
    },
    {
      id: 'view.outline',
      icon: ListTree,
      titleZh: '切换大纲',
      titleEn: 'Toggle Outline',
      categoryZh: '视图',
      categoryEn: 'View',
      keywordsZh: ['大纲', '目录', '标题'],
      keywordsEn: ['outline', 'toc', 'headings'],
      perform: (store) => store.toggleOutline(),
    },

    // ── Appearance ──
    {
      id: 'appearance.toggleDark',
      icon: SunMoon,
      titleZh: '切换深色模式',
      titleEn: 'Toggle Dark Mode',
      categoryZh: '外观',
      categoryEn: 'Appearance',
      keywordsZh: ['深色', '浅色', '主题', '切换'],
      keywordsEn: ['dark', 'light', 'theme', 'toggle'],
      perform: (store) => store.toggleDarkMode(),
    },
    {
      id: 'appearance.dark',
      icon: Moon,
      titleZh: '切换到深色主题',
      titleEn: 'Switch to Dark Theme',
      categoryZh: '外观',
      categoryEn: 'Appearance',
      keywordsZh: ['深色', '主题'],
      keywordsEn: ['dark', 'theme'],
      perform: (store) => store.setThemeMode('dark'),
    },
    {
      id: 'appearance.light',
      icon: Sun,
      titleZh: '切换到浅色主题',
      titleEn: 'Switch to Light Theme',
      categoryZh: '外观',
      categoryEn: 'Appearance',
      keywordsZh: ['浅色', '主题'],
      keywordsEn: ['light', 'theme'],
      perform: (store) => store.setThemeMode('light'),
    },
    {
      id: 'appearance.system',
      icon: Monitor,
      titleZh: '跟随系统主题',
      titleEn: 'Switch to System Theme',
      categoryZh: '外观',
      categoryEn: 'Appearance',
      keywordsZh: ['系统', '自动', '主题'],
      keywordsEn: ['system', 'auto', 'theme'],
      perform: (store) => store.setThemeMode('system'),
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

function scoreMatch(haystack: string, query: string): { score: number; index: number } {
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
  lang: 'zh' | 'en',
): ScoredCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return commands.map((command) => ({ command, score: 0, titleMatch: null }));
  }

  const results: ScoredCommand[] = [];

  for (const command of commands) {
    const title = lang === 'zh' ? command.titleZh : command.titleEn;
    const category = lang === 'zh' ? command.categoryZh : command.categoryEn;
    const keywords =
      lang === 'zh' ? command.keywordsZh ?? [] : command.keywordsEn ?? [];

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
