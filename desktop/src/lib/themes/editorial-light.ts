import type { AppTheme } from './types';

// ──────────────────────────────────────────────────────────────────
// Editorial Light (杂志印刷风 — 纯白纸面 + 黑描边卡片 + 宝蓝点缀)
// 灵感来自 Jev-as-a-Judge 专题页：整体纯白，栏背景与内容区统一；
// 卡片感由编辑器内容块（表格/代码块/引用块）的近黑实线描边承担；
// 宝蓝只用于编号、眉标、链接等强调；奶油色做小面积点缀（次级按钮）。
// 除色板外，还通过 customCss 注入结构覆盖：
//   - 内容块（代码块/表格/文件块/引用块）改为 2px 墨黑实线圆角卡片
//   - H2 前渲染蓝色圆形章节编号徽章（对应文章的 01/02 圆形序号）
// ──────────────────────────────────────────────────────────────────

export const EDITORIAL_LIGHT: AppTheme = {
  id: 'editorial-light',
  isDark: false,
  colors: {
    // ── Core backgrounds (纯白纸面，栏背景与内容区统一，靠黑描边区分结构) ──
    'editor-background': '#ffffff',
    'sideBar-background': '#ffffff',
    'activityBar-background': '#ffffff',

    // ── Borders (近黑描边，卡片的勾勒线) ──
    'sideBar-border': '#1A1A1A',
    'activityBar-border': '#1A1A1A',
    'widget-border': '#1A1A1A',
    'block-border': '#1A1A1A', // 代码块、表格等内容块边框：黑描边
    'menu-border': 'var(--jstudio-block-line)',  // 浮窗菜单边框，随 block-border 软化
    'panel-border': '#1A1A1A',

    // ── Text (墨黑 + 灰描述) ──
    'foreground': '#1A1A1A',
    'descriptionForeground': '#5C5A55',
    'iconForeground': '#5C5A55',

    // ── Interaction (宝蓝强调) ──
    'focusBorder': '#2B4BD7',
    'diagram-edge': '#2B4BD7', // 时序图/画板连线色：宝蓝
    'button-background': '#2B4BD7',
    'button-foreground': '#ffffff',
    'button-hoverBackground': '#1F38B2',
    'buttonSecondary-background': '#F5EFDC', // 奶油色，对应文章回顶按钮
    'buttonSecondary-hoverBackground': '#EDE5CB',
    'buttonSecondary-foreground': '#1A1A1A',

    // ── Inputs ──
    'input-background': '#ffffff',
    'input-border': '#1A1A1A',
    'input-foreground': '#1A1A1A',
    'input-placeholderForeground': '#9A968E',
    'dropdown-background': '#ffffff',
    'dropdown-border': '#1A1A1A',

    // ── Tabs ──
    'tab-activeBackground': '#ffffff',
    'tab-activeBorderTop': '#2B4BD7',
    'tab-activeForeground': '#1A1A1A',
    'tab-inactiveBackground': '#F1F0EB',
    'tab-inactiveForeground': '#9A968E',
    'tab-border': '#1A1A1A',

    // ── Menu / List ──
    'menu-background': '#ffffff',
    'menu-hoverBackground': '#F4F3F0',
    'menu-separatorBackground': '#E2E0DA',
    'menu-selectionBackground': '#2B4BD7',
    'menu-selectionForeground': '#ffffff',
    'list-hoverBackground': '#ECEAE4',
    'list-activeSelectionBackground': '#DEE5FA',
    'list-activeSelectionForeground': '#1A1A1A',
    'toolbar-hoverBackground': '#ECEAE4',
    'toolbar-activeBackground': '#DEE5FA',

    // ── Title / Status bars ──
    'titleBar-background': '#ffffff',
    'titleBar-border': '#1A1A1A',
    'titleBar-foreground': '#1A1A1A',
    'statusBar-background': '#ffffff',
    'statusBar-border': '#1A1A1A',
    'statusBar-foreground': '#5C5A55',
    'sideBar-foreground': '#1A1A1A',
    'sideBarTitle-foreground': '#1A1A1A',
    'sideBarSectionHeader-background': '#ECEAE4',
    'sideBarSectionHeader-foreground': '#5C5A55',
    'sideBarSectionHeader-border': '#1A1A1A',
    'activityBar-foreground': '#5C5A55',

    // ── Selection ──
    'editor-selectionBackground': '#D6DEF9',
    'editor-inactiveSelectionBackground': '#EFEDE8',

    // ── Panels / Widgets ──
    'panel-background': '#ffffff',
    'quickInput-background': '#ffffff',
    'editorWidget-background': '#ffffff',

    // ── Scrollbar ──
    'scrollbarSlider-background': '#0000001F',
    'scrollbarSlider-hoverBackground': '#00000038',
    'scrollbarSlider-activeBackground': '#00000052',

    // ── Badges / Progress ──
    'badge-background': '#E4E9FB',
    'badge-foreground': '#1F38B2',
    'progressBar-background': '#2B4BD7',

    // ── Links / Quotes / Code ──
    'textLink-foreground': '#2B4BD7',
    'textLink-activeForeground': '#1F38B2',
    'textBlockQuote-background': '#F4F3F0',
    'textBlockQuote-border': '#2B4BD7',
    'textCodeBlock-background': '#F4F3F0',
    'textPreformat-foreground': '#1A1A1A',
    'textPreformat-background': '#ECEAE4',

    // ── Editor line numbers / guides ──
    'editorLineNumber-foreground': '#9A968E',
    'editorLineNumber-activeForeground': '#1A1A1A',
    'editorIndentGuide-background1': '#DDDBD4',
    'editorIndentGuide-activeBackground1': '#8FA3F0',

    // ── Gutter (diff markers) ──
    'editorGutter-addedBackground': '#2E7D32',
    'editorGutter-deletedBackground': '#C0392B',
    'editorGutter-modifiedBackground': '#2B4BD7',

    // ── Errors / Warnings / Info ──
    'errorForeground': '#C0392B',
    'editorWarning-foreground': '#9A6B15',
    'editorInfo-foreground': '#2B4BD7',

    // ── Symbol icons ──
    'symbolIcon-eventForeground': '#9A6B15',
    'symbolIcon-namespaceForeground': '#7E5AA6',
    'symbolIcon-fileForeground': '#2B4BD7',
    'symbolIcon-folderForeground': '#9A6B15',

    // ── Terminal ANSI ──
    'terminal-ansiGreen': '#2E7D32',
    'terminal-ansiBlue': '#2B4BD7',

    // ── Editor cursor ──
    'editorCursor-foreground': '#2B4BD7', // 宝蓝光标，呼应编号与链接

    // ── Edit glow (RGB tuple) ──
    'editGlow': '43 75 215', // Royal blue #2B4BD7

    // ── Table header background (page gray) ──
    'tableHeader-background': '#F4F3F0',
  },
  tokens: {
    'comment': '#9A968E',
    'keyword': '#2B4BD7',
    'string': '#2E7D32',
    'number': '#9A6B15',
    'function': '#7E5AA6',
    'type': '#38746A',
    'variable': '#1A1A1A',
    'constant': '#1F38B2',
    'operator': '#5C5A55',
    'punctuation': '#9A968E',
    'invalid': '#C0392B',
    'regexp': '#9A6B15',
    'escape': '#1F38B2',
    'tag': '#C0392B',
    'attribute': '#2B4BD7',
    'deleted': '#C0392B',
    'inserted': '#2E7D32',
    'changed': '#2B4BD7',
    'markupHeading': '#1A1A1A', // 标题用墨黑，对应文章黑色大标题
    'markupBold': '#1A1A1A',
    'markupItalic': '#7E5AA6',
    'markupRaw': '#9A6B15',
    'controlKeyword': '#7E5AA6',
  },
  customCss: `
/* ── Editorial Light：结构覆盖（仅本主题激活期间注入） ── */

/* 内容块线条：强线改为实心墨黑（默认是 55% 半透明灰），
   弱线（表格行分隔等）加深一档。 */
:root {
  --jstudio-block-line-strong: #1a1a1a;
  --jstudio-block-line: color-mix(in srgb, #1a1a1a 45%, transparent);
}

/* 代码块 / 文件块 / 表格：2px 墨黑描边圆角卡片（对齐文章卡片风格） */
.code-block-figure,
.file-block-figure,
.ProseMirror .tableWrapper {
  border-width: 2px;
}
/* NodeView 代码卡片内部的 pre 不再套框，避免双框 */
.code-block-wrapper pre {
  border: none;
}
/* 非 NodeView 的裸 pre（兜底渲染）同样走黑框卡片 */
.ProseMirror > pre {
  border: 2px solid #1a1a1a;
  border-radius: 12px;
}

/* 引用块：墨黑描边圆角卡片 */
blockquote {
  border: 2px solid #1a1a1a;
  border-radius: 12px;
}

/* H2 章节编号徽章：蓝色圆形 01/02（对应文章章节序号）。
   伪元素内容不进入文档，复制/导出不受影响。 */
.ProseMirror { counter-reset: editorial-h2; }
.ProseMirror h2::before {
  counter-increment: editorial-h2;
  content: counter(editorial-h2, decimal-leading-zero);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.9em;
  height: 1.9em;
  padding: 0 0.25em;
  margin-right: 0.55em;
  background: #2b4bd7;
  color: #ffffff;
  border-radius: 999px;
  font-size: 0.62em;
  font-weight: 700;
  letter-spacing: 0.05em;
  vertical-align: 0.12em;
}
`,
};
