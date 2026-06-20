/**
 * Lightweight i18n module — no external dependencies.
 *
 * Usage:
 *   import { useI18n } from '../lib/i18n';
 *   const { t } = useI18n();
 *   <p>{t('settings.general')}</p>
 *
 * The current language is stored in the Zustand UI slice and persisted
 * via AppSettings. Components re-render automatically when the language
 * changes because `useI18n()` subscribes to the store.
 */

import { useStore } from '../store/useStore';

export type Language = 'zh' | 'en';

// ──────────────────────────────────────────────────────────────────
// Translation dictionaries
// ──────────────────────────────────────────────────────────────────

export const translations = {
  zh: {
    // ── App / Activity Bar ──
    'app.documents': '文档',
    'app.settings': '设置',
    'app.terminal': '终端',

    // ── Common ──
    'common.moveUp': '上移',
    'common.moveDown': '下移',
    'common.show': '显示',
    'common.hide': '隐藏',

    // ── SearchBar ──
    'search.placeholder': '搜索文档...',

    // ── TitleBar ──
    'titlebar.collapseSidebar': '收起侧边栏',
    'titlebar.expandSidebar': '展开侧边栏',
    'titlebar.moreActions': '更多操作',

    // ── DocumentList ──
    'doclist.allDocuments': '全部文档',
    'doclist.moreActions': '更多操作',
    'doclist.noMatch': '暂无匹配文档',
    'doclist.untitled': '无标题',
    'doclist.newDocument': '新建文档',
    'doclist.importMarkdown': '导入 Markdown',
    'doclist.rename': '重命名',
    'doclist.delete': '删除',
    'doclist.renamePlaceholder': '输入文档名称',

    // ── DocumentList context menu ──
    'doclist.openInFinder': '在访达中显示',
    'doclist.copyPath': '复制路径',
    'doclist.copyRelativePath': '复制相对路径',
    'doclist.copied': '已复制到剪贴板',

    // ── Terminal ──
    'terminal.sessions': '终端会话',
    'terminal.newSession': '新建终端',
    'terminal.close': '关闭',
    'terminal.untitled': '终端',
    'terminal.fontFamily': '字体',
    'terminal.fontFamilyDesc': '终端使用的等宽字体',
    'terminal.cursorStyle': '光标样式',
    'terminal.cursorStyleDesc': '终端光标的形状，拖尾效果会自动跟随光标形状',
    'terminal.cursorStyle_block': '块状',
    'terminal.cursorStyle_underline': '下划线',
    'terminal.cursorStyle_bar': '竖线',
    // Template
    'terminal.templates': '模板',
    'terminal.newTemplate': '新建模板',
    'terminal.noTemplates': '没有模板，点击 + 创建',
    'terminal.edit': '编辑',
    'terminal.delete': '删除',
    'terminal.spawn': '启动会话',
    'terminal.spawnFromTemplate': '从此模板启动',
    'terminal.namePlaceholder': '名称',
    'terminal.clickTemplateHint': '在左侧选择一个模板启动终端',

    // ── Terminal tab context menu / history ──
    'terminal.rename': '重命名',
    'terminal.recentDirs': '最近打开的目录',
    'terminal.clearRecent': '清除历史',
    'terminal.noRecentDirs': '暂无历史记录',

    // ── DocumentOutline ──
    'outline.title': '大纲',
    'outline.empty': '文档中暂无标题',
    'outline.show': '显示大纲',
    'outline.hide': '隐藏大纲',

    // ── BlockEditor ──
    'editor.titlePlaceholder': '文档标题',

    // ── Settings nav ──
    'settings.title': '设置',
    'settings.general': '通用',
    'settings.editor': '编辑器',
    'settings.terminal': '终端',
    'settings.about': '关于',
    'settings.help': '帮助',

    // ── General section ──
    'general.latinFont': '英文字体',
    'general.latinFontDesc': '编辑器和界面的拉丁字母字体',
    'general.cjkFont': '中文字体',
    'general.cjkFontDesc': '编辑器和界面的中文字体',
    'general.fontSize': '字体大小',
    'general.fontSizeDesc': '编辑器正文的基准字号（{min}–{max} px）',
    'general.lineHeight': '行间距',
    'general.lineHeightDesc': '调整编辑器正文行与行之间的间距',
    'general.terminalFontSize': '终端字号',
    'general.terminalFontSizeDesc': '终端的独立字号（{min}–{max} px）',
    'general.dataLocation': '数据存储位置',
    'general.dataLocationDesc': '所有笔记、附件和设置均保存在此目录',
    'general.open': '打开',
    'general.loading': '加载中…',
    'general.language': '语言',
    'general.languageDesc': '选择应用界面的显示语言',
    'general.fontPreview': 'Hello 世界 — 这是字体预览 AaBbCc 你好',

    // ── Appearance section ──
    'appearance.theme': '主题',
    'appearance.themeDesc': '选择应用的外观风格',
    'appearance.light': '浅色',
    'appearance.lightDesc': '始终使用浅色主题',
    'appearance.dark': '深色',
    'appearance.darkDesc': '始终使用深色主题',
    'appearance.system': '跟随系统',
    'appearance.systemDesc': '自动匹配操作系统外观',
    'appearance.activityBarBorder': '图标边框',
    'appearance.activityBarBorderDesc': '为左侧导航栏的选中图标显示彩色边框',
    'appearance.activityBarItems': '活动栏图标',
    'appearance.activityBarItemsDesc': '勾选以显示图标，拖拽手柄可调整顺序（设置始终位于底部）',
    'appearance.activityBarItem_documents': '文档',
    'appearance.activityBarItem_terminal': '终端',
    'appearance.activityBarItem_settings': '设置',
    'appearance.terminalTheme': '终端主题',
    'appearance.terminalThemeDesc': '选择终端配色方案（对齐 kitty 主题）',
    'appearance.terminalThemeDark': '深色终端主题',
    'appearance.terminalThemeDarkDesc': '应用处于深色模式（或跟随系统且系统为深色）时使用此主题',
    'appearance.terminalThemeLight': '浅色终端主题',
    'appearance.terminalThemeLightDesc': '应用处于浅色模式（或跟随系统且系统为浅色）时使用此主题',
    'appearance.terminalTheme_anthropic-dark': 'Anthropic Dark',
    'appearance.terminalTheme_anthropic-light': 'Anthropic Light',
    'appearance.terminalTheme_jstudio-dark': 'JStudio Dark',
    'appearance.terminalTheme_jstudio-light': 'JStudio Light',

    // ── About section ──
    'about.contactAuthor': '联系作者',
    'about.helpGuide': '帮助指南',
    'about.helpGuideDesc': '快速了解 JStudio 的核心功能与操作方式',
    'about.help.editor': '编辑器与块',
    'about.help.slashMenu': '斜杠命令菜单',
    'about.help.slashMenuDesc': '在空行输入 / 即可唤起命令面板，快速插入各种内容块：',
    'about.help.blockTypes': '支持的块类型',
    'about.help.editorShortcuts': '编辑器快捷键',
    'about.help.markdownShortcuts': 'Markdown 快捷输入',
    'about.help.markdownShortcutsDesc': '在行首输入 Markdown 标记，自动转换为对应格式：',
    'about.help.formatToolbar': '选中文字后，会自动浮现格式工具栏，可快速加粗、斜体、删除线、行内代码。',
    'about.help.outline': '点击编辑器右上角的大纲图标，可展开文档大纲，快速跳转到各标题。',
    'about.help.terminal': '终端',
    'about.help.terminalTabs': '标签页管理',
    'about.help.terminalSplit': '分屏与面板',
    'about.help.terminalLayout': '面板布局',
    'about.help.terminalLayoutDesc': '使用快捷键在以下 5 种布局间循环切换：',
    'about.help.cursorTrail': '光标拖尾动画',
    'about.help.cursorTrailDesc': '终端光标移动时，会出现彗星尾巴般的拖尾动画效果（移植自 Kitty 终端）。拖尾形状会自动跟随光标样式（块状 / 下划线 / 竖线）变化。可在「设置 → 终端」中切换光标样式。',
    'about.help.terminalTemplates': '终端模板',
    'about.help.terminalTemplatesDesc': '在「设置 → 终端 → 模板」中可创建终端模板，预设名称和工作目录，方便一键启动特定项目的终端。',

    // ── jcli section ──
    'jcli.title': 'JCLI 命令行工具',
    'jcli.desc': '将 jcli 安装到系统，安装后可在终端中使用 j 命令',
    'jcli.installed': '已安装',
    'jcli.notInstalled': '未安装',
    'jcli.version': '版本',
    'jcli.path': '路径',
    'jcli.install': '安装',
    'jcli.uninstall': '卸载',
    'jcli.reinstall': '重新安装',
    'jcli.installing': '安装中…',
    'jcli.uninstalling': '卸载中…',
    'jcli.installSuccess': 'jcli 已成功安装',
    'jcli.installFailed': '安装失败',
    'jcli.uninstallSuccess': 'jcli 已卸载',
    'jcli.uninstallFailed': '卸载失败',
    'jcli.bundled': '内置版本',
    'jcli.checking': '检查中…',
    'jcli.notBundled': '当前应用未内置 jcli 二进制文件',

    // ── FontDropdown ──
    'font.searchPlaceholder': '搜索字体…',
    'font.noMatch': '无匹配字体',

    // ── FormatBubbleMenu ──
    'bubble.bold': '加粗',
    'bubble.italic': '斜体',
    'bubble.strike': '删除线',
    'bubble.code': '行内代码',

    // ── BlockEditor placeholder ──
    'editor.placeholder': '输入 / 唤起命令菜单…',

    // ── Command Palette ──
    'palette.placeholder': '输入命令名称…',
    'palette.docPlaceholder': '搜索文档…',
    'palette.tabCommands': '命令',
    'palette.tabDocuments': '文档',
    'palette.tabTerminal': '终端会话',
    'palette.tabSettings': '设置',
    'palette.shortcutHint': '⌘P',
    'palette.noResults': '无匹配结果',
    'palette.footer': '↑↓ 导航 · Enter 执行 · Esc 关闭',

    // ── CodeBlockView ──
    'code.copy': '复制代码',
    'code.searchLang': '搜索语言…',
    'code.noLangMatch': '无匹配语言',

    // ── ImageView / FileView ──
    'image.selectImage': '点击选择图片',
    'image.selectFile': '点击选择文件',
    'image.uploadFile': '点击上传文件',
    'image.alignLeft': '左对齐',
    'image.alignCenter': '居中',
    'image.loading': '加载中…',
    'image.cardMode': '切换到卡片模式',
    'image.previewMode': '切换到预览模式',
    'image.zoomNewWindow': '放大预览（新窗口）',
    'image.parsingDocx': '正在解析 DOCX…',
    'image.cannotRead': '无法读取文件内容',

    // ── PreviewWindow ──
    'preview.loading': '正在加载预览…',
    'preview.close': '关闭窗口',
    'preview.unsupported': '此文件类型不支持预览',
    'preview.zoomOut': '缩小',
    'preview.zoomIn': '放大',
    'preview.reset': '重置 (双击图片)',

    // ── TableControls ──
    'table.insertRowAbove': '上方插入行',
    'table.insertRowBelow': '下方插入行',
    'table.deleteRow': '删除行',
    'table.insertColLeft': '左侧插入列',
    'table.insertColRight': '右侧插入列',
    'table.deleteCol': '删除列',
    'table.alignLeft': '左对齐',
    'table.alignCenter': '居中对齐',
    'table.alignRight': '右对齐',
    'table.deleteTable': '删除表格',

    // ── ErrorBoundary ──
    'error.title': '应用遇到了一个错误。',
    'error.retry': '重试',
  },

  en: {
    // ── App / Activity Bar ──
    'app.documents': 'Documents',
    'app.settings': 'Settings',
    'app.terminal': 'Terminal',

    // ── Common ──
    'common.moveUp': 'Move Up',
    'common.moveDown': 'Move Down',
    'common.show': 'Show',
    'common.hide': 'Hide',

    // ── SearchBar ──
    'search.placeholder': 'Search documents...',

    // ── TitleBar ──
    'titlebar.collapseSidebar': 'Collapse Sidebar',
    'titlebar.expandSidebar': 'Expand Sidebar',
    'titlebar.moreActions': 'More Actions',

    // ── DocumentList ──
    'doclist.allDocuments': 'All Documents',
    'doclist.moreActions': 'More Actions',
    'doclist.noMatch': 'No matching documents',
    'doclist.untitled': 'Untitled',
    'doclist.newDocument': 'New Document',
    'doclist.importMarkdown': 'Import Markdown',
    'doclist.rename': 'Rename',
    'doclist.delete': 'Delete',
    'doclist.renamePlaceholder': 'Enter document name',

    // ── DocumentList context menu ──
    'doclist.openInFinder': 'Reveal in Finder',
    'doclist.copyPath': 'Copy Path',
    'doclist.copyRelativePath': 'Copy Relative Path',
    'doclist.copied': 'Copied to clipboard',

    // ── Terminal ──
    'terminal.sessions': 'Terminal Sessions',
    'terminal.newSession': 'New Terminal',
    'terminal.close': 'Close',
    'terminal.untitled': 'Terminal',
    'terminal.fontFamily': 'Font',
    'terminal.fontFamilyDesc': 'Monospace font used by the terminal',
    'terminal.cursorStyle': 'Cursor Style',
    'terminal.cursorStyleDesc': 'Shape of the terminal cursor — the trail follows this shape',
    'terminal.cursorStyle_block': 'Block',
    'terminal.cursorStyle_underline': 'Underline',
    'terminal.cursorStyle_bar': 'Bar',
    // Template
    'terminal.templates': 'Templates',
    'terminal.newTemplate': 'New Template',
    'terminal.noTemplates': 'No templates yet, click + to create',
    'terminal.edit': 'Edit',
    'terminal.delete': 'Delete',
    'terminal.spawn': 'Spawn Session',
    'terminal.spawnFromTemplate': 'Spawn from this template',
    'terminal.namePlaceholder': 'Name',
    'terminal.clickTemplateHint': 'Select a template from the sidebar to start',

    // ── Terminal tab context menu / history ──
    'terminal.rename': 'Rename',
    'terminal.recentDirs': 'Recent Directories',
    'terminal.clearRecent': 'Clear History',
    'terminal.noRecentDirs': 'No recent directories',

    // ── DocumentOutline ──
    'outline.title': 'Outline',
    'outline.empty': 'No headings in this document',
    'outline.show': 'Show outline',
    'outline.hide': 'Hide outline',

    // ── BlockEditor ──
    'editor.titlePlaceholder': 'Document title',

    // ── Settings nav ──
    'settings.title': 'Settings',
    'settings.general': 'General',
    'settings.editor': 'Editor',
    'settings.terminal': 'Terminal',
    'settings.about': 'About',
    'settings.help': 'Help',

    // ── General section ──
    'general.latinFont': 'Latin Font',
    'general.latinFontDesc': 'Font for Latin characters in the editor and UI',
    'general.cjkFont': 'CJK Font',
    'general.cjkFontDesc': 'Font for Chinese characters in the editor and UI',
    'general.fontSize': 'Font Size',
    'general.fontSizeDesc': 'Base font size for the editor body ({min}–{max} px)',
    'general.lineHeight': 'Line Spacing',
    'general.lineHeightDesc': 'Adjust the vertical spacing between lines in the editor',
    'general.terminalFontSize': 'Terminal Font Size',
    'general.terminalFontSizeDesc': 'Independent font size for the terminal ({min}–{max} px)',
    'general.dataLocation': 'Data Location',
    'general.dataLocationDesc': 'All notes, attachments and settings are stored here',
    'general.open': 'Open',
    'general.loading': 'Loading…',
    'general.language': 'Language',
    'general.languageDesc': 'Choose the display language for the interface',
    'general.fontPreview': 'Hello World — Font preview AaBbCc',

    // ── Appearance section ──
    'appearance.theme': 'Theme',
    'appearance.themeDesc': 'Choose the visual style of the application',
    'appearance.light': 'Light',
    'appearance.lightDesc': 'Always use the light theme',
    'appearance.dark': 'Dark',
    'appearance.darkDesc': 'Always use the dark theme',
    'appearance.system': 'System',
    'appearance.systemDesc': 'Automatically match the OS appearance',
    'appearance.activityBarBorder': 'Icon Border',
    'appearance.activityBarBorderDesc': 'Show a colored border on the selected sidebar icon',
    'appearance.activityBarItems': 'Activity Bar Icons',
    'appearance.activityBarItemsDesc': 'Check to show an icon; drag the handle to reorder (Settings always stays at the bottom)',
    'appearance.activityBarItem_documents': 'Documents',
    'appearance.activityBarItem_terminal': 'Terminal',
    'appearance.activityBarItem_settings': 'Settings',
    'appearance.terminalTheme': 'Terminal Theme',
    'appearance.terminalThemeDesc': 'Choose a terminal color scheme (matches kitty themes)',
    'appearance.terminalThemeDark': 'Dark Terminal Theme',
    'appearance.terminalThemeDarkDesc': 'Used when the app is in dark mode (or system mode while OS is dark)',
    'appearance.terminalThemeLight': 'Light Terminal Theme',
    'appearance.terminalThemeLightDesc': 'Used when the app is in light mode (or system mode while OS is light)',
    'appearance.terminalTheme_anthropic-dark': 'Anthropic Dark',
    'appearance.terminalTheme_anthropic-light': 'Anthropic Light',
    'appearance.terminalTheme_jstudio-dark': 'JStudio Dark',
    'appearance.terminalTheme_jstudio-light': 'JStudio Light',

    // ── About section ──
    'about.contactAuthor': 'Contact Author',
    'about.helpGuide': 'Help Guide',
    'about.helpGuideDesc': 'Quickly learn the core features and operations of JStudio',
    'about.help.editor': 'Editor & Blocks',
    'about.help.slashMenu': 'Slash Command Menu',
    'about.help.slashMenuDesc': 'Type / on an empty line to bring up the command palette and quickly insert various blocks:',
    'about.help.blockTypes': 'Supported block types',
    'about.help.editorShortcuts': 'Editor Shortcuts',
    'about.help.markdownShortcuts': 'Markdown Shortcuts',
    'about.help.markdownShortcutsDesc': 'Type Markdown markers at the start of a line to auto-convert:',
    'about.help.formatToolbar': 'Select text to show a floating format toolbar for bold, italic, strikethrough, and inline code.',
    'about.help.outline': 'Click the outline icon in the top-right corner of the editor to open the document outline and jump to headings.',
    'about.help.terminal': 'Terminal',
    'about.help.terminalTabs': 'Tab Management',
    'about.help.terminalSplit': 'Split Panes',
    'about.help.terminalLayout': 'Pane Layouts',
    'about.help.terminalLayoutDesc': 'Cycle through 5 layouts with a shortcut:',
    'about.help.cursorTrail': 'Cursor Trail Animation',
    'about.help.cursorTrailDesc': 'When the terminal cursor moves, a comet-tail trail animation appears (ported from Kitty terminal). The trail shape adapts to the cursor style (block / underline / bar). Cursor style can be changed in Settings > Terminal.',
    'about.help.terminalTemplates': 'Terminal Templates',
    'about.help.terminalTemplatesDesc': 'Create terminal templates in Settings > Terminal > Templates with preset names and working directories for quick project launches.',

    // ── jcli section ──
    'jcli.title': 'JCLI Command Line Tool',
    'jcli.desc': 'Install jcli to your system so you can use the j command in the terminal',
    'jcli.installed': 'Installed',
    'jcli.notInstalled': 'Not installed',
    'jcli.version': 'Version',
    'jcli.path': 'Path',
    'jcli.install': 'Install',
    'jcli.uninstall': 'Uninstall',
    'jcli.reinstall': 'Reinstall',
    'jcli.installing': 'Installing…',
    'jcli.uninstalling': 'Uninstalling…',
    'jcli.installSuccess': 'jcli installed successfully',
    'jcli.installFailed': 'Installation failed',
    'jcli.uninstallSuccess': 'jcli uninstalled',
    'jcli.uninstallFailed': 'Uninstall failed',
    'jcli.bundled': 'Bundled version',
    'jcli.checking': 'Checking…',
    'jcli.notBundled': 'This app does not include a bundled jcli binary',

    // ── FontDropdown ──
    'font.searchPlaceholder': 'Search fonts…',
    'font.noMatch': 'No matching fonts',

    // ── FormatBubbleMenu ──
    'bubble.bold': 'Bold',
    'bubble.italic': 'Italic',
    'bubble.strike': 'Strikethrough',
    'bubble.code': 'Inline code',

    // ── BlockEditor placeholder ──
    'editor.placeholder': 'Type / for commands…',

    // ── Command Palette ──
    'palette.placeholder': 'Type a command name…',
    'palette.docPlaceholder': 'Search documents…',
    'palette.tabCommands': 'Commands',
    'palette.tabDocuments': 'Documents',
    'palette.tabTerminal': 'Sessions',
    'palette.tabSettings': 'Settings',
    'palette.shortcutHint': '⌘P',
    'palette.noResults': 'No matching results',
    'palette.footer': '↑↓ Navigate · Enter Select · Esc Close',

    // ── CodeBlockView ──
    'code.copy': 'Copy code',
    'code.searchLang': 'Search language…',
    'code.noLangMatch': 'No matching languages',

    // ── ImageView / FileView ──
    'image.selectImage': 'Click to select an image',
    'image.selectFile': 'Click to select a file',
    'image.uploadFile': 'Click to upload a file',
    'image.alignLeft': 'Align left',
    'image.alignCenter': 'Center',
    'image.loading': 'Loading…',
    'image.cardMode': 'Switch to card mode',
    'image.previewMode': 'Switch to preview mode',
    'image.zoomNewWindow': 'Zoom (new window)',
    'image.parsingDocx': 'Parsing DOCX…',
    'image.cannotRead': 'Cannot read file content',

    // ── PreviewWindow ──
    'preview.loading': 'Loading preview…',
    'preview.close': 'Close window',
    'preview.unsupported': 'This file type cannot be previewed',
    'preview.zoomOut': 'Zoom out',
    'preview.zoomIn': 'Zoom in',
    'preview.reset': 'Reset (double-click image)',

    // ── TableControls ──
    'table.insertRowAbove': 'Insert row above',
    'table.insertRowBelow': 'Insert row below',
    'table.deleteRow': 'Delete row',
    'table.insertColLeft': 'Insert column left',
    'table.insertColRight': 'Insert column right',
    'table.deleteCol': 'Delete column',
    'table.alignLeft': 'Align left',
    'table.alignCenter': 'Align center',
    'table.alignRight': 'Align right',
    'table.deleteTable': 'Delete table',

    // ── ErrorBoundary ──
    'error.title': 'The app encountered an error.',
    'error.retry': 'Retry',
  },
} as const;

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export type TranslationKey = keyof typeof translations.zh;

// ──────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────

/** Replaces {placeholders} in a string with provided values. */
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

/**
 * React hook that returns a `t()` function bound to the current language.
 * Components using this hook will re-render when the language changes.
 */
export function useI18n() {
  const language = useStore((s) => s.language);
  const dict = translations[language];

  const t = (key: TranslationKey, vars?: Record<string, string | number>): string => {
    const value = dict[key] ?? translations.zh[key] ?? key;
    return interpolate(value, vars);
  };

  return { t, language };
}
