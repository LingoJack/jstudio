/**
 * Format an ISO timestamp as a relative time string ("5 min ago", "yesterday").
 *
 * Used by the document panel to show when the active document was last edited.
 * Falls back to `formatDate` for timestamps older than a week.
 */

import type { Language, TranslationKey } from '../core/i18n';
import { formatDate } from '../commandPalette/shared';

export function formatRelativeEditedTime(
  iso: string,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
  language: Language,
): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return t('agent.justNow');
  if (diff < 3600) return t('agent.minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('agent.hoursAgo', { n: Math.floor(diff / 3600) });
  if (diff < 172800) return t('agent.yesterday');
  if (diff < 604800) return t('agent.daysAgo', { n: Math.floor(diff / 86400) });
  return formatDate(ms, language);
}
