import { useEffect, useState } from "react";
import { ipc } from "../core/ipc";
import {
  applyAppTheme,
  getAppTheme,
  DEFAULT_APP_THEME_ID_DARK,
  DEFAULT_APP_THEME_ID_LIGHT
} from "../themes";
function resolveDark(mode) {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function useWindowThemeSync() {
  const [isDark, setIsDark] = useState(() => {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    ipc.loadSettings().then((settings) => {
      const mode = settings.theme ?? "system";
      const dark = resolveDark(mode);
      const themeId = dark ? settings.appThemeIdDark ?? DEFAULT_APP_THEME_ID_DARK : settings.appThemeIdLight ?? DEFAULT_APP_THEME_ID_LIGHT;
      const theme = getAppTheme(themeId, dark);
      applyAppTheme(theme);
      setIsDark(dark);
    }).catch(() => {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const themeId = dark ? DEFAULT_APP_THEME_ID_DARK : DEFAULT_APP_THEME_ID_LIGHT;
      const theme = getAppTheme(themeId, dark);
      applyAppTheme(theme);
      document.documentElement.classList.toggle("dark", dark);
    });
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => {
      ipc.loadSettings().then((settings) => {
        if (settings.theme === "system") {
          const themeId = e.matches ? settings.appThemeIdDark ?? DEFAULT_APP_THEME_ID_DARK : settings.appThemeIdLight ?? DEFAULT_APP_THEME_ID_LIGHT;
          const theme = getAppTheme(themeId, e.matches);
          applyAppTheme(theme);
          setIsDark(e.matches);
        }
      }).catch(() => {
      });
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);
  return isDark;
}
export {
  useWindowThemeSync
};
