/**
 * CommandPalette shared utilities.
 *
 * Extracted from CommandPalette.tsx and CommandPaletteWindow.tsx
 * to eliminate duplication.
 */

import type { LucideIcon } from 'lucide-react';
import { Settings2, PenLine, TerminalSquare, Keyboard, BookOpen, Info } from 'lucide-react';
import React from 'react';
import type { SettingsSectionId } from '../../store/uiSlice';
import type { TranslationKey } from '../core/i18n';

// ──────────────────────────────────────────────────────────────────
// Settings Sections Metadata
// ──────────────────────────────────────────────────────────────────

/**
 * Settings sections metadata for command palette navigation.
 * Single source of truth — used by both CommandPalette and CommandPaletteWindow.
 */
export const SETTINGS_SECTIONS: { id: SettingsSectionId; icon: LucideIcon; labelKey: TranslationKey }[] = [
  { id: 'general', icon: Settings2, labelKey: 'settings.general' },
  { id: 'editor', icon: PenLine, labelKey: 'settings.editor' },
  { id: 'terminal', icon: TerminalSquare, labelKey: 'settings.terminal' },
  { id: 'shortcuts', icon: Keyboard, labelKey: 'settings.shortcuts' },
  { id: 'help', icon: BookOpen, labelKey: 'settings.help' },
  { id: 'about', icon: Info, labelKey: 'settings.about' },
];

// ──────────────────────────────────────────────────────────────────
// Highlighted Text Component
// ──────────────────────────────────────────────────────────────────

interface HighlightedTextProps {
  text: string;
  match: [number, number] | null;
}

/**
 * Render text with a highlighted (bold) substring match.
 * Used for fuzzy search result display in command palette.
 */
export function HighlightedText({ text, match }: HighlightedTextProps): React.ReactElement {
  if (!match) return <>{text}</>;
  const [start, end] = match;
  return (
    <>
      {text.slice(0, start)}
      <span className="font-semibold text-[var(--vscode-textLink-activeForeground)]">
        {text.slice(start, end)}
      </span>
      {text.slice(end)}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Session Title Helper
// ──────────────────────────────────────────────────────────────────

interface TerminalSessionLike {
  title?: string | null;
  customTitle?: string | null;
  autoTitle?: string | null;
  cwd?: string | null;
  id: string;
}

/**
 * Get the display title for a terminal session.
 * Order of preference: customTitle > autoTitle > title > cwd > id
 */
export function getSessionTitle(s: TerminalSessionLike): string {
  return s.customTitle || s.autoTitle || s.title || s.cwd || s.id || 'Session';
}

// ──────────────────────────────────────────────────────────────────
// Date Formatting Helpers
// ──────────────────────────────────────────────────────────────────

type SupportedLanguage = 'zh' | 'en';

const DATE_LOCALE_MAP: Record<SupportedLanguage, string> = {
  zh: 'zh-CN',
  en: 'en-US',
};

/**
 * Format a date timestamp to locale-specific date string.
 * @param timestamp - Unix timestamp in milliseconds
 * @param language - 'zh' or 'en'
 */
export function formatDate(timestamp: number, language: SupportedLanguage = 'zh'): string {
  return new Date(timestamp).toLocaleDateString(DATE_LOCALE_MAP[language] || 'en-US');
}

/**
 * Format a date timestamp to locale-specific date string, with fallback.
 * @param timestamp - Unix timestamp in milliseconds or string or null/undefined
 * @param language - 'zh' or 'en'
 * @param fallback - String to return when timestamp is null/undefined
 */
export function formatDateOr(timestamp: number | string | null | undefined, language: SupportedLanguage = 'zh', fallback = ''): string {
  if (!timestamp) return fallback;
  // `new Date()` natively parses ISO 8601 strings AND accepts numeric
  // millisecond timestamps, so it handles both the string form stored in
  // DocumentMeta (e.g. "2024-01-15T10:30:00.000Z") and plain numbers.
  // NOTE: previously used `parseInt` which silently truncated ISO strings
  // to the year (e.g. 2024) and rendered every date as 1970-01-01.
  const numTs = new Date(timestamp).getTime();
  if (isNaN(numTs)) return fallback;
  return formatDate(numTs, language);
}