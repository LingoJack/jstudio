/**
 * Application themes — multi-theme system for the entire UI.
 *
 * Each theme defines the full palette of CSS variables used across the app,
 * matching the --vscode-* variables in vscode-theme.css.
 *
 * The active theme's colors are injected at runtime via applyAppTheme(),
 * which sets inline styles on <html> to override the static defaults.
 *
 * Key naming convention:
 *   - Keys are exact VSCode CSS variable suffixes
 *   - Component name stays camelCase, property name is kebab
 *   - Example: "titleBar-background" → "--vscode-titleBar-background"
 */

export interface AppTheme {
  id: string;
  isDark: boolean;
  /** UI color palette — keys are exact VSCode CSS variable suffixes. */
  colors: Record<string, string>;
  /** Syntax highlighting tokens (optional). */
  tokens?: Record<string, string>;
}

/** Apply a theme's colors to <html> as inline CSS variable overrides. */
export function applyAppTheme(theme: AppTheme): void {
  const root = document.documentElement;

  // Apply UI colors — keys already match VSCode variable suffixes
  for (const [key, value] of Object.entries(theme.colors)) {
    const cssVarName = `--vscode-${key}`;
    root.style.setProperty(cssVarName, value);
  }

  // Apply token colors (if defined)
  if (theme.tokens) {
    for (const [key, value] of Object.entries(theme.tokens)) {
      const cssVarName = `--vscode-token-${key}`;
      root.style.setProperty(cssVarName, value);
    }
  }

  // Toggle .dark class for Tailwind dark mode
  root.classList.toggle('dark', theme.isDark);
}

// ──────────────────────────────────────────────────────────────────
// JStudio Light (VSCode Light Modern — current default)
// ──────────────────────────────────────────────────────────────────

