function applyAppTheme(theme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    const cssVarName = `--vscode-${key}`;
    root.style.setProperty(cssVarName, value);
  }
  if (theme.tokens) {
    for (const [key, value] of Object.entries(theme.tokens)) {
      const cssVarName = `--vscode-token-${key}`;
      root.style.setProperty(cssVarName, value);
    }
  }
  root.classList.toggle("dark", theme.isDark);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("apptheme-change"));
  }
}
export {
  applyAppTheme
};
