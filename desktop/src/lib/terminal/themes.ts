/**
 * Terminal themes — maps to kitty color schemes.
 *
 * Each theme defines the full xterm.js ITheme-compatible palette plus
 * a `ui` sub-object for the surrounding panel chrome (top bar background,
 * border, label color) so the whole panel feels native to the theme.
 *
 * Colors are lifted directly from the kitty .conf files:
 *   ~/.config/kitty/theme-anthropic-dark.conf  →  ink-dark
 *   ~/.config/kitty/theme-anthropic-light.conf →  ink-light
 */

export interface TerminalTheme {
  id: string;
  /** Whether this is a dark theme (affects light/dirty auto-selection). */
  isDark: boolean;
  /**
   * Opacity for SGR 2 (dim/faint) text — kitty's `dim_opacity`, ported.
   * xterm hardcodes 0.5 with no option; we patch the WebGL addon to read
   * this per theme. Light themes use 1.0: dim was designed against a dark
   * canvas, and a 50%-opacity wash is unreadable on light backgrounds
   * (CodeBuddy/Claude Code separators, hints). Dark themes keep 0.5.
   */
  dimOpacity: number;
  // xterm.js palette
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  /** Selection color when the terminal is NOT focused. Kept equal to
   *  `selectionBackground` so the selection stays a solid, clearly visible
   *  block (VSCode-like) even after focus leaves the terminal — otherwise
   *  xterm falls back to a faint translucent default. */
  selectionInactiveBackground: string;
  selectionForeground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
  // Panel chrome (surrounding UI)
  ui: {
    barBg: string;
    barBorder: string;
    barFg: string;
    panelBg: string;
  };
}

