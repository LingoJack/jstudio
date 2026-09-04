/** Application settings types - theme, language, cursor styles, activity bar, etc. */

import type { GlobalShortcutConfig } from '../lib/shortcuts/globalShortcuts';

/**
 * Theme preference - `system` follows the OS color scheme.
 */
export type ThemeMode = 'dark' | 'light' | 'system';

/**
 * UI display language.
 */
export type Language = 'zh' | 'en';

/**
 * Terminal cursor shape - mirrors xterm's `cursorStyle` option.
 * The cursor trail follows the same shape so the two stay visually
 * consistent.
 */
export type TerminalCursorStyle = 'block' | 'underline' | 'bar';

/**
 * Editor (contentEditable / ProseMirror) cursor shape.
 * Controls the CSS `caret-shape`-like appearance and the trail geometry.
 * - 'bar'       - thin vertical line (default, classic text-editor caret)
 * - 'block'     - filled rectangle covering the full character cell
 * - 'underline' - horizontal bar at the bottom of the character cell
 */
export type EditorCursorStyle = 'bar' | 'block' | 'underline';

/**
 * How the left sidebar holds its expanded / collapsed state.
 * - 'hover'     - collapsed to the rail, expands while the pointer is over it
 * - 'open'      - locked expanded: mouse-out does not collapse it
 * - 'collapsed' - locked collapsed: hover does not expand it
 */
export type SidebarPinMode = 'hover' | 'open' | 'collapsed';

/**
 * Identifiers for items that can appear in the left Activity Bar.
 * The array order in `ActivityBarItemConfig[]` determines display order.
 */
export type ActivityItemId =
  | 'documents'
  | 'terminal'
  | 'agent'
  | 'browser'
  | 'settings';

/**
 * Configuration for a single Activity Bar entry - visibility + position
 * (position is implied by the array index in `activityBarItems`).
 */
export interface ActivityBarItemConfig {
  id: ActivityItemId;
  visible: boolean;
}

/** Default order & visibility for the Activity Bar. */
export const DEFAULT_ACTIVITY_BAR_ITEMS: ActivityBarItemConfig[] = [
  { id: 'documents', visible: true },
  { id: 'terminal', visible: true },
  { id: 'agent', visible: true },
  { id: 'browser', visible: true },
  { id: 'settings', visible: true },
];

/**
 * Normalizes the Activity Bar config. Guarantees the invariants:
 * 1. Unknown / malformed / duplicate entries are dropped; missing defaults are appended.
 * 2. "settings" is always present, always visible, and always pinned to the bottom.
 */
export function normalizeActivityBarItems(
  items: ActivityBarItemConfig[] | undefined,
): ActivityBarItemConfig[] {
  const knownIds = new Set(DEFAULT_ACTIVITY_BAR_ITEMS.map((d) => d.id));
  const seen = new Set<string>();
  const result: ActivityBarItemConfig[] = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (!item || !knownIds.has(item.id) || typeof item.visible !== 'boolean')
      continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push({ id: item.id, visible: item.visible });
  }
  for (const def of DEFAULT_ACTIVITY_BAR_ITEMS) {
    if (!seen.has(def.id)) result.push({ ...def });
  }

  // Pin settings to the bottom and force it visible.
  const settings = result.find((i) => i.id === 'settings')!;
  return [
    ...result.filter((i) => i.id !== 'settings'),
    { ...settings, visible: true },
  ];
}

export interface AppSettings {
  theme?: ThemeMode;
  /** UI display language - 'zh' (default) or 'en' */
  language?: Language;