const JSTUDIO_LIGHT: AppTheme = {
  id: 'jstudio-light',
  isDark: false,
  colors: {
    // ── Core backgrounds (3-layer hierarchy) ──
    'editor-background': '#F8F8F8',
    'sideBar-background': '#FFFFFF',
    'activityBar-background': '#FFFFFF',

    // ── Borders ──
    'sideBar-border': '#E5E5E5',
    'activityBar-border': '#E5E5E5',
    'widget-border': '#E5E5E5',
    'panel-border': '#E5E5E5',

    // ── Text ──
    'foreground': '#3B3B3B',
    'descriptionForeground': '#3B3B3B',
    'iconForeground': '#3B3B3B',

    // ── Interaction ──
    'focusBorder': '#0052D9',
    'button-background': '#0052D9',
    'button-foreground': '#FFFFFF',
    'button-hoverBackground': '#003CAB',
    'buttonSecondary-background': '#EDEDED',
    'buttonSecondary-hoverBackground': '#E0E0E0',
    'buttonSecondary-foreground': '#3B3B3B',

    // ── Inputs ──
    'input-background': '#F8F8F8',
    'input-border': '#CECECE',
    'input-foreground': '#3B3B3B',
    'input-placeholderForeground': '#868686',
    'dropdown-background': '#FFFFFF',
    'dropdown-border': '#CECECE',

    // ── Tabs ──
    'tab-activeBackground': '#F8F8F8',
    'tab-activeBorderTop': '#0052D9',
    'tab-activeForeground': '#3B3B3B',
    'tab-inactiveBackground': '#FFFFFF',
    'tab-inactiveForeground': '#868686',
    'tab-border': '#E5E5E5',

    // ── Menu / List ──
    'menu-background': '#FFFFFF',
    'menu-border': '#CECECE',
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
    'titleBar-border': '#E5E5E5',
    'titleBar-foreground': '#1E1E1E',
    'statusBar-background': '#F8F8F8',
    'statusBar-border': '#E5E5E5',
    'statusBar-foreground': '#3B3B3B',
    'sideBar-foreground': '#3B3B3B',
    'sideBarTitle-foreground': '#3B3B3B',
    'sideBarSectionHeader-background': '#F0F0F0',
    'sideBarSectionHeader-foreground': '#3B3B3B',
    'sideBarSectionHeader-border': '#E5E5E5',
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
    'textBlockQuote-border': '#E5E5E5',
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

// ──────────────────────────────────────────────────────────────────
// JStudio Dark (VSCode Dark Modern — current default)
// ──────────────────────────────────────────────────────────────────

const JSTUDIO_DARK: AppTheme = {
  id: 'jstudio-dark',
  isDark: true,
  colors: {
    'editor-background': '#181818',
    'sideBar-background': '#1F1F1F',
    'activityBar-background': '#1F1F1F',
    'sideBar-border': '#2B2B2B',
    'activityBar-border': '#2B2B2B',
    'widget-border': '#313131',
    'panel-border': '#2B2B2B',
    'foreground': '#CCCCCC',
    'descriptionForeground': '#9D9D9D',
    'iconForeground': '#CCCCCC',
    'focusBorder': '#07C160',
    'button-background': '#07C160',
    'button-foreground': '#FFFFFF',
    'button-hoverBackground': '#06AD56',
    'buttonSecondary-background': '#3A3D41',
    'buttonSecondary-hoverBackground': '#4A4D51',
    'buttonSecondary-foreground': '#FFFFFF',
    'input-background': '#313131',
    'input-border': '#3C3C3C',
    'input-foreground': '#CCCCCC',
    'input-placeholderForeground': '#6E6E6E',
    'dropdown-background': '#313131',
    'dropdown-border': '#3C3C3C',
    'tab-activeBackground': '#181818',
    'tab-activeBorderTop': '#07C160',
    'tab-activeForeground': '#FFFFFF',
    'tab-inactiveBackground': '#1F1F1F',
    'tab-inactiveForeground': '#9D9D9D',
    'tab-border': '#2B2B2B',
    'menu-background': '#1F1F1F',
    'menu-border': '#454545',
    'menu-hoverBackground': '#2A2D2E',
    'menu-separatorBackground': '#3A3A3A',
    'menu-selectionBackground': '#07C160',
    'menu-selectionForeground': '#FFFFFF',
    'list-hoverBackground': '#F1F1F133',
    'list-activeSelectionBackground': '#F1F1F133',
    'list-activeSelectionForeground': '#FFFFFF',
    'toolbar-hoverBackground': '#404040',
    'toolbar-activeBackground': '#505050',
    'titleBar-background': '#1F1F1F',
    'titleBar-border': '#2B2B2B',
    'titleBar-foreground': '#CCCCCC',
    'statusBar-background': '#1F1F1F',
    'statusBar-border': '#2B2B2B',
    'statusBar-foreground': '#CCCCCC',
    'sideBar-foreground': '#CCCCCC',
    'sideBarTitle-foreground': '#CCCCCC',
    'sideBarSectionHeader-background': '#1F1F1F',
    'sideBarSectionHeader-foreground': '#CCCCCC',
    'sideBarSectionHeader-border': '#2B2B2B',
    'activityBar-foreground': '#D7D7D7',
    'editor-selectionBackground': '#ADD6FF26',
    'editor-inactiveSelectionBackground': '#3A3D41',
    'panel-background': '#181818',
    'quickInput-background': '#222222',
    'editorWidget-background': '#202020',
    'scrollbarSlider-background': '#79797966',
    'scrollbarSlider-hoverBackground': '#79797999',
    'scrollbarSlider-activeBackground': '#797979AA',
    'badge-background': '#616161',
    'badge-foreground': '#F8F8F8',
    'progressBar-background': '#07C160',
    'textLink-foreground': '#3DDC84',
    'textLink-activeForeground': '#3DDC84',
    'textBlockQuote-background': '#2B2B2B',
    'textBlockQuote-border': '#616161',
    'textCodeBlock-background': '#2B2B2B',
    'textPreformat-foreground': '#D0D0D0',
    'textPreformat-background': '#3C3C3C',
    'editorLineNumber-foreground': '#6E7681',
    'editorLineNumber-activeForeground': '#CCCCCC',
    'editorIndentGuide-background1': '#404040',
    'editorIndentGuide-activeBackground1': '#707070',
    'editorGutter-addedBackground': '#2EA043',
    'editorGutter-deletedBackground': '#F85149',
    'editorGutter-modifiedBackground': '#07C160',
    'errorForeground': '#F85149',
    'editorWarning-foreground': '#CCA700',
    'editorInfo-foreground': '#3794FF',
    'symbolIcon-eventForeground': '#EE9D28',
    'symbolIcon-namespaceForeground': '#B4009E',
    'symbolIcon-fileForeground': '#75BEFF',
    'symbolIcon-folderForeground': '#D4A259',
    'terminal-ansiGreen': '#4EC9B0',
    'terminal-ansiBlue': '#6796E6',

    // ── Editor cursor ──
    'editorCursor-foreground': '#07C160',

    'editGlow': '236 72 153', // Pink #EC4899
  },
  tokens: {
    'comment': '#6A9955',
    'keyword': '#569CD6',
    'string': '#CE9178',
    'number': '#B5CEA8',
    'function': '#DCDCAA',
    'type': '#4EC9B0',
    'variable': '#9CDCFE',
    'constant': '#4FC1FF',
    'operator': '#D4D4D4',
    'punctuation': '#808080',
    'invalid': '#F44747',
    'regexp': '#D16969',
    'escape': '#D7BA7D',
    'tag': '#569CD6',
    'attribute': '#9CDCFE',
    'deleted': '#CE9178',
    'inserted': '#B5CEA8',
    'changed': '#569CD6',
    'markupHeading': '#569CD6',
    'markupBold': '#569CD6',
    'markupItalic': '#C586C0',
    'markupRaw': '#CE9178',
    'controlKeyword': '#C586C0',
  },
};

// ──────────────────────────────────────────────────────────────────
// Ink Light (Anthropic 米白赭陶 — warm cream with terracotta accents)
// ──────────────────────────────────────────────────────────────────

const INK_LIGHT: AppTheme = {
  id: 'ink-light',
  isDark: false,
  colors: {
    // Core backgrounds — warm cream hierarchy
    'editor-background': '#faf6f1',
    'sideBar-background': '#f5f0e8',
    'activityBar-background': '#f0ebe3',
    'sideBar-border': '#e8ddd0',
    'activityBar-border': '#ddd4c8',
    'widget-border': '#1a1612', // 黑色/深褐，与文字一致
    'panel-border': '#ddd4c8',
    'foreground': '#1a1612',
    'descriptionForeground': '#6b5e52',
    'iconForeground': '#6b5e52',
    'focusBorder': '#1a1612', // 深褐/黑色，与文字一致
    'button-background': '#1a1612', // 深褐/黑色
    'button-foreground': '#FFFFFF',
    'button-hoverBackground': '#3a3530', // 略浅的褐色
    'buttonSecondary-background': '#ede4d8',
    'buttonSecondary-hoverBackground': '#ddd4c8',
    'buttonSecondary-foreground': '#1a1612',
    'input-background': '#faf6f1',
    'input-border': '#ddd4c8',
    'input-foreground': '#1a1612',
    'input-placeholderForeground': '#8a7e72',
    'dropdown-background': '#faf6f1',
    'dropdown-border': '#ddd4c8',
    'tab-activeBackground': '#faf6f1',
    'tab-activeBorderTop': '#1a1612', // 深褐/黑色，与 focusBorder 一致
    'tab-activeForeground': '#1a1612',
    'tab-inactiveBackground': '#f5f0e8',
    'tab-inactiveForeground': '#8a7e72',
    'tab-border': '#ddd4c8',
    'menu-background': '#faf6f1',
    'menu-border': '#ddd4c8',
    'menu-hoverBackground': '#f0ebe3',
    'menu-separatorBackground': '#ddd4c8',
    'menu-selectionBackground': '#1a1612', // 深褐/黑色
    'menu-selectionForeground': '#FFFFFF',
    'list-hoverBackground': '#f0ebe3',
    'list-activeSelectionBackground': '#e8ddd0',
    'list-activeSelectionForeground': '#1a1612',
    'toolbar-hoverBackground': '#f0ebe3',
    'toolbar-activeBackground': '#e8ddd0',
    'titleBar-background': '#faf6f1',
    'titleBar-border': '#ddd4c8',
    'titleBar-foreground': '#1a1612',
    'statusBar-background': '#faf6f1',
    'statusBar-border': '#ddd4c8',
    'statusBar-foreground': '#1a1612',
    'sideBar-foreground': '#1a1612',
    'sideBarTitle-foreground': '#1a1612',
    'sideBarSectionHeader-background': '#f0ebe3',
    'sideBarSectionHeader-foreground': '#1a1612',
    'sideBarSectionHeader-border': '#ddd4c8',
    'activityBar-foreground': '#6b5e52',
    'editor-selectionBackground': '#ede4d8',
    'editor-inactiveSelectionBackground': '#f0ebe3',
    'panel-background': '#faf6f1',
    'quickInput-background': '#faf6f1',
    'editorWidget-background': '#faf6f1',
    'scrollbarSlider-background': '#00000026',
    'scrollbarSlider-hoverBackground': '#00000040',
    'scrollbarSlider-activeBackground': '#00000052',
    'badge-background': '#ddd4c8',
    'badge-foreground': '#1a1612',
    'progressBar-background': '#1a1612', // 深褐/黑色
    'textLink-foreground': '#1a1612', // 深褐/黑色，链接也用深色
    'textLink-activeForeground': '#3a3530', // 略浅的褐色作为激活态
    'textBlockQuote-background': '#f5f0e8',
    'textBlockQuote-border': '#ddd4c8',
    'textCodeBlock-background': '#f5f0e8',
    'textPreformat-foreground': '#1a1612',
    'textPreformat-background': '#e8ddd0',
    'editorLineNumber-foreground': '#8a7e72',
    'editorLineNumber-activeForeground': '#1a1612',
    'editorIndentGuide-background1': '#ddd4c8',
    'editorIndentGuide-activeBackground1': '#b14040',
    'editorGutter-addedBackground': '#4a7a50',
    'editorGutter-deletedBackground': '#b14040',
    'editorGutter-modifiedBackground': '#0052D9',
    'errorForeground': '#b14040',
    'editorWarning-foreground': '#a07830',
    'editorInfo-foreground': '#3a7870',
    'symbolIcon-eventForeground': '#a07830',
    'symbolIcon-namespaceForeground': '#7a5ea0',
    'symbolIcon-fileForeground': '#4a70a0',
    'symbolIcon-folderForeground': '#a07830',
    'terminal-ansiGreen': '#4a7a50',
    'terminal-ansiBlue': '#4a70a0',

    // ── Editor cursor ──
    'editorCursor-foreground': '#1a1612', // 深褐/黑色，与文字颜色一致

    'editGlow': '177 64 64', // Terracotta #b14040
  },
  tokens: {
    'comment': '#8a7e72',
    'keyword': '#4a70a0',
    'string': '#a07830',
    'number': '#4a7a50',
    'function': '#7a5ea0',
    'type': '#3a7870',
    'variable': '#1a1612',
    'constant': '#0052D9',
    'operator': '#6b5e52',
    'punctuation': '#8a7e72',
    'invalid': '#b14040',
    'regexp': '#a07830',
    'escape': '#b89838',
    'tag': '#7a5ea0',
    'attribute': '#a07830',
    'deleted': '#b14040',
    'inserted': '#4a7a50',
    'changed': '#4a70a0',
    'markupHeading': '#b14040',
    'markupBold': '#1a1612',
    'markupItalic': '#7a5ea0',
    'markupRaw': '#a07830',
    'controlKeyword': '#7a5ea0',
  },
};

// ──────────────────────────────────────────────────────────────────
// Ink Dark (Tokyo Night Moon — purple-gray dark theme)
// ──────────────────────────────────────────────────────────────────

const INK_DARK: AppTheme = {
  id: 'ink-dark',
  isDark: true,
  colors: {
    'editor-background': '#222436',
    'sideBar-background': '#1e2030',
    'activityBar-background': '#1e2030',
    'sideBar-border': '#2f334d',
    'activityBar-border': '#2f334d',
    'widget-border': '#2f334d',
    'panel-border': '#2f334d',
    'foreground': '#c8d3f5',
    'descriptionForeground': '#7f88b0',
    'iconForeground': '#7f88b0',
    'focusBorder': '#82aaff',
    'button-background': '#82aaff',
    'button-foreground': '#1e2030',
    'button-hoverBackground': '#6090c0',
    'buttonSecondary-background': '#2f334d',
    'buttonSecondary-hoverBackground': '#3d415e',
    'buttonSecondary-foreground': '#c8d3f5',
    'input-background': '#1e2030',
    'input-border': '#2f334d',
    'input-foreground': '#c8d3f5',
    'input-placeholderForeground': '#7f88b0',
    'dropdown-background': '#1e2030',
    'dropdown-border': '#2f334d',
    'tab-activeBackground': '#222436',
    'tab-activeBorderTop': '#82aaff',
    'tab-activeForeground': '#c8d3f5',
    'tab-inactiveBackground': '#1e2030',
    'tab-inactiveForeground': '#7f88b0',
    'tab-border': '#2f334d',
    'menu-background': '#1e2030',
    'menu-border': '#2f334d',
    'menu-hoverBackground': '#2f334d',
    'menu-separatorBackground': '#2f334d',
    'menu-selectionBackground': '#82aaff',
    'menu-selectionForeground': '#1e2030',
    'list-hoverBackground': '#2f334d',
    'list-activeSelectionBackground': '#2d3f76',
    'list-activeSelectionForeground': '#c8d3f5',
    'toolbar-hoverBackground': '#2f334d',
    'toolbar-activeBackground': '#3d415e',
    'titleBar-background': '#1e2030',
    'titleBar-border': '#2f334d',
    'titleBar-foreground': '#c8d3f5',
    'statusBar-background': '#1e2030',
    'statusBar-border': '#2f334d',
    'statusBar-foreground': '#c8d3f5',
    'sideBar-foreground': '#c8d3f5',
    'sideBarTitle-foreground': '#c8d3f5',
    'sideBarSectionHeader-background': '#1e2030',
    'sideBarSectionHeader-foreground': '#c8d3f5',
    'sideBarSectionHeader-border': '#2f334d',
    'activityBar-foreground': '#7f88b0',
    'editor-selectionBackground': '#2d3f76',
    'editor-inactiveSelectionBackground': '#2f334d',
    'panel-background': '#222436',
    'quickInput-background': '#1e2030',
    'editorWidget-background': '#1e2030',
    'scrollbarSlider-background': '#79797966',
    'scrollbarSlider-hoverBackground': '#79797999',
    'scrollbarSlider-activeBackground': '#797979AA',
    'badge-background': '#2f334d',
    'badge-foreground': '#c8d3f5',
    'progressBar-background': '#82aaff',
    'textLink-foreground': '#82aaff',
    'textLink-activeForeground': '#82aaff',
    'textBlockQuote-background': '#1e2030',
    'textBlockQuote-border': '#2f334d',
    'textCodeBlock-background': '#1e2030',
    'textPreformat-foreground': '#c8d3f5',
    'textPreformat-background': '#2f334d',
    'editorLineNumber-foreground': '#7f88b0',
    'editorLineNumber-activeForeground': '#c8d3f5',
    'editorIndentGuide-background1': '#2f334d',
    'editorIndentGuide-activeBackground1': '#82aaff',
    'editorGutter-addedBackground': '#c3e88d',
    'editorGutter-deletedBackground': '#ff757f',
    'editorGutter-modifiedBackground': '#82aaff',
    'errorForeground': '#ff757f',
    'editorWarning-foreground': '#ffc777',
    'editorInfo-foreground': '#86e1fc',
    'symbolIcon-eventForeground': '#ff966c',
    'symbolIcon-namespaceForeground': '#c099ff',
    'symbolIcon-fileForeground': '#82aaff',
    'symbolIcon-folderForeground': '#ffc777',
    'terminal-ansiGreen': '#c3e88d',
    'terminal-ansiBlue': '#82aaff',

    // ── Editor cursor ──
    'editorCursor-foreground': '#82aaff',

    'editGlow': '130 170 255', // Bright blue #82aaff
  },
  tokens: {
    'comment': '#7f88b0',
    'keyword': '#82aaff',
    'string': '#ffc777',
    'number': '#c3e88d',
    'function': '#c099ff',
    'type': '#86e1fc',
    'variable': '#c8d3f5',
    'constant': '#82aaff',
    'operator': '#7f88b0',
    'punctuation': '#586190',
    'invalid': '#ff757f',
    'regexp': '#ff966c',
    'escape': '#ffc777',
    'tag': '#ff757f',
    'attribute': '#ffc777',
    'deleted': '#ff757f',
    'inserted': '#c3e88d',
    'changed': '#82aaff',
    'markupHeading': '#ff757f',
    'markupBold': '#82aaff',
    'markupItalic': '#c099ff',
    'markupRaw': '#ffc777',
    'controlKeyword': '#c099ff',
  },
};

// ──────────────────────────────────────────────────────────────────
// Exported themes array
// ──────────────────────────────────────────────────────────────────

export const APP_THEMES: AppTheme[] = [
  JSTUDIO_LIGHT,
  JSTUDIO_DARK,
  INK_LIGHT,
  INK_DARK,
];

/** Default theme IDs for new users. */
export const DEFAULT_APP_THEME_ID_LIGHT = 'jstudio-light';
export const DEFAULT_APP_THEME_ID_DARK = 'jstudio-dark';

/** Find a theme by id, falling back to the appropriate default. */
export function getAppTheme(id: string | undefined, isDark: boolean): AppTheme {
  const resolved = APP_THEMES.find((t) => t.id === id);
  if (resolved) return resolved;
  // Fallback to default for the given mode
  return APP_THEMES.find((t) => t.id === (isDark ? DEFAULT_APP_THEME_ID_DARK : DEFAULT_APP_THEME_ID_LIGHT))!;
}

/** Get all themes for a given mode (dark/light). */
export function getAppThemesByMode(isDark: boolean): AppTheme[] {
  return APP_THEMES.filter((t) => t.isDark === isDark);
}