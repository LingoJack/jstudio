/**
 * Application theme system — shared types & runtime injector.
 *
 * Each theme defines the full palette of CSS variables used across the app,
 * matching the --vscode-* variables in vscode-theme.css.
 *
 * The active theme's colors are injected at runtime via applyAppTheme(),
 * which sets inline styles on <html> to override the static defaults declared
 * in vscode-theme.css (:root / .dark).
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
  /**
   * Extra CSS injected while this theme is active (removed on switch).
   * For structural styling that plain color variables cannot express —
   * border weights, radii, counters (e.g. numbered heading badges).
   * Keep overrides scoped and reversible; colors still belong in `colors`.
   */
  customCss?: string;
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

  // Inject theme-specific CSS overrides. The element is appended last in
  // <head> so equal-specificity rules beat the static vscode-theme.css.
  const CUSTOM_STYLE_ID = 'app-theme-custom-css';
  const customCss = theme.customCss ?? '';
  if (customCss) {
    let styleEl = document.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = CUSTOM_STYLE_ID;
      document.head.appendChild(styleEl);
    }
    if (styleEl.textContent !== customCss) styleEl.textContent = customCss;
  } else {
    document.getElementById(CUSTOM_STYLE_ID)?.remove();
  }

  // Toggle .dark class for Tailwind dark mode
  root.classList.toggle('dark', theme.isDark);

  // Notify listeners that the active theme's CSS variables changed.
  // Used by graph canvas (and other consumers that read --vscode-* vars at
  // runtime) to re-resolve accent colors when the user switches themes within
  // the same mode (e.g. jstudio-light → ink-light), since isDarkMode is unchanged.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('apptheme-change'));
  }
}
