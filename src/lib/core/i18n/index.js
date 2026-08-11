import { useStore } from "../../../store/useStore";
import { translations } from "./translations";
function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}
function useI18n() {
  const language = useStore((s) => s.language);
  const dict = translations[language];
  const t = (key, vars) => {
    const value = dict[key] ?? translations.zh[key] ?? key;
    return interpolate(value, vars);
  };
  return { t, language };
}
function tSync(key, vars) {
  const language = useStore.getState().language;
  const value = translations[language][key] ?? translations.zh[key] ?? key;
  return interpolate(value, vars);
}
export {
  interpolate,
  tSync,
  translations,
  useI18n
};
