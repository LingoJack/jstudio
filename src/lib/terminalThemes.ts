/**
 * Terminal themes — maps to kitty color schemes.
 *
 * Each theme defines the full xterm.js ITheme-compatible palette plus
 * a `ui` sub-object for the surrounding panel chrome (top bar background,
 * border, label color) so the whole panel feels native to the theme.
 *
 * Colors are lifted directly from the kitty .conf files:
 *   ~/.config/kitty/theme-anthropic-dark.conf  →  anthropic-dark
 *   ~/.config/kitty/theme-anthropic-light.conf →  anthropic-light
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
  // Anthropic Dark  (theme-anthropic-dark.conf)
  // ──────────────────────────────────────────────
  {
    id: 'anthropic-dark',
    isDark: true,
    background: '#222436',
    foreground: '#c8d3f5',
    cursor: '#00aaff',
    cursorAccent: '#222436',
    selectionBackground: '#2d3f76',
    selectionForeground: '#c8d3f5',
    black: '#1b1d2b',
    red: '#ff757f',
    green: '#c3e88d',
    yellow: '#ffc777',
    blue: '#82aaff',
    magenta: '#c099ff',
    cyan: '#86e1fc',
    white: '#828bb8',
    brightBlack: '#444a73',
    brightRed: '#ff757f',
    brightGreen: '#c3e88d',
    brightYellow: '#ffc777',
    brightBlue: '#82aaff',
    brightMagenta: '#c099ff',
    brightCyan: '#86e1fc',
    brightWhite: '#c8d3f5',
    ui: {
      barBg: '#1e2030',
      barBorder: '#2f334d',
      barFg: '#82aaff',
      panelBg: '#222436',
    },
  },
  // ──────────────────────────────────────────────
  // Anthropic Light  (theme-anthropic-light.conf)
  // ──────────────────────────────────────────────
  {
    id: 'anthropic-light',
    isDark: false,
    background: '#e1e2e7',
    foreground: '#373641',
    cursor: '#00aaff',
    cursorAccent: '#e1e2e7',
    selectionBackground: '#b6bfe2',
    selectionForeground: '#373641',
    black: '#e9e9ed',
    red: '#f52a4e',
    green: '#49ad2c',
    yellow: '#b08800',
    blue: '#3a64ea',
    magenta: '#c41de0',
    cyan: '#1c8ed0',
    white: '#373641',
    brightBlack: '#8b8d97',
    brightRed: '#f52a4e',
    brightGreen: '#49ad2c',
    brightYellow: '#b08800',
    brightBlue: '#3a64ea',
    brightMagenta: '#c41de0',
    brightCyan: '#1c8ed0',
    brightWhite: '#4f505c',
    ui: {
      barBg: '#d4d5db',
      barBorder: '#c0c2cc',
      barFg: '#3a64ea',
      panelBg: '#e1e2e7',
    },
  },
];

/** Default terminal theme for new users. */
export const DEFAULT_TERMINAL_THEME_ID = 'anthropic-dark';

/** Find a theme by id, falling back to the default. */
export function getTerminalTheme(id: string | undefined): TerminalTheme {
  return (
    TERMINAL_THEMES.find((t) => t.id === id) ??
    TERMINAL_THEMES.find((t) => t.id === DEFAULT_TERMINAL_THEME_ID)!
  );
}

/**
 * Pick a sensible default terminal theme based on whether the app is in
 * dark or light mode. Used when the user selects "auto" behavior.
 */
export function autoTerminalTheme(isDark: boolean): TerminalTheme {
  return TERMINAL_THEMES.find((t) => t.isDark === isDark)!;
}
