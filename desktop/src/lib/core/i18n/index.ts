/**
 * Lightweight i18n module - no external dependencies.
 *
 * Usage:
 *   import { useI18n } from '../lib/core/i18n';
 *   const { t } = useI18n();
 *   <p>{t('settings.general')}</p>
 *
 * The current language is stored in the Zustand UI slice and persisted
 * via AppSettings. Components re-render automatically when the language
 * changes because `useI18n()` subscribes to the store.
 *
 * The translation dictionaries live in `./translations.ts` (data only)
 * to keep this file focused on logic.
 */

import { useStore } from '../../../store/useStore';
import { translations } from './translations';

export type Language = 'zh' | 'en';

export { translations };

export type TranslationKey = keyof typeof translations.zh;

/** Replaces {placeholders} in a string with provided values. */
export function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

/**
 * React hook that returns a `t()` function bound to the current language.
 * Components using this hook will re-render when the language changes.
 */
export function useI18n() {
  const language = useStore((s) => s.language);
  const dict = translations[language];

  const t = (key: TranslationKey, vars?: Record<string, string | number>): string => {
    const value = dict[key] ?? translations.zh[key] ?? key;
    return interpolate(value, vars);
  };

  return { t, language };
}

/**
 * Non-hook translation function for use in logic modules (e.g.
 * commandRegistry) that cannot call React hooks. Reads the current
 * language from the store at call time — does not subscribe, so a
 * language change won't re-render callers (they'd need to re-invoke
 * on next interaction anyway).
 */
export function tSync(key: TranslationKey, vars?: Record<string, string | number>): string {
  const language = useStore.getState().language;
  const value = translations[language][key] ?? translations.zh[key] ?? key;
  return interpolate(value, vars);
}
