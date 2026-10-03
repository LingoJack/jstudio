import type { AppTheme } from './types';

// ──────────────────────────────────────────────────────────────────
// Paper Dark (墨夜青调 — paper-light 的同语言暗色姊妹)
// paper-light 是「纯白文档风 + 青描边」；暗转时纸面换成青调墨夜
// #0F1516，青色描边语言整体降为深青 (#1F565B chrome / #2E7A81 内容
// 卡片，暗色下"突出"= 提亮一档)，强调升为亮青 #3FB6BF。
// 行内代码沿用品牌靛系统的暗色极微染（与 ink-dark 同款处理）。
// ──────────────────────────────────────────────────────────────────

export const PAPER_DARK: AppTheme = {
  id: 'paper-dark',
  isDark: true,
  colors: {
    // ── Core backgrounds (青调墨夜，栏背景与内容区统一) ──
    'editor-background': '#0F1516',
    'sideBar-background': '#0F1516',
    'activityBar-background': '#0F1516',

    // ── Borders (paper-light 的青描边语言，暗化两档) ──
    'sideBar-border': '#1F565B',
    'activityBar-border': '#1F565B',
    'widget-border': '#1F565B',
    'block-border': '#2E7A81', // 代码块、表格等内容块边框：比 chrome 亮一档
    'menu-border': 'var(--jstudio-block-line)',
    'panel-border': '#1F565B',

    // ── Text ──
    'foreground': '#D7E2E0',
    'descriptionForeground': '#8CA39F',
    'iconForeground': '#8CA39F',

    // ── Interaction ──
    'focusBorder': '#3FB6BF',
    'diagram-edge': '#3FB6BF', // 时序图/画板连线色：亮青
    'button-background': '#3FB6BF',
    'button-foreground': '#06211F',
    'button-hoverBackground': '#35A0A8',
    'buttonSecondary-background': '#1E2C2B',
    'buttonSecondary-hoverBackground': '#243635',
    'buttonSecondary-foreground': '#D7E2E0',

    // ── Inputs ──
    'input-background': '#131B1B',
    'input-border': '#2E7A81',
    'input-foreground': '#D7E2E0',
    'input-placeholderForeground': '#5F7572',
    'dropdown-background': '#131B1B',
    'dropdown-border': '#2E7A81',

    // ── Tabs ──
    'tab-activeBackground': '#0F1516',
    'tab-activeBorderTop': '#3FB6BF',
    'tab-activeForeground': '#EAF2F0',
    'tab-inactiveBackground': '#131B1B',
    'tab-inactiveForeground': '#8CA39F',
    'tab-border': '#1F565B',

    // ── Menu / List ──
    'menu-background': '#131B1B',
    'menu-hoverBackground': '#1A2626',
    'menu-separatorBackground': '#243635',
    'menu-selectionBackground': '#3FB6BF',
    'menu-selectionForeground': '#06211F',
    'list-hoverBackground': '#1A2626',
    'list-activeSelectionBackground': '#12494F',
    'list-activeSelectionForeground': '#D7E2E0',
    'toolbar-hoverBackground': '#1A2626',
    'toolbar-activeBackground': '#243635',

    // ── Title / Status bars ──
    'titleBar-background': '#131B1B',
    'titleBar-border': '#1F565B',
    'titleBar-foreground': '#D7E2E0',
    'statusBar-background': '#131B1B',
    'statusBar-border': '#1F565B',
    'statusBar-foreground': '#8CA39F',
    'sideBar-foreground': '#D7E2E0',
    'sideBarTitle-foreground': '#D7E2E0',
    'sideBarSectionHeader-background': '#16201F',
    'sideBarSectionHeader-foreground': '#D7E2E0',
    'sideBarSectionHeader-border': '#1F565B',
    'activityBar-foreground': '#8CA39F',

    // ── Selection ──
    'editor-selectionBackground': '#12494F',
    'editor-inactiveSelectionBackground': '#1A2626',

    // ── Panels / Widgets ──
    'panel-background': '#0F1516',
    'quickInput-background': '#131B1B',
    'editorWidget-background': '#16201F',

    // ── Scrollbar ──
    'scrollbarSlider-background': '#79797966',
    'scrollbarSlider-hoverBackground': '#79797999',
    'scrollbarSlider-activeBackground': '#797979AA',

    // ── Badges / Progress ──
    'badge-background': '#12494F',
    'badge-foreground': '#7ADCE4',
    'progressBar-background': '#3FB6BF',

    // ── Links / Quotes / Code ──
    'textLink-foreground': '#4FC3CC',
    'textLink-activeForeground': '#6FD4DB',
    'textBlockQuote-background': '#16201F',
    'textBlockQuote-border': '#2E7A81',
    'textCodeBlock-background': '#16201F',
    'textPreformat-foreground': '#97A5E8', // 行内代码·品牌靛暗色极微染（同 ink-dark）
    'textPreformat-background': '#97A5E814',

    // ── Editor line numbers / guides ──
    'editorLineNumber-foreground': '#5F7572',
    'editorLineNumber-activeForeground': '#D7E2E0',
    'editorIndentGuide-background1': '#243635',
    'editorIndentGuide-activeBackground1': '#3FB6BF',

    // ── Gutter (diff markers) ──
    'editorGutter-addedBackground': '#57C579',
    'editorGutter-deletedBackground': '#E5766A',
    'editorGutter-modifiedBackground': '#3FB6BF',

    // ── Errors / Warnings / Info ──
    'errorForeground': '#E5766A',
    'editorWarning-foreground': '#D9A44A',
    'editorInfo-foreground': '#3FB6BF',

    // ── Symbol icons ──
    'symbolIcon-eventForeground': '#E08A5A',
    'symbolIcon-namespaceForeground': '#B79BE0',
    'symbolIcon-fileForeground': '#4FC3CC',
    'symbolIcon-folderForeground': '#D9A44A',

    // ── Terminal ANSI ──
    'terminal-ansiGreen': '#57C579',
    'terminal-ansiBlue': '#3FB6BF',

    // ── Editor cursor ──
    'editorCursor-foreground': '#3FB6BF',

    // ── Edit glow (RGB tuple) ──
    'editGlow': '151 165 232', // Indigo #97A5E8 — 与 focus 异色（品牌靛暗版）

    // ── Table header background ──
    'tableHeader-background': '#16201F',
  },
  tokens: {
    'comment': '#7E938F',
    'keyword': '#4FC3CC',
    'string': '#8CCB8F',
    'number': '#D9C08A',
    'function': '#B79BE0',
    'type': '#6FC7BD',
    'variable': '#D7E2E0',
    'constant': '#55C8D1',
    'operator': '#A9BCB8',
    'punctuation': '#6E8380',
    'invalid': '#E5766A',
    'regexp': '#E08A5A',
    'escape': '#D9A44A',
    'tag': '#E5766A',
    'attribute': '#8CCB8F',
    'deleted': '#E5766A',
    'inserted': '#57C579',
    'changed': '#4FC3CC',
    'markupHeading': '#EAF2F0',
    'markupBold': '#4FC3CC',
    'markupItalic': '#B79BE0',
    'markupRaw': '#D9C08A',
    'controlKeyword': '#B79BE0',
  },
  customCss: `
/* ── 指示器墨色：读头（大纲/滚动）与表格边缘箭头等"位置指示"的统一墨色（暗色下 = 墨白） ── */
:root {
  --jstudio-indicator-ink: #D7E2E0;
}
`,
};
