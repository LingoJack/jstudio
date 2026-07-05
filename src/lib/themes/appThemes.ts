/**
 * Application themes — multi-theme system for the entire UI.
 *
 * Each theme defines the full palette of CSS variables used across the app,
 * matching the --vscode-* variables in vscode-theme.css.
 *
 * The active theme's colors are injected at runtime via applyAppTheme(),
 * which sets inline styles on <html> to override the static defaults.
 */

export interface AppTheme {
  id: string;
  isDark: boolean;
  /** UI color palette — maps directly to --vscode-* CSS variables. */
  colors: {
    // ── Core backgrounds (3-layer hierarchy) ──
    editorBackground: string;
    sideBarBackground: string;
    activityBarBackground: string;

    // ── Borders ──
    sideBarBorder: string;
    activityBarBorder: string;
    widgetBorder: string;
    panelBorder: string;

    // ── Text ──
    foreground: string;
    descriptionForeground: string;
    iconForeground: string;

    // ── Interaction ──
    focusBorder: string;
    buttonBackground: string;
    buttonForeground: string;
    buttonHoverBackground: string;
    buttonSecondaryBackground: string;
    buttonSecondaryHoverBackground: string;
    buttonSecondaryForeground: string;

    // ── Inputs ──
    inputBackground: string;
    inputBorder: string;
    inputForeground: string;
    inputPlaceholderForeground: string;
    dropdownBackground: string;
    dropdownBorder: string;

    // ── Tabs ──
    tabActiveBackground: string;
    tabActiveBorderTop: string;
    tabActiveForeground: string;
    tabInactiveBackground: string;
    tabInactiveForeground: string;
    tabBorder: string;

    // ── Menu / List ──
    menuBackground: string;
    menuBorder: string;
    menuHoverBackground: string;
    menuSeparatorBackground: string;
    menuSelectionBackground: string;
    menuSelectionForeground: string;
    listHoverBackground: string;
    listActiveSelectionBackground: string;
    listActiveSelectionForeground: string;
    toolbarHoverBackground: string;
    toolbarActiveBackground: string;

    // ── Title / Status bars ──
    titleBarBackground: string;
    titleBarBorder: string;
    titleBarForeground: string;
    statusBarBackground: string;
    statusBarBorder: string;
    statusBarForeground: string;
    sideBarForeground: string;
    sideBarTitleForeground: string;
    sideBarSectionHeaderBackground: string;
    sideBarSectionHeaderForeground: string;
    sideBarSectionHeaderBorder: string;
    activityBarForeground: string;

    // ── Selection ──
    editorSelectionBackground: string;
    editorInactiveSelectionBackground: string;

    // ── Panels / Widgets ──
    panelBackground: string;
    quickInputBackground: string;
    editorWidgetBackground: string;

    // ── Scrollbar ──
    scrollBarSliderBackground: string;
    scrollBarSliderHoverBackground: string;
    scrollBarSliderActiveBackground: string;

    // ── Badges / Progress ──
    badgeBackground: string;
    badgeForeground: string;
    progressBarBackground: string;

    // ── Links / Quotes / Code ──
    textLinkForeground: string;
    textLinkActiveForeground: string;
    textBlockQuoteBackground: string;
    textBlockQuoteBorder: string;
    textCodeBlockBackground: string;
    textPreformatForeground: string;
    textPreformatBackground: string;

    // ── Editor line numbers / guides ──
    editorLineNumberForeground: string;
    editorLineNumberActiveForeground: string;
    editorIndentGuideBackground1: string;
    editorIndentGuideActiveBackground1: string;

    // ── Gutter (diff markers) ──
    editorGutterAddedBackground: string;
    editorGutterDeletedBackground: string;
    editorGutterModifiedBackground: string;

    // ── Errors / Warnings / Info ──
    errorForeground: string;
    editorWarningForeground: string;
    editorInfoForeground: string;

    // ── Symbol icons ──
    symbolIconEventForeground: string;
    symbolIconNamespaceForeground: string;
    symbolIconFileForeground: string;
    symbolIconFolderForeground: string;

    // ── Terminal ANSI (used in editor decorations) ──
    terminalAnsiGreen: string;
    terminalAnsiBlue: string;

    // ── Edit glow (RGB tuple stored as string "R G B") ──
    editGlow: string;
  };
  /** Syntax highlighting tokens (optional, inherits from parent if omitted). */
  tokens?: {
    comment: string;
    keyword: string;
    string: string;
    number: string;
    function: string;
    type: string;
    variable: string;
    constant: string;
    operator: string;
    punctuation: string;
    invalid: string;
    regexp: string;
    escape: string;
    tag: string;
    attribute: string;
    deleted: string;
    inserted: string;
    changed: string;
    markupHeading: string;
    markupBold: string;
    markupItalic: string;
    markupRaw: string;
    controlKeyword: string;
  };
}