export const TERMINAL_THEMES: TerminalTheme[] = [
  // ──────────────────────────────────────────────
  // Ink Dark  (theme-anthropic-dark.conf — Tokyo Night Storm palette)
  //   Refined: bright ANSI colors are now visibly brighter than their
  //   normal counterparts (the original kitty file had them identical).
  // ──────────────────────────────────────────────
  {
    id: 'ink-dark',
    isDark: true,
    dimOpacity: 0.5,
    background: '#222436',
    foreground: '#c8d3f5',
    cursor: '#82aaff',
    cursorAccent: '#222436',
    selectionBackground: '#2d3f76',
    selectionInactiveBackground: '#2d3f76',
    selectionForeground: '#c8d3f5',
    black: '#1b1d2b',
    red: '#ff757f',
    green: '#c3e88d',
    yellow: '#ffc777',
    blue: '#82aaff',
    magenta: '#c099ff',
    cyan: '#86e1fc',
    white: '#828bb8',
    brightBlack: '#586190',
    brightRed: '#ff9eac',
    brightGreen: '#d7f0a3',
    brightYellow: '#ffd99a',
    brightBlue: '#a3bcff',
    brightMagenta: '#d4b4ff',
    brightCyan: '#a9edff',
    brightWhite: '#e6ecff',
    ui: {
      barBg: '#1e2030',
      barBorder: '#2f334d',
      barFg: '#7f88b0',
      panelBg: '#222436',
    },
  },
  // ──────────────────────────────────────────────
  // Ink Light  (theme-anthropic-light.conf — Anthropic 米白赭陶 palette)
  //   Warm cream background with terracotta accents.
  //   Colors lifted directly from ~/.config/kitty/theme-anthropic-light.conf
  // ──────────────────────────────────────────────
  {
    id: 'ink-light',
    isDark: false,
    dimOpacity: 1,
    background: '#faf6f1',
    foreground: '#1a1612',
    cursor: '#0052D9',
    cursorAccent: '#faf6f1',
    selectionBackground: '#ede4d8',
    selectionInactiveBackground: '#ede4d8',
    selectionForeground: '#1a1612',
    black: '#1a1612',
    red: '#b14040',
    green: '#4a7a50',
    yellow: '#a07830',
    blue: '#4a70a0',
    magenta: '#7a5ea0',
    cyan: '#3a7870',
    white: '#6b5e52',
    brightBlack: '#8a7e72',
    brightRed: '#cc5050',
    brightGreen: '#5a9a60',
    brightYellow: '#b89838',
    brightBlue: '#6090c0',
    brightMagenta: '#9a78c0',
    brightCyan: '#4a9888',
    brightWhite: '#ede4d8',
    ui: {
      barBg: '#ede4d8',
      barBorder: '#ddd4c8',
      barFg: '#6b5e52',
      panelBg: '#faf6f1',
    },
  },
  // ──────────────────────────────────────────────
  // JStudio Dark  (matches app's VSCode Dark Modern theme)
  //   editor-bg #181818 · sidebar #1F1F1F · border #2B2B2B
  //   ANSI 16-color from VSCode Dark+ terminal defaults
  // ──────────────────────────────────────────────
  {
    id: 'jstudio-dark',
    isDark: true,
    dimOpacity: 0.5,
    background: '#181818',
    foreground: '#CCCCCC',
    cursor: '#07C160',
    cursorAccent: '#181818',
    selectionBackground: '#264F78',
    selectionInactiveBackground: '#264F78',
    selectionForeground: '#FFFFFF',
    black: '#000000',
    red: '#F44747',
    green: '#6A9955',
    yellow: '#D7BA7D',
    blue: '#569CD6',
    magenta: '#C586C0',
    cyan: '#4EC9B0',
    white: '#D4D4D4',
    brightBlack: '#808080',
    brightRed: '#F44747',
    brightGreen: '#6A9955',
    brightYellow: '#D7BA7D',
    brightBlue: '#569CD6',
    brightMagenta: '#C586C0',
    brightCyan: '#4EC9B0',
    brightWhite: '#FFFFFF',
    ui: {
      barBg: '#1F1F1F',
      barBorder: '#5A5A5A',
      barFg: '#CCCCCC',
      panelBg: '#181818',
    },
  },
  // ──────────────────────────────────────────────
  // JStudio Light  (matches app's VSCode Light Modern theme)
  //   editor-bg #F8F8F8 · sidebar #FFFFFF · border #E5E5E5
  //   ANSI 16-color from VSCode Light+ terminal defaults
  // ──────────────────────────────────────────────
  {
    id: 'jstudio-light',
    isDark: false,
    dimOpacity: 1,
    background: '#F8F8F8',
    foreground: '#3B3B3B',
    cursor: '#0052D9',
    cursorAccent: '#F8F8F8',
    selectionBackground: '#ADD6FF',
    selectionInactiveBackground: '#ADD6FF',
    selectionForeground: '#1E1E1E',
    black: '#000000',
    red: '#CD3131',
    green: '#00BC00',
    yellow: '#949800',
    blue: '#0451A5',
    magenta: '#BC05BC',
    cyan: '#0598BC',
    white: '#555555',
    brightBlack: '#666666',
    brightRed: '#CD3131',
    brightGreen: '#14CE14',
    brightYellow: '#B5BA00',
    brightBlue: '#0451A5',
    brightMagenta: '#BC05BC',
    brightCyan: '#0598BC',
    brightWhite: '#A5A5A5',
    ui: {
      barBg: '#FFFFFF',
      barBorder: '#E5E5E5',
      barFg: '#3B3B3B',
      panelBg: '#F8F8F8',
    },
  },
  // ──────────────────────────────────────────────
  // Paper Light  (matches app's paper-light 纯白文档风)
  //   背景 #ffffff 与 app chrome 无缝（activityBar/editor 均 #ffffff），
  //   若回退 jstudio-light 的 #F8F8F8 会与白色活动栏形成色差。
  //   ANSI 以主题青色 (teal #05838B) 为主色相，绿/红/黄取自主题既有
  //   token（terminal-ansi*、gutter、error/warning），亮色按 VSCode
  //   Light 惯例仅在绿/黄/灰阶上提亮。
  // ──────────────────────────────────────────────
  {
    id: 'paper-light',
    isDark: false,
    dimOpacity: 1,
    background: '#ffffff',
    foreground: '#1a1a1a',
    cursor: '#05838B',
    cursorAccent: '#ffffff',
    selectionBackground: '#B8ECE8',
    selectionInactiveBackground: '#B8ECE8',
    selectionForeground: '#1a1a1a',
    black: '#1a1a1a',
    red: '#cf1322',
    green: '#389e0d',
    yellow: '#ad6800',
    blue: '#034F55',
    magenta: '#531dab',
    cyan: '#05838B',
    white: '#595959',
    brightBlack: '#8c8c8c',
    brightRed: '#e2574b',
    brightGreen: '#52b522',
    brightYellow: '#cf9a00',
    brightBlue: '#05838B',
    brightMagenta: '#7a45d6',
    brightCyan: '#0a9aa4',
    brightWhite: '#a5a5a5',
    ui: {
      barBg: '#ffffff',
      barBorder: '#D9D9D9',
      barFg: '#595959',
      panelBg: '#ffffff',
    },
  },
  // ──────────────────────────────────────────────
  // Editorial Light  (matches app's editorial-light 杂志印刷风)
  //   纯白底与 app chrome 无缝（同 paper-light 的理由）；ANSI 锚定主题
  //   既有 token：蓝=宝蓝 terminal-ansiBlue、绿=terminal-ansiGreen、
  //   红=error/deleted、黄=warning/number、紫=function、青=type，
  //   灰阶用主题的暖灰系；亮色提亮一档（同 VSCode Light 惯例）。
  // ──────────────────────────────────────────────
  {
    id: 'editorial-light',
    isDark: false,
    dimOpacity: 1,
    background: '#ffffff',
    foreground: '#1A1A1A',
    cursor: '#2B4BD7',
    cursorAccent: '#ffffff',
    selectionBackground: '#D6DEF9',
    selectionInactiveBackground: '#D6DEF9',
    selectionForeground: '#1A1A1A',
    black: '#1A1A1A',
    red: '#C0392B',
    green: '#2E7D32',
    yellow: '#9A6B15',
    blue: '#2B4BD7',
    magenta: '#7E5AA6',
    cyan: '#38746A',
    white: '#5C5A55',
    brightBlack: '#9A968E',
    brightRed: '#D95A4C',
    brightGreen: '#48A34C',
    brightYellow: '#C08A2A',
    brightBlue: '#556EE0',
    brightMagenta: '#9878C8',
    brightCyan: '#4E968C',
    brightWhite: '#B3AFA7',
    ui: {
      barBg: '#ffffff',
      barBorder: '#E2E0DA',
      barFg: '#5C5A55',
      panelBg: '#ffffff',
    },
  },
  // ──────────────────────────────────────────────
  // Paper Dark  (matches app's paper-dark 墨夜青调)
  //   青调墨夜底与 app chrome 无缝；ANSI 以亮青 #3FB6BF 为主色相，
  //   绿/黄/紫/橙锚定 app 主题 token；亮色变体比 normal 更亮（暗色惯例）。
  // ──────────────────────────────────────────────
  {
    id: 'paper-dark',
    isDark: true,
    dimOpacity: 0.5,
    background: '#0F1516',
    foreground: '#D7E2E0',
    cursor: '#3FB6BF',
    cursorAccent: '#0F1516',
    selectionBackground: '#12494F',
    selectionInactiveBackground: '#12494F',
    selectionForeground: '#D7E2E0',
    black: '#1A2424',
    red: '#E5766A',
    green: '#57C579',
    yellow: '#D9A44A',
    blue: '#3FB6BF',
    magenta: '#B79BE0',
    cyan: '#4FC3CC',
    white: '#8CA39F',
    brightBlack: '#5F7572',
    brightRed: '#EF8A7E',
    brightGreen: '#6FD289',
    brightYellow: '#E5B862',
    brightBlue: '#5CC4CC',
    brightMagenta: '#C7ACE8',
    brightCyan: '#6FD4DB',
    brightWhite: '#EAF2F0',
    ui: {
      barBg: '#131B1B',
      barBorder: '#1F565B',
      barFg: '#8CA39F',
      panelBg: '#0F1516',
    },
  },
  // ──────────────────────────────────────────────
  // Editorial Dark  (matches app's editorial-dark 夜间印刷)
  //   墨夜底与 app chrome 无缝；ANSI 锚定 app 主题 token：蓝=浅宝蓝、
  //   绿/黄/紫同源，灰阶用主题暖灰系；亮色变体比 normal 更亮。
  // ──────────────────────────────────────────────
  {
    id: 'editorial-dark',
    isDark: true,
    dimOpacity: 0.5,
    background: '#1A1A1C',
    foreground: '#E8E6E1',
    cursor: '#8CA2F8',
    cursorAccent: '#1A1A1C',
    selectionBackground: '#33427E',
    selectionInactiveBackground: '#33427E',
    selectionForeground: '#E8E6E1',
    black: '#222225',
    red: '#E0705F',
    green: '#5CB868',
    yellow: '#D9A94E',
    blue: '#8CA2F8',
    magenta: '#B79BE0',
    cyan: '#6FB5AB',
    white: '#A5A29A',
    brightBlack: '#6E6B64',
    brightRed: '#EA8A7E',
    brightGreen: '#74CC80',
    brightYellow: '#E5BC66',
    brightBlue: '#A3B4FA',
    brightMagenta: '#C7ACE8',
    brightCyan: '#84C6BC',
    brightWhite: '#F2F0EB',
    ui: {
      barBg: '#202023',
      barBorder: '#333336',
      barFg: '#A5A29A',
      panelBg: '#1A1A1C',
    },
  },
];

