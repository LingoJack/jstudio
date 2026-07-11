/**
 * Lightweight i18n module — no external dependencies.
 *
 * Usage:
 *   import { useI18n } from '../lib/i18n';
 *   const { t } = useI18n();
 *   <p>{t('settings.general')}</p>
 *
 * The current language is stored in the Zustand UI slice and persisted
 * via AppSettings. Components re-render automatically when the language
 * changes because `useI18n()` subscribes to the store.
 *
 * The translation dictionaries live in `./i18n/translations.ts` (data only)
 * to keep this file focused on logic.
 */

import { useStore } from '../../store/useStore';
import { translations } from './i18n/translations';

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