/** Convert camelCase to kebab-case for CSS variable names. */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Apply a theme's colors to <html> as inline CSS variable overrides. */
export function applyAppTheme(theme: AppTheme): void {
  const root = document.documentElement;

  // Apply UI colors
  for (const [key, value] of Object.entries(theme.colors)) {
    const cssVarName = `--vscode-${camelToKebab(key)}`;
    root.style.setProperty(cssVarName, value);
  }

  // Apply token colors (if defined)
  if (theme.tokens) {
    for (const [key, value] of Object.entries(theme.tokens)) {
      const cssVarName = `--vscode-token-${camelToKebab(key)}`;
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
    editorBackground: '#F8F8F8',
    sideBarBackground: '#FFFFFF',
    activityBarBackground: '#FFFFFF',
    sideBarBorder: '#E5E5E5',
    activityBarBorder: '#E5E5E5',
    widgetBorder: '#E5E5E5',
    panelBorder: '#E5E5E5',
    foreground: '#3B3B3B',
    descriptionForeground: '#3B3B3B',
    iconForeground: '#3B3B3B',
    focusBorder: '#0052D9',
    buttonBackground: '#0052D9',
    buttonForeground: '#FFFFFF',
    buttonHoverBackground: '#003CAB',
    buttonSecondaryBackground: '#EDEDED',
    buttonSecondaryHoverBackground: '#E0E0E0',
    buttonSecondaryForeground: '#3B3B3B',
    inputBackground: '#F8F8F8',
    inputBorder: '#CECECE',
    inputForeground: '#3B3B3B',
    inputPlaceholderForeground: '#868686',
    dropdownBackground: '#FFFFFF',
    dropdownBorder: '#CECECE',
    tabActiveBackground: '#F8F8F8',
    tabActiveBorderTop: '#0052D9',
    tabActiveForeground: '#3B3B3B',
    tabInactiveBackground: '#FFFFFF',
    tabInactiveForeground: '#868686',
    tabBorder: '#E5E5E5',
    menuBackground: '#FFFFFF',
    menuBorder: '#CECECE',
    menuHoverBackground: '#F2F2F2',
    menuSeparatorBackground: '#E5E5E5',
    menuSelectionBackground: '#0052D9',
    menuSelectionForeground: '#FFFFFF',
    listHoverBackground: '#F2F2F2',
    listActiveSelectionBackground: '#E8E8E8',
    listActiveSelectionForeground: '#3B3B3B',
    toolbarHoverBackground: '#E5E5E5',
    toolbarActiveBackground: '#E0E0E0',
    titleBarBackground: '#F8F8F8',
    titleBarBorder: '#E5E5E5',
    titleBarForeground: '#1E1E1E',
    statusBarBackground: '#F8F8F8',
    statusBarBorder: '#E5E5E5',
    statusBarForeground: '#3B3B3B',
    sideBarForeground: '#3B3B3B',
    sideBarTitleForeground: '#3B3B3B',
    sideBarSectionHeaderBackground: '#F0F0F0',
    sideBarSectionHeaderForeground: '#3B3B3B',
    sideBarSectionHeaderBorder: '#E5E5E5',
    activityBarForeground: '#1F1F1F',
    editorSelectionBackground: '#ADD6FF',
    editorInactiveSelectionBackground: '#E5EBF1',
    panelBackground: '#F8F8F8',
    quickInputBackground: '#F8F8F8',
    editorWidgetBackground: '#F8F8F8',
    scrollBarSliderBackground: '#00000026',
    scrollBarSliderHoverBackground: '#00000040',
    scrollBarSliderActiveBackground: '#00000052',
    badgeBackground: '#CCCCCC',
    badgeForeground: '#3B3B3B',
    progressBarBackground: '#0052D9',
    textLinkForeground: '#0052D9',
    textLinkActiveForeground: '#0052D9',
    textBlockQuoteBackground: '#F8F8F8',
    textBlockQuoteBorder: '#E5E5E5',
    textCodeBlockBackground: '#F8F8F8',
    textPreformatForeground: '#3B3B3B',
    textPreformatBackground: '#0000001F',
    editorLineNumberForeground: '#6E7681',
    editorLineNumberActiveForeground: '#171184',
    editorIndentGuideBackground1: '#D3D3D3',
    editorIndentGuideActiveBackground1: '#939393',
    editorGutterAddedBackground: '#2EA043',
    editorGutterDeletedBackground: '#F85149',
    editorGutterModifiedBackground: '#0052D9',
    errorForeground: '#F85149',
    editorWarningForeground: '#855A00',
    editorInfoForeground: '#05838B',
    symbolIconEventForeground: '#C3672C',
    symbolIconNamespaceForeground: '#672179',
    symbolIconFileForeground: '#007ACC',
    symbolIconFolderForeground: '#C09553',
    terminalAnsiGreen: '#00BC00',
    terminalAnsiBlue: '#0451A5',
    editGlow: '139 92 246', // Violet #8B5CF6
  },
  tokens: {
    comment: '#008000',
    keyword: '#0000FF',
    string: '#A31515',
    number: '#098658',
    function: '#795E26',
    type: '#267F99',
    variable: '#001080',
    constant: '#0070C1',
    operator: '#000000',
    punctuation: '#000000',
    invalid: '#CD3131',
    regexp: '#811F3F',
    escape: '#EE0000',
    tag: '#800000',
    attribute: '#E50000',
    deleted: '#A31515',
    inserted: '#098658',
    changed: '#0451A5',
    markupHeading: '#800000',
    markupBold: '#000080',
    markupItalic: '#800080',
    markupRaw: '#800000',
    controlKeyword: '#AF00DB',
  },
};

// ──────────────────────────────────────────────────────────────────
// JStudio Dark (VSCode Dark Modern — current default)
// ──────────────────────────────────────────────────────────────────

const JSTUDIO_DARK: AppTheme = {
  id: 'jstudio-dark',
  isDark: true,
  colors: {
    editorBackground: '#181818',
    sideBarBackground: '#1F1F1F',
    activityBarBackground: '#1F1F1F',
    sideBarBorder: '#2B2B2B',
    activityBarBorder: '#2B2B2B',
    widgetBorder: '#313131',
    panelBorder: '#2B2B2B',
    foreground: '#CCCCCC',
    descriptionForeground: '#9D9D9D',
    iconForeground: '#CCCCCC',
    focusBorder: '#07C160',
    buttonBackground: '#07C160',
    buttonForeground: '#FFFFFF',
    buttonHoverBackground: '#06AD56',
    buttonSecondaryBackground: '#3A3D41',
    buttonSecondaryHoverBackground: '#4A4D51',
    buttonSecondaryForeground: '#FFFFFF',
    inputBackground: '#313131',
    inputBorder: '#3C3C3C',
    inputForeground: '#CCCCCC',
    inputPlaceholderForeground: '#6E6E6E',
    dropdownBackground: '#313131',
    dropdownBorder: '#3C3C3C',
    tabActiveBackground: '#181818',
    tabActiveBorderTop: '#07C160',
    tabActiveForeground: '#FFFFFF',
    tabInactiveBackground: '#1F1F1F',
    tabInactiveForeground: '#9D9D9D',
    tabBorder: '#2B2B2B',
    menuBackground: '#1F1F1F',
    menuBorder: '#454545',
    menuHoverBackground: '#2A2D2E',
    menuSeparatorBackground: '#3A3A3A',
    menuSelectionBackground: '#07C160',
    menuSelectionForeground: '#FFFFFF',
    listHoverBackground: '#F1F1F133',
    listActiveSelectionBackground: '#F1F1F133',
    listActiveSelectionForeground: '#FFFFFF',
    toolbarHoverBackground: '#404040',
    toolbarActiveBackground: '#505050',
    titleBarBackground: '#1F1F1F',
    titleBarBorder: '#2B2B2B',
    titleBarForeground: '#CCCCCC',
    statusBarBackground: '#1F1F1F',
    statusBarBorder: '#2B2B2B',
    statusBarForeground: '#CCCCCC',
    sideBarForeground: '#CCCCCC',
    sideBarTitleForeground: '#CCCCCC',
    sideBarSectionHeaderBackground: '#1F1F1F',
    sideBarSectionHeaderForeground: '#CCCCCC',
    sideBarSectionHeaderBorder: '#2B2B2B',
    activityBarForeground: '#D7D7D7',
    editorSelectionBackground: '#ADD6FF26',
    editorInactiveSelectionBackground: '#3A3D41',
    panelBackground: '#181818',
    quickInputBackground: '#222222',
    editorWidgetBackground: '#202020',
    scrollBarSliderBackground: '#79797966',
    scrollBarSliderHoverBackground: '#79797999',
    scrollBarSliderActiveBackground: '#797979AA',
    badgeBackground: '#616161',
    badgeForeground: '#F8F8F8',
    progressBarBackground: '#07C160',
    textLinkForeground: '#3DDC84',
    textLinkActiveForeground: '#3DDC84',
    textBlockQuoteBackground: '#2B2B2B',
    textBlockQuoteBorder: '#616161',
    textCodeBlockBackground: '#2B2B2B',
    textPreformatForeground: '#D0D0D0',
    textPreformatBackground: '#3C3C3C',
    editorLineNumberForeground: '#6E7681',
    editorLineNumberActiveForeground: '#CCCCCC',
    editorIndentGuideBackground1: '#404040',
    editorIndentGuideActiveBackground1: '#707070',
    editorGutterAddedBackground: '#2EA043',
    editorGutterDeletedBackground: '#F85149',
    editorGutterModifiedBackground: '#07C160',
    errorForeground: '#F85149',
    editorWarningForeground: '#CCA700',
    editorInfoForeground: '#3794FF',
    symbolIconEventForeground: '#EE9D28',
    symbolIconNamespaceForeground: '#B4009E',
    symbolIconFileForeground: '#75BEFF',
    symbolIconFolderForeground: '#D4A259',
    terminalAnsiGreen: '#4EC9B0',
    terminalAnsiBlue: '#6796E6',
    editGlow: '236 72 153', // Pink #EC4899
  },
  tokens: {
    comment: '#6A9955',
    keyword: '#569CD6',
    string: '#CE9178',
    number: '#B5CEA8',
    function: '#DCDCAA',
    type: '#4EC9B0',
    variable: '#9CDCFE',
    constant: '#4FC1FF',
    operator: '#D4D4D4',
    punctuation: '#808080',
    invalid: '#F44747',
    regexp: '#D16969',
    escape: '#D7BA7D',
    tag: '#569CD6',
    attribute: '#9CDCFE',
    deleted: '#CE9178',
    inserted: '#B5CEA8',
    changed: '#569CD6',
    markupHeading: '#569CD6',
    markupBold: '#569CD6',
    markupItalic: '#C586C0',
    markupRaw: '#CE9178',
    controlKeyword: '#C586C0',
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
    editorBackground: '#faf6f1',
    sideBarBackground: '#f5f0e8',
    activityBarBackground: '#f0ebe3',
    sideBarBorder: '#e8ddd0',
    activityBarBorder: '#ddd4c8',
    widgetBorder: '#ddd4c8',
    panelBorder: '#ddd4c8',
    foreground: '#1a1612',
    descriptionForeground: '#6b5e52',
    iconForeground: '#6b5e52',
    focusBorder: '#0052D9', // Semantic blue (keep for consistency)
    buttonBackground: '#0052D9',
    buttonForeground: '#FFFFFF',
    buttonHoverBackground: '#003CAB',
    buttonSecondaryBackground: '#ede4d8',
    buttonSecondaryHoverBackground: '#ddd4c8',
    buttonSecondaryForeground: '#1a1612',
    inputBackground: '#faf6f1',
    inputBorder: '#ddd4c8',
    inputForeground: '#1a1612',
    inputPlaceholderForeground: '#8a7e72',
    dropdownBackground: '#faf6f1',
    dropdownBorder: '#ddd4c8',
    tabActiveBackground: '#faf6f1',
    tabActiveBorderTop: '#0052D9',
    tabActiveForeground: '#1a1612',
    tabInactiveBackground: '#f5f0e8',
    tabInactiveForeground: '#8a7e72',
    tabBorder: '#ddd4c8',
    menuBackground: '#faf6f1',
    menuBorder: '#ddd4c8',
    menuHoverBackground: '#f0ebe3',
    menuSeparatorBackground: '#ddd4c8',
    menuSelectionBackground: '#0052D9',
    menuSelectionForeground: '#FFFFFF',
    listHoverBackground: '#f0ebe3',
    listActiveSelectionBackground: '#e8ddd0',
    listActiveSelectionForeground: '#1a1612',
    toolbarHoverBackground: '#f0ebe3',
    toolbarActiveBackground: '#e8ddd0',
    titleBarBackground: '#faf6f1',
    titleBarBorder: '#ddd4c8',
    titleBarForeground: '#1a1612',
    statusBarBackground: '#faf6f1',
    statusBarBorder: '#ddd4c8',
    statusBarForeground: '#1a1612',
    sideBarForeground: '#1a1612',
    sideBarTitleForeground: '#1a1612',
    sideBarSectionHeaderBackground: '#f0ebe3',
    sideBarSectionHeaderForeground: '#1a1612',
    sideBarSectionHeaderBorder: '#ddd4c8',
    activityBarForeground: '#6b5e52',
    editorSelectionBackground: '#ede4d8',
    editorInactiveSelectionBackground: '#f0ebe3',
    panelBackground: '#faf6f1',
    quickInputBackground: '#faf6f1',
    editorWidgetBackground: '#faf6f1',
    scrollBarSliderBackground: '#00000026',
    scrollBarSliderHoverBackground: '#00000040',
    scrollBarSliderActiveBackground: '#00000052',
    badgeBackground: '#ddd4c8',
    badgeForeground: '#1a1612',
    progressBarBackground: '#0052D9',
    textLinkForeground: '#0052D9',
    textLinkActiveForeground: '#0052D9',
    textBlockQuoteBackground: '#f5f0e8',
    textBlockQuoteBorder: '#ddd4c8',
    textCodeBlockBackground: '#f5f0e8',
    textPreformatForeground: '#1a1612',
    textPreformatBackground: '#e8ddd0',
    editorLineNumberForeground: '#8a7e72',
    editorLineNumberActiveForeground: '#1a1612',
    editorIndentGuideBackground1: '#ddd4c8',
    editorIndentGuideActiveBackground1: '#b14040', // Terracotta accent
    editorGutterAddedBackground: '#4a7a50',
    editorGutterDeletedBackground: '#b14040',
    editorGutterModifiedBackground: '#0052D9',
    errorForeground: '#b14040',
    editorWarningForeground: '#a07830',
    editorInfoForeground: '#3a7870',
    symbolIconEventForeground: '#a07830',
    symbolIconNamespaceForeground: '#7a5ea0',
    symbolIconFileForeground: '#4a70a0',
    symbolIconFolderForeground: '#a07830',
    terminalAnsiGreen: '#4a7a50',
    terminalAnsiBlue: '#4a70a0',
    editGlow: '177 64 64', // Terracotta #b14040
  },
  tokens: {
    comment: '#8a7e72',
    keyword: '#4a70a0',
    string: '#a07830',
    number: '#4a7a50',
    function: '#7a5ea0',
    type: '#3a7870',
    variable: '#1a1612',
    constant: '#0052D9',
    operator: '#6b5e52',
    punctuation: '#8a7e72',
    invalid: '#b14040',
    regexp: '#a07830',
    escape: '#b89838',
    tag: '#7a5ea0',
    attribute: '#a07830',
    deleted: '#b14040',
    inserted: '#4a7a50',
    changed: '#4a70a0',
    markupHeading: '#b14040',
    markupBold: '#1a1612',
    markupItalic: '#7a5ea0',
    markupRaw: '#a07830',
    controlKeyword: '#7a5ea0',
  },
};

// ──────────────────────────────────────────────────────────────────
// Ink Dark (Tokyo Night Moon — purple-gray dark theme)
// ──────────────────────────────────────────────────────────────────

const INK_DARK: AppTheme = {
  id: 'ink-dark',
  isDark: true,
  colors: {
    // Core backgrounds — purple-gray hierarchy
    editorBackground: '#222436',
    sideBarBackground: '#1e2030',
    activityBarBackground: '#1e2030',
    sideBarBorder: '#2f334d',
    activityBarBorder: '#2f334d',
    widgetBorder: '#2f334d',
    panelBorder: '#2f334d',
    foreground: '#c8d3f5',
    descriptionForeground: '#7f88b0',
    iconForeground: '#7f88b0',
    focusBorder: '#82aaff', // Bright blue accent
    buttonBackground: '#82aaff',
    buttonForeground: '#1e2030',
    buttonHoverBackground: '#6090c0',
    buttonSecondaryBackground: '#2f334d',
    buttonSecondaryHoverBackground: '#3d415e',
    buttonSecondaryForeground: '#c8d3f5',
    inputBackground: '#1e2030',
    inputBorder: '#2f334d',
    inputForeground: '#c8d3f5',
    inputPlaceholderForeground: '#7f88b0',
    dropdownBackground: '#1e2030',
    dropdownBorder: '#2f334d',
    tabActiveBackground: '#222436',
    tabActiveBorderTop: '#82aaff',
    tabActiveForeground: '#c8d3f5',
    tabInactiveBackground: '#1e2030',
    tabInactiveForeground: '#7f88b0',
    tabBorder: '#2f334d',
    menuBackground: '#1e2030',
    menuBorder: '#2f334d',
    menuHoverBackground: '#2f334d',
    menuSeparatorBackground: '#2f334d',
    menuSelectionBackground: '#82aaff',
    menuSelectionForeground: '#1e2030',
    listHoverBackground: '#2f334d',
    listActiveSelectionBackground: '#2d3f76',
    listActiveSelectionForeground: '#c8d3f5',
    toolbarHoverBackground: '#2f334d',
    toolbarActiveBackground: '#3d415e',
    titleBarBackground: '#1e2030',
    titleBarBorder: '#2f334d',
    titleBarForeground: '#c8d3f5',
    statusBarBackground: '#1e2030',
    statusBarBorder: '#2f334d',
    statusBarForeground: '#c8d3f5',
    sideBarForeground: '#c8d3f5',
    sideBarTitleForeground: '#c8d3f5',
    sideBarSectionHeaderBackground: '#1e2030',
    sideBarSectionHeaderForeground: '#c8d3f5',
    sideBarSectionHeaderBorder: '#2f334d',
    activityBarForeground: '#7f88b0',
    editorSelectionBackground: '#2d3f76',
    editorInactiveSelectionBackground: '#2f334d',
    panelBackground: '#222436',
    quickInputBackground: '#1e2030',
    editorWidgetBackground: '#1e2030',
    scrollBarSliderBackground: '#79797966',
    scrollBarSliderHoverBackground: '#79797999',
    scrollBarSliderActiveBackground: '#797979AA',
    badgeBackground: '#2f334d',
    badgeForeground: '#c8d3f5',
    progressBarBackground: '#82aaff',
    textLinkForeground: '#82aaff',
    textLinkActiveForeground: '#82aaff',
    textBlockQuoteBackground: '#1e2030',
    textBlockQuoteBorder: '#2f334d',
    textCodeBlockBackground: '#1e2030',
    textPreformatForeground: '#c8d3f5',
    textPreformatBackground: '#2f334d',
    editorLineNumberForeground: '#7f88b0',
    editorLineNumberActiveForeground: '#c8d3f5',
    editorIndentGuideBackground1: '#2f334d',
    editorIndentGuideActiveBackground1: '#82aaff',
    editorGutterAddedBackground: '#c3e88d',
    editorGutterDeletedBackground: '#ff757f',
    editorGutterModifiedBackground: '#82aaff',
    errorForeground: '#ff757f',
    editorWarningForeground: '#ffc777',
    editorInfoForeground: '#86e1fc',
    symbolIconEventForeground: '#ff966c',
    symbolIconNamespaceForeground: '#c099ff',
    symbolIconFileForeground: '#82aaff',
    symbolIconFolderForeground: '#ffc777',
    terminalAnsiGreen: '#c3e88d',
    terminalAnsiBlue: '#82aaff',
    editGlow: '130 170 255', // Bright blue #82aaff
  },
  tokens: {
    comment: '#7f88b0',
    keyword: '#82aaff',
    string: '#ffc777',
    number: '#c3e88d',
    function: '#c099ff',
    type: '#86e1fc',
    variable: '#c8d3f5',
    constant: '#82aaff',
    operator: '#7f88b0',
    punctuation: '#586190',
    invalid: '#ff757f',
    regexp: '#ff966c',
    escape: '#ffc777',
    tag: '#ff757f',
    attribute: '#ffc777',
    deleted: '#ff757f',
    inserted: '#c3e88d',
    changed: '#82aaff',
    markupHeading: '#ff757f',
    markupBold: '#82aaff',
    markupItalic: '#c099ff',
    markupRaw: '#ffc777',
    controlKeyword: '#c099ff',
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