  /**
   * Activity Bar item visibility and ordering.
   * Each entry controls one icon; array order determines display order.
   */
  activityBarItems?: ActivityBarItemConfig[];
  /** Latin font preset id - see LATIN_FONTS in lib/fonts.ts */
  fontId?: string;
  /** CJK (Chinese) font preset id - see CJK_FONTS in lib/fonts.ts */
  cjkFontId?: string;
  /** Editor base font size in pixels (12–22) */
  fontSize?: number;
  /** Editor line height / line spacing (1.4–2.2, default 1.7) */
  editorLineHeight?: number;
  /** Editor cursor shape - also drives the editor cursor trail shape */
  editorCursorStyle?: EditorCursorStyle;
  /**
   * Whether the editor uses the animated WebGL cursor trail (default true).
   * When `false`, the native browser caret is used instead - no trail /
   * breathing blink, but also immune to trail-specific caret-placement bugs
   * (e.g. inside code blocks with long, horizontally-scrolled lines).
   */
  editorCursorAnimationEnabled?: boolean;
  /** Sidebar width in pixels (180–480) */
  sidebarWidth?: number;
  /**
   * How the document sidebar holds its expanded/collapsed state:
   *  - 'hover':     collapsed to the rail, expands on hover (auto-expand)
   *  - 'open':      locked expanded — never collapses on mouse-out
   *  - 'collapsed': locked collapsed — never expands on hover
   */
  sidebarPinMode?: SidebarPinMode;
  /** Legacy boolean (true -> 'open', false -> 'hover'). Read only when
   *  `sidebarPinMode` is absent; superseded by it. */
  sidebarPinned?: boolean;
  /** Whether the section outline is pinned (true) or hover-to-expand (false). */
  outlinePinned?: boolean;
  /**
   * App UI color theme for dark mode - see lib/themes/registry.ts.
   * Terminal theme automatically uses the same ID (app theme = terminal theme).
   */
  appThemeIdDark?: string;
  /**
   * App UI color theme for light mode - see lib/themes/registry.ts.
   * Terminal theme automatically uses the same ID (app theme = terminal theme).
   */
  appThemeIdLight?: string;
  /** Terminal font size in pixels (independent from editor font size) */
  terminalFontSize?: number;
  /** Terminal monospace font id - see MONOSPACE_FONTS in lib/fonts.ts */
  terminalFontId?: string;
  /** Terminal cursor shape - also drives the cursor trail shape */
  terminalCursorStyle?: TerminalCursorStyle;
  /** Tab bar position - 'top' or 'bottom' (default: 'bottom') */
  tabBarPosition?: 'top' | 'bottom';
  /** User-customized keyboard shortcut overrides - see lib/shortcuts.ts */
  keyboardShortcuts?: Record<string, string>;
  /** OS-level global shortcut configs - see lib/shortcuts/globalShortcuts.ts */
  globalShortcuts?: GlobalShortcutConfig[];
  /**
   * Whether the runtime logger is enabled (default false). When true, the
   * frontend logger captures uncaught errors, unhandled rejections,
   * console.error/warn, and manual `logger.*` calls, flushing them to
   * `~/.jdata/studio/logs/app-YYYY-MM-DD.log` via `append_log_line`.
   * Off by default to avoid disk writes / perf overhead in normal use.
   */
  runtimeLoggingEnabled?: boolean;
  /**
   * Whether to show a confirmation dialog before exiting the app
   * (closing the last main-window tab or pressing Cmd+Q). Default true.
   */
  confirmOnExit?: boolean;
  /**
   * Tab bar glassmorphism background opacity (0.02–0.15).
   * Controls the transparency of the floating pill-shaped tab bar container.
   * Higher = more visible/solid; lower = more transparent/glass-like.
   */
  tabBarGlassOpacity?: number;
  /**
   * Whether JStudio has attempted to auto-install the CLI (`j` command).
   * Used to prevent repeated installation prompts on every startup.
   * Set to `true` after the first attempt (successful or failed).
   */
  jcliAutoInstallAttempted?: boolean;

  /** Browser start page: selected search engine id (see SEARCH_ENGINES). */
  browserSearchEngine?: string;
  /** Browser start page: quick-link shortcuts. */
  browserShortcuts?: unknown;

  /** Agent active workspace path (persisted across sessions). */
  agentActiveWorkspace?: string;

  /** Remote account: backend base URL (normalized, no trailing slash). */
  remoteServerUrl?: string;
  /** Remote account: session token (null = logged out / cleared). */
  remoteAuthToken?: string | null;
  /** Remote account: token expiry, RFC3339 from the login response. */
  remoteTokenExpiresAt?: string | null;
  /** Remote account: authenticated user id. */
  remoteUserId?: string | null;
  /** Remote account: authenticated username. */
  remoteUsername?: string | null;

  [key: string]: unknown;
}
