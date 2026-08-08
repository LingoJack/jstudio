import type { AppTheme } from './types';

// ──────────────────────────────────────────────────────────────────
// Paper Light (纯白文档风 - clean white with indigo accents, GitHub-like)
// ──────────────────────────────────────────────────────────────────

export const PAPER_LIGHT: AppTheme = {
  id: 'paper-light',
  isDark: false,
  colors: {
    // ── Core backgrounds (3-layer hierarchy) ──
    'editor-background': '#ffffff',
    'sideBar-background': '#fafafa',
    'activityBar-background': '#f6f8fa',

    // ── Borders (soft, document-style) ──
    'sideBar-border': '#e8e8e8',
    'activityBar-border': '#e8e8e8',
    'widget-border': '#e8e8e8',
    'block-border': '#d9d9d9', // 代码块、表格等内容块边框，略深以突出
    'menu-border': '#d9d9d9',  // 浮窗菜单边框，与 block-border 一致
    'panel-border': '#e8e8e8',

    // ── Text ──
    'foreground': '#1a1a1a',
    'descriptionForeground': '#595959',
    'iconForeground': '#595959',

    // ── Interaction ──
    'focusBorder': '#4F46E5',
    'diagram-edge': '#05838B', // 时序图/画板连线色：青（与 jstudio-light 的品牌蓝拉开色相）
    'button-background': '#4F46E5',
    'button-foreground': '#ffffff',
    'button-hoverBackground': '#4338CA',
    'buttonSecondary-background': '#f6f8fa',
    'buttonSecondary-hoverBackground': '#e8e8e8',
    'buttonSecondary-foreground': '#1a1a1a',

    // ── Inputs ──
    'input-background': '#f6f8fa',
    'input-border': '#d9d9d9',
    'input-foreground': '#1a1a1a',
    'input-placeholderForeground': '#8c8c8c',
    'dropdown-background': '#ffffff',
    'dropdown-border': '#d9d9d9',

    // ── Tabs ──
    'tab-activeBackground': '#ffffff',
    'tab-activeBorderTop': '#4F46E5',
    'tab-activeForeground': '#1a1a1a',
    'tab-inactiveBackground': '#fafafa',
    'tab-inactiveForeground': '#8c8c8c',
    'tab-border': '#e8e8e8',

    // ── Menu / List ──
    'menu-background': '#ffffff',
    'menu-hoverBackground': '#f6f8fa',
    'menu-separatorBackground': '#e8e8e8',
    'menu-selectionBackground': '#4F46E5',
    'menu-selectionForeground': '#ffffff',
    'list-hoverBackground': '#f6f8fa',
    'list-activeSelectionBackground': '#EEF2FF',
    'list-activeSelectionForeground': '#1a1a1a',
    'toolbar-hoverBackground': '#f6f8fa',
    'toolbar-activeBackground': '#EEF2FF',

    // ── Title / Status bars ──
    'titleBar-background': '#ffffff',
    'titleBar-border': '#e8e8e8',
    'titleBar-foreground': '#1a1a1a',
    'statusBar-background': '#ffffff',
    'statusBar-border': '#e8e8e8',
    'statusBar-foreground': '#595959',
    'sideBar-foreground': '#1a1a1a',
    'sideBarTitle-foreground': '#1a1a1a',
    'sideBarSectionHeader-background': '#fafafa',
    'sideBarSectionHeader-foreground': '#595959',
    'sideBarSectionHeader-border': '#e8e8e8',
    'activityBar-foreground': '#595959',

    // ── Selection ──
    'editor-selectionBackground': '#EEF2FF',
    'editor-inactiveSelectionBackground': '#f6f8fa',

    // ── Panels / Widgets ──
    'panel-background': '#ffffff',
    'quickInput-background': '#ffffff',
    'editorWidget-background': '#ffffff',

    // ── Scrollbar ──
    'scrollbarSlider-background': '#0000001A',
    'scrollbarSlider-hoverBackground': '#00000033',
    'scrollbarSlider-activeBackground': '#0000004D',

    // ── Badges / Progress ──
    'badge-background': '#EEF2FF',
    'badge-foreground': '#4F46E5',
    'progressBar-background': '#4F46E5',

    // ── Links / Quotes / Code ──
    'textLink-foreground': '#4F46E5',
    'textLink-activeForeground': '#4338CA',
    'textBlockQuote-background': '#f6f8fa',
    'textBlockQuote-border': '#4F46E5',
    'textCodeBlock-background': '#f6f8fa',
    'textPreformat-foreground': '#1a1a1a',
    'textPreformat-background': '#f6f8fa',

    // ── Editor line numbers / guides ──
    'editorLineNumber-foreground': '#8c8c8c',
    'editorLineNumber-activeForeground': '#1a1a1a',
    'editorIndentGuide-background1': '#e8e8e8',
    'editorIndentGuide-activeBackground1': '#d9d9d9',

    // ── Gutter (diff markers) ──
    'editorGutter-addedBackground': '#389e0d',
    'editorGutter-deletedBackground': '#d4380d',
    'editorGutter-modifiedBackground': '#4F46E5',

    // ── Errors / Warnings / Info ──
    'errorForeground': '#cf1322',
    'editorWarning-foreground': '#ad6800',
    'editorInfo-foreground': '#4F46E5',

    // ── Symbol icons ──
    'symbolIcon-eventForeground': '#ad6800',
    'symbolIcon-namespaceForeground': '#531dab',
    'symbolIcon-fileForeground': '#4F46E5',
    'symbolIcon-folderForeground': '#ad6800',

    // ── Terminal ANSI ──
    'terminal-ansiGreen': '#389e0d',
    'terminal-ansiBlue': '#4F46E5',

    // ── Editor cursor ──
    'editorCursor-foreground': '#1a1a1a',

    // ── Edit glow (RGB tuple) ──
    'editGlow': '79 70 229', // Indigo #4F46E5

    // ── Table header background (matches sideBarSectionHeader) ──
    'tableHeader-background': '#fafafa',
  },
  tokens: {
    'comment': '#8c8c8c',
    'keyword': '#4F46E5',
    'string': '#389e0d',
    'number': '#d4380d',
    'function': '#531dab',
    'type': '#05838B',
    'variable': '#1a1a1a',
    'constant': '#4F46E5',
    'operator': '#595959',
    'punctuation': '#595959',
    'invalid': '#cf1322',
    'regexp': '#d4380d',
    'escape': '#ad6800',
    'tag': '#d4380d',
    'attribute': '#4F46E5',
    'deleted': '#cf1322',
    'inserted': '#389e0d',
    'changed': '#4F46E5',
    'markupHeading': '#1a1a1a',
    'markupBold': '#1a1a1a',
    'markupItalic': '#531dab',
    'markupRaw': '#d4380d',
    'controlKeyword': '#531dab',
  },
};
