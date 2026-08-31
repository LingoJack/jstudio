import type { AppTheme } from './types';
import { JSTUDIO_LIGHT } from './jstudio-light';
import { JSTUDIO_DARK } from './jstudio-dark';
import { INK_LIGHT } from './ink-light';
import { INK_DARK } from './ink-dark';
import { PAPER_LIGHT } from './paper-light';

// ──────────────────────────────────────────────────────────────────
// Theme registry — exported themes array + lookup helpers.
// Add a new theme: create themes/<id>.ts, then append it to APP_THEMES.
// ──────────────────────────────────────────────────────────────────

export const APP_THEMES: AppTheme[] = [
  JSTUDIO_LIGHT,
  JSTUDIO_DARK,
  INK_LIGHT,
  INK_DARK,
  PAPER_LIGHT,
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
