/**
 * ShortcutsSection — in-app keyboard shortcut editor.
 *
 * List editor (VS Code style) instead of a tile grid: each row reads
 * left → right as "what it does" → "how to trigger it", so a 30-entry
 * list stays scannable. Rows are grouped by category, filterable by a
 * search box and an all / modified / conflicts segmented control.
 *
 * Clicking anywhere on a row starts recording; Escape cancels,
 * Backspace clears the binding. Conflicts are surfaced inline on every
 * involved row (both sides get a red rail + the conflicting command).
 */

import { useState, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useI18n, type TranslationKey } from '../../lib/core/i18n';
import { useStore } from '../../store/useStore';
import {
  SHORTCUTS,
  REFERENCE_SHORTCUTS,
  CATEGORY_ORDER,
  CATEGORY_LABEL_KEYS,
  getShortcutsByCategory,
  resolveBinding,
  bindingToDisplay,
  eventToBinding,
  detectConflicts,
  conflictingDefs,
  checkBindingConflict,
  type ShortcutCategory,
  type ShortcutDef,
} from '../../lib/shortcuts/keyboardShortcuts';
import { toast } from '../../lib/core/toast';
import { handleNativeSelectAll } from '../../lib/shortcuts/nativeSelectAll';
import {
  GroupHeading,
  PANEL_BORDER,
  PANEL_DIVIDER,
  PANEL_SURFACE,
} from './KbdKeycap';
import { ShortcutRow, ReferenceShortcuts } from './ShortcutRow';
import { GlobalShortcutsContent } from './GlobalShortcutsSection';

// ────────────────────────────────────────────────────────────────────────────
// Filters
// ────────────────────────────────────────────────────────────────────────────

type ShortcutFilter = 'all' | 'modified' | 'conflicts';

const FILTER_MODES: ShortcutFilter[] = ['all', 'modified', 'conflicts'];

const FILTER_LABEL_KEYS: Record<ShortcutFilter, TranslationKey> = {
  all: 'shortcut.filterAll',
  modified: 'shortcut.customized',
  conflicts: 'shortcut.filterConflicts',
};

