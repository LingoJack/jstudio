import type { AppTheme } from './types';

// ──────────────────────────────────────────────────────────────────
// Paper Light (纯白文档风 - clean white with teal accents, GitHub-like)
// ──────────────────────────────────────────────────────────────────

export const PAPER_LIGHT: AppTheme = {
  id: 'paper-light',
  isDark: false,
  colors: {
    // ── Core backgrounds (栏背景与内容区统一) ──
    'editor-background': '#ffffff',
    'sideBar-background': '#ffffff',
    'activityBar-background': '#ffffff',

    // ── Borders (teal, document-style) ──
    'sideBar-border': '#05838B',
    'activityBar-border': '#05838B',
    'widget-border': '#05838B',
    'block-border': '#034F55', // 代码块、表格等内容块边框，略深以突出
    'menu-border': 'var(--jstudio-block-line-strong)',  // 浮窗菜单边框，随 block-border 软化
    'panel-border': '#05838B',

    // ── Text ──
    'foreground': '#1a1a1a',
    'descriptionForeground': '#595959',
    'iconForeground': '#595959',

    // ── Interaction ──
    'focusBorder': '#05838B',
    'diagram-edge': '#05838B', // 时序图/画板连线色：青（与 jstudio-light 的品牌蓝拉开色相）
    'button-background': '#05838B',
    'button-foreground': '#ffffff',
    'button-hoverBackground': '#036B72',
    'buttonSecondary-background': '#f6f8fa',
    'buttonSecondary-hoverBackground': '#ECECEC',
    'buttonSecondary-foreground': '#1a1a1a',

    // ── Inputs ──
    'input-background': '#f6f8fa',
    'input-border': '#034F55',
    'input-foreground': '#1a1a1a',
    'input-placeholderForeground': '#8c8c8c',
    'dropdown-background': '#ffffff',
    'dropdown-border': '#034F55',

    // ── Tabs ──
    'tab-activeBackground': '#ffffff',
    'tab-activeBorderTop': '#05838B',
    'tab-activeForeground': '#1a1a1a',
    'tab-inactiveBackground': '#fafafa',
    'tab-inactiveForeground': '#8c8c8c',
    'tab-border': '#05838B',

    // ── Menu / List ──
    'menu-background': '#ffffff',
    'menu-hoverBackground': '#f6f8fa',
    'menu-separatorBackground': '#D9D9D9',
    'menu-selectionBackground': '#05838B',
    'menu-selectionForeground': '#ffffff',
    'list-hoverBackground': '#f6f8fa',
    'list-activeSelectionBackground': '#B8ECE8',
    'list-activeSelectionForeground': '#1a1a1a',
    'toolbar-hoverBackground': '#f6f8fa',
    'toolbar-activeBackground': '#B8ECE8',

    // ── Title / Status bars ──
    'titleBar-background': '#ffffff',
    'titleBar-border': '#05838B',
    'titleBar-foreground': '#1a1a1a',
    'statusBar-background': '#ffffff',
    'statusBar-border': '#05838B',
    'statusBar-foreground': '#595959',
    'sideBar-foreground': '#1a1a1a',
    'sideBarTitle-foreground': '#1a1a1a',
    'sideBarSectionHeader-background': '#fafafa',
    'sideBarSectionHeader-foreground': '#595959',
    'sideBarSectionHeader-border': '#05838B',
    'activityBar-foreground': '#595959',

    // ── Selection ──
    'editor-selectionBackground': '#B8ECE8',
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
    'badge-background': '#B8ECE8',
    'badge-foreground': '#05838B',
    'progressBar-background': '#05838B',

    // ── Links / Quotes / Code ──
    'textLink-foreground': '#05838B',
    'textLink-activeForeground': '#036B72',
    'textBlockQuote-background': '#f6f8fa',
    'textBlockQuote-border': '#05838B',
    'textCodeBlock-background': '#f6f8fa',
    'textPreformat-foreground': '#1a1a1a',
    'textPreformat-background': '#f6f8fa',

    // ── Editor line numbers / guides ──
    'editorLineNumber-foreground': '#8c8c8c',
    'editorLineNumber-activeForeground': '#1a1a1a',
    'editorIndentGuide-background1': '#B8ECE8',
    'editorIndentGuide-activeBackground1': '#8FD9D3',

    // ── Gutter (diff markers) ──
    'editorGutter-addedBackground': '#389e0d',
    'editorGutter-deletedBackground': '#d4380d',
    'editorGutter-modifiedBackground': '#05838B',

    // ── Errors / Warnings / Info ──
    'errorForeground': '#cf1322',
    'editorWarning-foreground': '#ad6800',
    'editorInfo-foreground': '#05838B',

    // ── Symbol icons ──
    'symbolIcon-eventForeground': '#ad6800',
    'symbolIcon-namespaceForeground': '#531dab',
    'symbolIcon-fileForeground': '#05838B',
    'symbolIcon-folderForeground': '#ad6800',

    // ── Terminal ANSI ──
    'terminal-ansiGreen': '#389e0d',
    'terminal-ansiBlue': '#05838B',

    // ── Editor cursor ──
    'editorCursor-foreground': '#1a1a1a',

    // ── Edit glow (RGB tuple) ──
    'editGlow': '5 131 139', // Teal #05838B

    // ── Table header background (matches sideBarSectionHeader) ──
    'tableHeader-background': '#fafafa',
  },
  tokens: {
    'comment': '#8c8c8c',
    'keyword': '#05838B',
    'string': '#389e0d',
    'number': '#d4380d',
    'function': '#531dab',
    'type': '#034F55',
    'variable': '#1a1a1a',
    'constant': '#05838B',
    'operator': '#595959',
    'punctuation': '#595959',
    'invalid': '#cf1322',
    'regexp': '#d4380d',
    'escape': '#ad6800',
    'tag': '#d4380d',
    'attribute': '#05838B',
    'deleted': '#cf1322',
    'inserted': '#389e0d',
    'changed': '#05838B',
    'markupHeading': '#1a1a1a',
    'markupBold': '#1a1a1a',
    'markupItalic': '#531dab',
    'markupRaw': '#d4380d',
    'controlKeyword': '#531dab',
  },
};
