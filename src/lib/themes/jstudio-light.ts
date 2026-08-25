import type { AppTheme } from './types';

// ──────────────────────────────────────────────────────────────────
// JStudio Light (VSCode Light Modern — current default)
// ──────────────────────────────────────────────────────────────────

export const JSTUDIO_LIGHT: AppTheme = {
  id: 'jstudio-light',
  isDark: false,
  colors: {
    // ── Core backgrounds (栏背景与内容区统一) ──
    'editor-background': '#F8F8F8',
    'sideBar-background': '#F8F8F8',
    'activityBar-background': '#F8F8F8',

    // ── Borders ──
    'sideBar-border': '#C0C0C0',
    'activityBar-border': '#C0C0C0',
    'widget-border': '#C0C0C0',
    'block-border': '#C0C0C0', // 代码块、表格等内容块边框，深于 widget-border 以突出
    'menu-border': '#C0C0C0',  // 浮窗菜单边框，与 block-border 一致，深于 widget-border
    'panel-border': '#C0C0C0',

    // ── Text ──
    'foreground': '#3B3B3B',
    'descriptionForeground': '#3B3B3B',
    'iconForeground': '#3B3B3B',

    // ── Interaction ──
    'focusBorder': '#0052D9',
    'diagram-edge': '#0052D9', // 时序图/画板连线色：品牌蓝
    'button-background': '#0052D9',
    'button-foreground': '#FFFFFF',
    'button-hoverBackground': '#003CAB',
    'buttonSecondary-background': '#EDEDED',
    'buttonSecondary-hoverBackground': '#E0E0E0',
    'buttonSecondary-foreground': '#3B3B3B',

    // ── Inputs ──
    'input-background': '#F8F8F8',
    'input-border': '#C0C0C0',
    'input-foreground': '#3B3B3B',
    'input-placeholderForeground': '#868686',
    'dropdown-background': '#FFFFFF',
    'dropdown-border': '#C0C0C0',

    // ── Tabs ──
    'tab-activeBackground': '#F8F8F8',
    'tab-activeBorderTop': '#0052D9',
    'tab-activeForeground': '#3B3B3B',
    'tab-inactiveBackground': '#FFFFFF',
    'tab-inactiveForeground': '#868686',
    'tab-border': '#E5E5E5',

    // ── Menu / List ──
    'menu-background': '#FFFFFF',
    'menu-hoverBackground': '#F2F2F2',
    'menu-separatorBackground': '#E5E5E5',
    'menu-selectionBackground': '#0052D9',
    'menu-selectionForeground': '#FFFFFF',
    'list-hoverBackground': '#F2F2F2',
    'list-activeSelectionBackground': '#E8E8E8',
    'list-activeSelectionForeground': '#3B3B3B',
    'toolbar-hoverBackground': '#E5E5E5',
    'toolbar-activeBackground': '#E0E0E0',

    // ── Title / Status bars ──
    'titleBar-background': '#F8F8F8',
    'titleBar-border': '#C0C0C0',
    'titleBar-foreground': '#1E1E1E',
    'statusBar-background': '#F8F8F8',
    'statusBar-border': '#C0C0C0',
    'statusBar-foreground': '#3B3B3B',
    'sideBar-foreground': '#3B3B3B',
    'sideBarTitle-foreground': '#3B3B3B',
    'sideBarSectionHeader-background': '#F0F0F0',
    'sideBarSectionHeader-foreground': '#3B3B3B',
    'sideBarSectionHeader-border': '#C0C0C0',
    'activityBar-foreground': '#1F1F1F',

    // ── Selection ──
    'editor-selectionBackground': '#ADD6FF',
    'editor-inactiveSelectionBackground': '#E5EBF1',

    // ── Panels / Widgets ──
    'panel-background': '#F8F8F8',
    'quickInput-background': '#F8F8F8',
    'editorWidget-background': '#F8F8F8',

    // ── Scrollbar ──
    'scrollbarSlider-background': '#00000026',
    'scrollbarSlider-hoverBackground': '#00000040',
    'scrollbarSlider-activeBackground': '#00000052',

    // ── Badges / Progress ──
    'badge-background': '#CCCCCC',
    'badge-foreground': '#3B3B3B',
    'progressBar-background': '#0052D9',

    // ── Links / Quotes / Code ──
    'textLink-foreground': '#0052D9',
    'textLink-activeForeground': '#0052D9',
    'textBlockQuote-background': '#F8F8F8',
    'textBlockQuote-border': '#C0C0C0',
    'textCodeBlock-background': '#F8F8F8',
    'textPreformat-foreground': '#3B3B3B',
    'textPreformat-background': '#0000001F',

    // ── Editor line numbers / guides ──
    'editorLineNumber-foreground': '#6E7681',
    'editorLineNumber-activeForeground': '#171184',
    'editorIndentGuide-background1': '#D3D3D3',
    'editorIndentGuide-activeBackground1': '#939393',

    // ── Gutter (diff markers) ──
    'editorGutter-addedBackground': '#2EA043',
    'editorGutter-deletedBackground': '#F85149',
    'editorGutter-modifiedBackground': '#0052D9',

    // ── Errors / Warnings / Info ──
    'errorForeground': '#F85149',
    'editorWarning-foreground': '#855A00',
    'editorInfo-foreground': '#05838B',

    // ── Symbol icons ──
    'symbolIcon-eventForeground': '#C3672C',
    'symbolIcon-namespaceForeground': '#672179',
    'symbolIcon-fileForeground': '#007ACC',
    'symbolIcon-folderForeground': '#C09553',

    // ── Terminal ANSI ──
    'terminal-ansiGreen': '#00BC00',
    'terminal-ansiBlue': '#0451A5',

    // ── Editor cursor ──
    'editorCursor-foreground': '#0052D9',

    // ── Edit glow (RGB tuple) ──
    'editGlow': '139 92 246', // Violet #8B5CF6

    // ── Table header background (neutral gray, matches sideBarSectionHeader) ──
    'tableHeader-background': '#F0F0F0',
  },
  tokens: {
    'comment': '#008000',
    'keyword': '#0000FF',
    'string': '#A31515',
    'number': '#098658',
    'function': '#795E26',
    'type': '#267F99',
    'variable': '#001080',
    'constant': '#0070C1',
    'operator': '#000000',
    'punctuation': '#000000',
    'invalid': '#CD3131',
    'regexp': '#811F3F',
    'escape': '#EE0000',
    'tag': '#800000',
    'attribute': '#E50000',
    'deleted': '#A31515',
    'inserted': '#098658',
    'changed': '#0451A5',
    'markupHeading': '#800000',
    'markupBold': '#000080',
    'markupItalic': '#800080',
    'markupRaw': '#800000',
    'controlKeyword': '#AF00DB',
  },
};
