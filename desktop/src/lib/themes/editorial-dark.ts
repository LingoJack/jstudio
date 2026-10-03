import type { AppTheme } from './types';

// ──────────────────────────────────────────────────────────────────
// Editorial Dark (夜间印刷风 — editorial-light 的同语言暗色姊妹)
// 杂志印刷的暗转：纸面换成墨夜 #1A1A1C，签名结构「反转」——内容卡片
// 的 2px 描边从墨黑变为淡墨白 #D9D7D2（夜间印刷样张），chrome 线降为
// 45% 墨白弱线（同 editorial-light 的墨线分阶）。强调分两档：文字级
// 浅宝蓝 #8CA2F8（链接/光标/编号徽章描边），按钮保持皇家蓝底白字
// #4257E0。奶油色在暗色上反转为浅奶油实底次级按钮（小面积点缀，
// 语义与浅色版一致）。
// customCss 结构覆盖与 editorial-light 同构（2px 卡片/引用卡片/H2
// 编号徽章），仅线条颜色随描边反转。
// ──────────────────────────────────────────────────────────────────

export const EDITORIAL_DARK: AppTheme = {
  id: 'editorial-dark',
  isDark: true,
  colors: {
    // ── Core backgrounds (墨夜纸面，栏背景与内容区统一) ──
    'editor-background': '#1A1A1C',
    'sideBar-background': '#1A1A1C',
    'activityBar-background': '#1A1A1C',

    // ── Borders (墨线分阶：chrome 走墨白弱线，实线留给内容卡片) ──
    'sideBar-border': 'var(--jstudio-block-line)',
    'activityBar-border': 'var(--jstudio-block-line)',
    'widget-border': 'var(--jstudio-block-line)',
    'block-border': '#D9D7D2', // 内容卡片描边：淡墨白（签名，勿弱化）
    'menu-border': 'var(--jstudio-block-line)',
    'panel-border': 'var(--jstudio-block-line)',

    // ── Text ──
    'foreground': '#E8E6E1',
    'descriptionForeground': '#A5A29A',
    'iconForeground': '#A5A29A',

    // ── Interaction ──
    'focusBorder': '#8CA2F8',
    'diagram-edge': '#8CA2F8', // 时序图/画板连线色：浅宝蓝
    'button-background': '#4257E0',
    'button-foreground': '#ffffff',
    'button-hoverBackground': '#3246C4',
    'buttonSecondary-background': '#F1EBD8', // 奶油反转为浅底实色按钮
    'buttonSecondary-hoverBackground': '#E4DCC2',
    'buttonSecondary-foreground': '#1A1A1A',

    // ── Inputs ──
    'input-background': '#222225',
    'input-border': 'var(--jstudio-block-line)',
    'input-foreground': '#E8E6E1',
    'input-placeholderForeground': '#7B7871',
    'dropdown-background': '#222225',
    'dropdown-border': 'var(--jstudio-block-line)',

    // ── Tabs ──
    'tab-activeBackground': '#1A1A1C',
    'tab-activeBorderTop': '#8CA2F8',
    'tab-activeForeground': '#F2F0EB',
    'tab-inactiveBackground': '#222225',
    'tab-inactiveForeground': '#A5A29A',
    'tab-border': 'var(--jstudio-block-line)',

    // ── Menu / List ──
    'menu-background': '#222225',
    'menu-hoverBackground': '#26262A',
    'menu-separatorBackground': '#333336',
    'menu-selectionBackground': '#4257E0',
    'menu-selectionForeground': '#ffffff',
    'list-hoverBackground': '#26262A',
    'list-activeSelectionBackground': '#33427E',
    'list-activeSelectionForeground': '#E8E6E1',
    'toolbar-hoverBackground': '#26262A',
    'toolbar-activeBackground': '#333336',

    // ── Title / Status bars ──
    'titleBar-background': '#202023',
    'titleBar-border': 'var(--jstudio-block-line)',
    'titleBar-foreground': '#E8E6E1',
    'statusBar-background': '#202023',
    'statusBar-border': 'var(--jstudio-block-line)',
    'statusBar-foreground': '#A5A29A',
    'sideBar-foreground': '#E8E6E1',
    'sideBarTitle-foreground': '#E8E6E1',
    'sideBarSectionHeader-background': '#232326',
    'sideBarSectionHeader-foreground': '#E8E6E1',
    'sideBarSectionHeader-border': 'var(--jstudio-block-line)',
    'activityBar-foreground': '#A5A29A',

    // ── Selection ──
    'editor-selectionBackground': '#33427E',
    'editor-inactiveSelectionBackground': '#26262A',

    // ── Panels / Widgets ──
    'panel-background': '#1A1A1C',
    'quickInput-background': '#222225',
    'editorWidget-background': '#202023',

    // ── Scrollbar ──
    'scrollbarSlider-background': '#79797966',
    'scrollbarSlider-hoverBackground': '#79797999',
    'scrollbarSlider-activeBackground': '#797979AA',

    // ── Badges / Progress ──
    'badge-background': '#2E3A78',
    'badge-foreground': '#C9D3F8',
    'progressBar-background': '#4257E0',

    // ── Links / Quotes / Code ──
    'textLink-foreground': '#8CA2F8',
    'textLink-activeForeground': '#A9B8FA',
    'textBlockQuote-background': '#232326',
    'textBlockQuote-border': '#8CA2F8',
    'textCodeBlock-background': '#242428',
    'textPreformat-foreground': '#B9C2E8', // 行内代码·铁胆墨暗版：墨白靛字 + 冷灰染
    'textPreformat-background': '#8B949E2E',

    // ── Editor line numbers / guides ──
    'editorLineNumber-foreground': '#6E6B64',
    'editorLineNumber-activeForeground': '#E8E6E1',
    'editorIndentGuide-background1': '#2E2E32',
    'editorIndentGuide-activeBackground1': '#8CA2F8',

    // ── Gutter (diff markers) ──
    'editorGutter-addedBackground': '#5CB868',
    'editorGutter-deletedBackground': '#E0705F',
    'editorGutter-modifiedBackground': '#8CA2F8',

    // ── Errors / Warnings / Info ──
    'errorForeground': '#E0705F',
    'editorWarning-foreground': '#D9A94E',
    'editorInfo-foreground': '#8CA2F8',

    // ── Symbol icons ──
    'symbolIcon-eventForeground': '#D9A94E',
    'symbolIcon-namespaceForeground': '#B79BE0',
    'symbolIcon-fileForeground': '#8CA2F8',
    'symbolIcon-folderForeground': '#D9A94E',

    // ── Terminal ANSI ──
    'terminal-ansiGreen': '#5CB868',
    'terminal-ansiBlue': '#8CA2F8',

    // ── Editor cursor ──
    'editorCursor-foreground': '#8CA2F8', // 浅宝蓝，呼应编号徽章

    // ── Edit glow (RGB tuple) ──
    'editGlow': '232 137 111', // Vermilion #E8896F — 朱批暗版

    // ── Table header background ──
    'tableHeader-background': '#232326',
  },
  tokens: {
    'comment': '#8A877F',
    'keyword': '#8CA2F8',
    'string': '#85C185',
    'number': '#D9B45C',
    'function': '#B79BE0',
    'type': '#6FB5AB',
    'variable': '#E8E6E1',
    'constant': '#A9B8FA',
    'operator': '#B5B2AA',
    'punctuation': '#7D7A73',
    'invalid': '#E0705F',
    'regexp': '#E08A5A',
    'escape': '#A9B8FA',
    'tag': '#E0705F',
    'attribute': '#8CA2F8',
    'deleted': '#E0705F',
    'inserted': '#5CB868',
    'changed': '#8CA2F8',
    'markupHeading': '#F2F0EB', // 标题用墨白，对应浅色版的墨黑大标题
    'markupBold': '#8CA2F8',
    'markupItalic': '#B79BE0',
    'markupRaw': '#D9B45C',
    'controlKeyword': '#B79BE0',
  },
  customCss: `
/* ── Editorial Dark：结构覆盖（仅本主题激活期间注入） ──
   与 editorial-light 同构，描边反转：内容卡片 2px 淡墨白实线。 */
:root {
  --jstudio-block-line-strong: #D9D7D2;
  --jstudio-block-line: color-mix(in srgb, #D9D7D2 42%, transparent);
  --jstudio-indicator-ink: #E8E6E1;
}

/* 内容块 / 引用块：2px 淡墨白描边圆角卡片（对齐浅色版的卡片签名） */
.code-block-figure,
.file-block-figure,
.ProseMirror .tableWrapper {
  border-width: 2px;
}
.code-block-wrapper pre {
  border: none;
}
.ProseMirror > pre {
  border: 2px solid #D9D7D2;
  border-radius: 12px;
}
blockquote {
  border: 2px solid #D9D7D2;
  border-radius: 12px;
}

/* H2 章节编号徽章：皇家蓝圆形 01/02（对应文章章节序号）。
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
  background: #4257E0;
  color: #ffffff;
  border-radius: 999px;
  font-size: 0.62em;
  font-weight: 700;
  letter-spacing: 0.05em;
  vertical-align: 0.12em;
}
`,
};
