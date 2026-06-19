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

    // ── SearchBar ──
    'search.placeholder': '搜索文档...',

    // ── DocumentList ──
    'doclist.allDocuments': '全部文档',
    'doclist.noMatch': '暂无匹配文档',
    'doclist.untitled': '无标题',
    'doclist.newDocument': '新建文档',
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
    'settings.appearance': '外观',
    'settings.about': '关于',

    // ── General section ──
    'general.latinFont': '英文字体',
    'general.latinFontDesc': '编辑器和界面的拉丁字母字体',
    'general.cjkFont': '中文字体',
    'general.cjkFontDesc': '编辑器和界面的中文字体',
    'general.fontSize': '字体大小',
    'general.fontSizeDesc': '编辑器正文的基准字号（{min}–{max} px）',
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
    'appearance.terminalTheme': '终端主题',
    'appearance.terminalThemeDesc': '选择终端配色方案（对齐 kitty 主题）',
    'appearance.terminalTheme_anthropic-dark': 'Anthropic Dark',
    'appearance.terminalTheme_anthropic-light': 'Anthropic Light',
    'appearance.terminalTheme_jstudio-dark': 'JStudio Dark',
    'appearance.terminalTheme_jstudio-light': 'JStudio Light',

    // ── About section ──
    'about.contactAuthor': '联系作者',

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

    // ── SearchBar ──
    'search.placeholder': 'Search documents...',

    // ── DocumentList ──
    'doclist.allDocuments': 'All Documents',
    'doclist.noMatch': 'No matching documents',
    'doclist.untitled': 'Untitled',
    'doclist.newDocument': 'New Document',
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
    'settings.appearance': 'Appearance',
    'settings.about': 'About',

    // ── General section ──
    'general.latinFont': 'Latin Font',
    'general.latinFontDesc': 'Font for Latin characters in the editor and UI',
    'general.cjkFont': 'CJK Font',
    'general.cjkFontDesc': 'Font for Chinese characters in the editor and UI',
    'general.fontSize': 'Font Size',
    'general.fontSizeDesc': 'Base font size for the editor body ({min}–{max} px)',
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
    'appearance.terminalTheme': 'Terminal Theme',
    'appearance.terminalThemeDesc': 'Choose a terminal color scheme (matches kitty themes)',
    'appearance.terminalTheme_anthropic-dark': 'Anthropic Dark',
    'appearance.terminalTheme_anthropic-light': 'Anthropic Light',
    'appearance.terminalTheme_jstudio-dark': 'JStudio Dark',
    'appearance.terminalTheme_jstudio-light': 'JStudio Light',

    // ── About section ──
    'about.contactAuthor': 'Contact Author',

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
