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

/** App-wide semantic cursor colors: dark mode uses green, light mode uses blue. */
export const TERMINAL_CURSOR_DARK = '#07C160';
export const TERMINAL_CURSOR_LIGHT = '#0052D9';

export function getSemanticTerminalCursor(isDarkMode: boolean): string {
  return isDarkMode ? TERMINAL_CURSOR_DARK : TERMINAL_CURSOR_LIGHT;
}

/**
 * Keep the selected terminal palette, but make cursor color follow the
 * app's black/green/blue/white design language instead of per-theme accents.
 */
export function withSemanticTerminalCursor(
  theme: TerminalTheme,
  isDarkMode: boolean,
): TerminalTheme {
  return {
    ...theme,
    cursor: getSemanticTerminalCursor(isDarkMode),
    cursorAccent: theme.background,
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
    background: '#222436',
    foreground: '#c8d3f5',
    cursor: '#00aaff',
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
  // Ink Light  (theme-anthropic-light.conf — Tokyo Night Light palette)
  //   Refined: bright ANSI colors are now visibly brighter than their
  //   normal counterparts (the original kitty file had them identical).
  // ──────────────────────────────────────────────
  {
    id: 'ink-light',
    isDark: false,
    background: '#e1e2e7',
    foreground: '#373641',
    cursor: '#00aaff',
    cursorAccent: '#e1e2e7',
    selectionBackground: '#b6bfe2',
    selectionInactiveBackground: '#b6bfe2',
    selectionForeground: '#373641',
    black: '#e9e9ed',
    red: '#f52a4e',
    green: '#49ad2c',
    yellow: '#b08800',
    blue: '#3a64ea',
    magenta: '#c41de0',
    cyan: '#1c8ed0',
    white: '#373641',
    brightBlack: '#a0a2ab',
    brightRed: '#ff5577',
    brightGreen: '#5fc940',
    brightYellow: '#d4a017',
    brightBlue: '#5a7eff',
    brightMagenta: '#d44ff0',
    brightCyan: '#35a3e0',
    brightWhite: '#6a6b76',
    ui: {
      barBg: '#d4d5db',
      barBorder: '#c0c2cc',
      barFg: '#6a6b76',
      panelBg: '#e1e2e7',
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
    background: '#181818',
    foreground: '#CCCCCC',
    cursor: '#0078D4',
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
      barBorder: '#2B2B2B',
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
    background: '#F8F8F8',
    foreground: '#3B3B3B',
    cursor: '#005FB8',
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
];

/** Default terminal theme for dark mode. */
export const DEFAULT_TERMINAL_THEME_ID_DARK = 'jstudio-dark';

/** Default terminal theme for light mode. */
export const DEFAULT_TERMINAL_THEME_ID_LIGHT = 'jstudio-light';

/** @deprecated Use DEFAULT_TERMINAL_THEME_ID_DARK instead. */
export const DEFAULT_TERMINAL_THEME_ID = DEFAULT_TERMINAL_THEME_ID_DARK;

/** Legacy theme id aliases → current id. Keeps settings stored by older
 *  builds (e.g. "anthropic-dark") resolving to the renamed theme. */
const THEME_ID_ALIASES: Record<string, string> = {
  'anthropic-dark': 'ink-dark',
  'anthropic-light': 'ink-light',
};

/** Find a theme by id, falling back to the dark default. */
export function getTerminalTheme(id: string | undefined): TerminalTheme {
  const resolved = id ? THEME_ID_ALIASES[id] ?? id : undefined;
  return (
    TERMINAL_THEMES.find((t) => t.id === resolved) ??
    TERMINAL_THEMES.find((t) => t.id === DEFAULT_TERMINAL_THEME_ID_DARK)!
  );
}

/**
 * Pick a sensible default terminal theme based on whether the app is in
 * dark or light mode. Used when the user selects "auto" behavior.
 */
export function autoTerminalTheme(isDark: boolean): TerminalTheme {
  return TERMINAL_THEMES.find((t) => t.isDark === isDark)!;
}
