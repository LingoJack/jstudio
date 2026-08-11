import { JSTUDIO_LIGHT } from "./jstudio-light";
import { JSTUDIO_DARK } from "./jstudio-dark";
import { INK_LIGHT } from "./ink-light";
import { INK_DARK } from "./ink-dark";
import { PAPER_LIGHT } from "./paper-light";
const APP_THEMES = [
  JSTUDIO_LIGHT,
  JSTUDIO_DARK,
  INK_LIGHT,
  INK_DARK,
  PAPER_LIGHT
];
const DEFAULT_APP_THEME_ID_LIGHT = "jstudio-light";
const DEFAULT_APP_THEME_ID_DARK = "jstudio-dark";
function getAppTheme(id, isDark) {
  const resolved = APP_THEMES.find((t) => t.id === id);
  if (resolved) return resolved;
  return APP_THEMES.find((t) => t.id === (isDark ? DEFAULT_APP_THEME_ID_DARK : DEFAULT_APP_THEME_ID_LIGHT));
}
function getAppThemesByMode(isDark) {
  return APP_THEMES.filter((t) => t.isDark === isDark);
}
export {
  APP_THEMES,
  DEFAULT_APP_THEME_ID_DARK,
  DEFAULT_APP_THEME_ID_LIGHT,
  getAppTheme,
  getAppThemesByMode
};
