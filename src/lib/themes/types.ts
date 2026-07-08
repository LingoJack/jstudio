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
