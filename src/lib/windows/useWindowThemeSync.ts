/**
 * Window theme sync utility — shared hook for independent OS windows.
 *
 * Independent windows (diagram, preview, terminal, document, command-palette)
 * need to:
 * 1. Load the saved app theme settings (appThemeIdDark/Light, themeMode)
 * 2. Resolve whether to use dark or light mode
 * 3. Apply the app theme colors via CSS variable injection
 *
 * This hook centralizes that logic so all windows stay in sync with the main app.
 */

import { useEffect, useState } from 'react';
import { ipc } from '../core/ipc';
import type { ThemeMode } from '../../types/settings';
import {
  applyAppTheme,
  getAppTheme,
  DEFAULT_APP_THEME_ID_DARK,
  DEFAULT_APP_THEME_ID_LIGHT,
} from '../themes';

/**
 * Resolve a theme preference to actual dark/light.
 * When `mode` is `system`, queries the OS via `prefers-color-scheme`.
 */
function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Sync theme from settings and apply app theme colors.
 * Returns `isDark` for components that need to know the mode.
 *
 * Usage:
 *   const isDark = useWindowThemeSync();
 */
export function useWindowThemeSync(): boolean {
  // Start with system preference as initial value to avoid flash
  const [isDark, setIsDark] = useState(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // Apply initial dark class immediately to prevent flash
    document.documentElement.classList.toggle('dark', isDark);

    // Load settings and apply the saved app theme
    ipc.loadSettings().then((settings) => {
      const mode = settings.theme ?? 'system';
      const dark = resolveDark(mode);

      // Determine which app theme ID to use
      const themeId = dark
        ? (settings.appThemeIdDark ?? DEFAULT_APP_THEME_ID_DARK)
        : (settings.appThemeIdLight ?? DEFAULT_APP_THEME_ID_LIGHT);

      // Apply the theme (injects CSS variables + toggles .dark class)
      const theme = getAppTheme(themeId, dark);
      applyAppTheme(theme);

      setIsDark(dark);
    }).catch(() => {
      // Fallback: use system preference and default theme
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const themeId = dark ? DEFAULT_APP_THEME_ID_DARK : DEFAULT_APP_THEME_ID_LIGHT;
      const theme = getAppTheme(themeId, dark);
      applyAppTheme(theme);
      document.documentElement.classList.toggle('dark', dark);
    });

    // Listen for system preference changes (when theme is 'system')
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      ipc.loadSettings().then((settings) => {
        if (settings.theme === 'system') {
          const themeId = e.matches
            ? (settings.appThemeIdDark ?? DEFAULT_APP_THEME_ID_DARK)
            : (settings.appThemeIdLight ?? DEFAULT_APP_THEME_ID_LIGHT);
          const theme = getAppTheme(themeId, e.matches);
          applyAppTheme(theme);
          setIsDark(e.matches);
        }
      }).catch(() => {});
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isDark;
}