/** Default terminal theme for dark mode. */
export const DEFAULT_TERMINAL_THEME_ID_DARK = 'jstudio-dark';

/** Default terminal theme for light mode. */
export const DEFAULT_TERMINAL_THEME_ID_LIGHT = 'jstudio-light';

/**
 * Get the terminal theme that matches the current app theme.
 * App theme IDs and terminal theme IDs are the same (jstudio-dark, jstudio-light, ink-dark, ink-light),
 * so this simply uses the app theme ID to find the corresponding terminal theme.
 *
 * @param appThemeId - The current app theme ID (e.g. 'jstudio-dark', 'ink-light')
 * @param isDarkMode - Whether the app is in dark mode (used for fallback)
 * @returns The matching terminal theme
 */
export function getTerminalThemeFromAppTheme(
  appThemeId: string,
  isDarkMode: boolean,
): TerminalTheme {
  // Try to find a terminal theme with the same ID as the app theme
  const matched = TERMINAL_THEMES.find((t) => t.id === appThemeId);
  if (matched) return matched;

  // Fallback: if app theme ID doesn't match any terminal theme,
  // use the default for the current mode
  const defaultId = isDarkMode ? DEFAULT_TERMINAL_THEME_ID_DARK : DEFAULT_TERMINAL_THEME_ID_LIGHT;
  return TERMINAL_THEMES.find((t) => t.id === defaultId)!;
}