const REFERENCE_COUNT = REFERENCE_SHORTCUTS.reduce((n, g) => n + g.items.length, 0);

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export default function ShortcutsSection({
  anchorJumpSignal,
}: {
  /** Bumped by SettingsPanel on every left-nav jump; see SettingsPanel. */
  anchorJumpSignal?: number;
}) {
  const { t } = useI18n();
  const overrides = useStore((s) => s.keyboardShortcuts);
  const setKeyboardShortcut = useStore((s) => s.setKeyboardShortcut);
  const resetKeyboardShortcut = useStore((s) => s.resetKeyboardShortcut);
  const resetAllKeyboardShortcuts = useStore((s) => s.resetAllKeyboardShortcuts);

  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ShortcutFilter>('all');

  // A left-nav jump targets a category anchor that an active search/filter may
  // have filtered out — and an unmounted anchor cannot be scrolled to. Clear
  // the filter on every jump. Adjusted during render (not in an effect) so the
  // anchor exists in the same commit the double-rAF scroll runs against.
  const [seenJumpSignal, setSeenJumpSignal] = useState(anchorJumpSignal);
  if (anchorJumpSignal !== seenJumpSignal) {
    setSeenJumpSignal(anchorJumpSignal);
    setQuery('');
    setFilter('all');
  }

  const conflictMap = detectConflicts(overrides);
  const shortcutsByCategory = getShortcutsByCategory();
  const modifiedCount = Object.keys(overrides).length;
  const hasOverrides = modifiedCount > 0;
  const conflictCount = SHORTCUTS.filter(
    (def) => conflictingDefs(def, resolveBinding(def.id, overrides), conflictMap).length > 0,
  ).length;

  // ── Filtering ──
  const normalizedQuery = query.trim().toLowerCase();

  const visibleIn = (defs: ShortcutDef[]): ShortcutDef[] => {
    if (filter === 'all' && !normalizedQuery) return defs;
    return defs.filter((def) => {
      const binding = resolveBinding(def.id, overrides);
      if (filter === 'modified' && !(def.id in overrides)) return false;
      if (
        filter === 'conflicts' &&
        conflictingDefs(def, binding, conflictMap).length === 0
      ) {
        return false;
      }
      if (!normalizedQuery) return true;
      const haystack = [
        def.id,
        t(def.labelKey as TranslationKey),
        def.descKey ? t(def.descKey as TranslationKey) : '',
        def.defaultBinding,
        binding,
        bindingToDisplay(binding),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  };

  const groups = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    defs: visibleIn(shortcutsByCategory.get(cat) ?? []),
  })).filter((g) => g.defs.length > 0);

  const totalVisible = groups.reduce((n, g) => n + g.defs.length, 0);

  // ── Recording keydown handler ──
  const handleRecordKeydown = useCallback(
    (e: KeyboardEvent) => {
      if (!recordingId) return;

      // Escape cancels, Backspace/Delete clears the binding
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        if (e.key !== 'Escape') setKeyboardShortcut(recordingId, '');
        setRecordingId(null);
        return;
      }

      const binding = eventToBinding(e);
      if (!binding) return; // modifier-only press — keep listening

      e.preventDefault();
      e.stopPropagation();

      const def = SHORTCUTS.find((s) => s.id === recordingId);
      setKeyboardShortcut(recordingId, binding);
      setRecordingId(null);

      // The conflicting rows light up on both sides, but the other side may
      // sit in a different (scrolled-away) group — surface it once here.
      const conflict =
        def && checkBindingConflict(binding, def.scope, def.id, overrides);
      if (conflict) {
        toast.warning(
          t('shortcut.conflictWarning', {
            name: t(conflict.labelKey as TranslationKey),
          }),
        );
      }
    },
    [recordingId, overrides, setKeyboardShortcut, t],
  );

  // Capture-phase listener while recording — shields the dialog's own
  // bubble-phase Escape handler so Esc cancels the recording only.
  useEffect(() => {
    if (!recordingId) return;
    window.addEventListener('keydown', handleRecordKeydown, { capture: true });
    return () => window.removeEventListener('keydown', handleRecordKeydown, { capture: true });
  }, [recordingId, handleRecordKeydown]);

  return (
    <div className="max-w-3xl space-y-7">
      {/* ── Intro ── */}
      <p className="px-1 text-[13px] text-[var(--vscode-descriptionForeground)]">
        {t('shortcut.description')}
      </p>

      {/* ── Toolbar: search + filters + status ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--vscode-descriptionForeground)] pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (handleNativeSelectAll(e)) return;
              }}
              placeholder={t('shortcut.searchPlaceholder')}
              className="w-full h-8 pl-8 pr-8 text-[13px] rounded-md bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] focus:border-[var(--vscode-focusBorder)] outline-none transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                title={t('shortcut.clearSearch')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-5 h-5 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[color-mix(in_srgb,var(--vscode-foreground)_8%,transparent)] transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-0.5 p-0.5 shrink-0 rounded-md bg-[color-mix(in_srgb,var(--vscode-foreground)_6%,transparent)]">
            {FILTER_MODES.map((mode) => {
              const active = filter === mode;
              const count =
                mode === 'all'
                  ? SHORTCUTS.length
                  : mode === 'modified'
                    ? modifiedCount
                    : conflictCount;
              return (
                <button
                  key={mode}
                  onClick={() => setFilter(mode)}
                  className={`flex items-center gap-1 h-7 px-2.5 rounded-[5px] text-[12px] transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)]'
                      : 'text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]'
                  }`}
                >
                  {t(FILTER_LABEL_KEYS[mode])}
                  <span className="text-[11px] tabular-nums opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status row — recording hint wins over the customized summary */}
        <div className="flex items-center justify-between gap-3 min-h-5 px-1">
          {recordingId ? (
            <span className="text-[11px] text-[var(--vscode-focusBorder)]">
              {t('shortcut.recordingHint')}
            </span>
          ) : (
            <>
              <span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
                {hasOverrides ? t('shortcut.customizedCount', { count: modifiedCount }) : ''}
              </span>
              {hasOverrides && (
                <button
                  onClick={() => resetAllKeyboardShortcuts()}
                  className="px-2 h-6 rounded-md text-[11px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] border border-transparent hover:border-[color-mix(in_srgb,var(--vscode-foreground)_9%,transparent)] transition-colors cursor-pointer"
                >
                  {t('shortcut.resetAll')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Customizable shortcuts, grouped by category ── */}
      <div className="space-y-6">
        {groups.map(({ category, defs }: { category: ShortcutCategory; defs: ShortcutDef[] }) => (
          <section key={category} id={`settings-shortcuts-${category}`} className="space-y-2">
            <GroupHeading
              title={t(CATEGORY_LABEL_KEYS[category] as TranslationKey)}
              count={defs.length}
            />
            <div
              className={`rounded-[10px] ${PANEL_BORDER} ${PANEL_DIVIDER} ${PANEL_SURFACE} overflow-hidden`}
            >
              {defs.map((def) => (
                <ShortcutRow
                  key={def.id}
                  def={def}
                  overrides={overrides}
                  conflictMap={conflictMap}
                  recordingId={recordingId}
                  onRecord={setRecordingId}
                  onReset={resetKeyboardShortcut}
                />
              ))}
            </div>
          </section>
        ))}

        {totalVisible === 0 && (
          <div className="py-10 text-center text-[13px] text-[var(--vscode-descriptionForeground)]">
            {t('shortcut.noResults')}
          </div>
        )}
      </div>

      {/* ── Global (OS-level) shortcuts ── */}
      <GlobalShortcutsContent />

      {/* ── Reference shortcuts (read-only) ── */}
      <section id="settings-shortcuts-reference" className="space-y-2">
        <GroupHeading title={t('shortcut.reference')} count={REFERENCE_COUNT} />
        <ReferenceShortcuts />
      </section>
    </div>
  );
}
