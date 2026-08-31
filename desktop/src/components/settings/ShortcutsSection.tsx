/**
 * ShortcutsSection — in-app keyboard shortcut editor.
 *
 * ONE continuous list with category labels inlined as group rows — not
 * one panel per category. Click a row to record a new binding. No
 * search box, filter or status chrome: 29 entries stay findable by
 * scrolling, and the left nav already jumps to a category (the group
 * rows carry the anchor ids). Conflicts are surfaced inline on every
 * involved row.
 */

import { Fragment, useState, useEffect, useCallback } from 'react';
import { useI18n, type TranslationKey } from '../../lib/core/i18n';
import { useStore } from '../../store/useStore';
import {
  SHORTCUTS,
  CATEGORY_ORDER,
  CATEGORY_LABEL_KEYS,
  getShortcutsByCategory,
  eventToBinding,
  detectConflicts,
  checkBindingConflict,
} from '../../lib/shortcuts/keyboardShortcuts';
import { toast } from '../../lib/core/toast';
import { PANEL_BORDER, PANEL_DIVIDER, PANEL_SURFACE } from './KbdKeycap';
import { ShortcutRow } from './ShortcutRow';
import { GlobalShortcutsContent } from './GlobalShortcutsSection';

const PANEL = `rounded-[10px] ${PANEL_BORDER} ${PANEL_DIVIDER} ${PANEL_SURFACE} overflow-hidden`;

export default function ShortcutsSection() {
  const { t } = useI18n();
  const overrides = useStore((s) => s.keyboardShortcuts);
  const setKeyboardShortcut = useStore((s) => s.setKeyboardShortcut);
  const resetKeyboardShortcut = useStore((s) => s.resetKeyboardShortcut);
  const resetAllKeyboardShortcuts = useStore((s) => s.resetAllKeyboardShortcuts);

  const [recordingId, setRecordingId] = useState<string | null>(null);

  const conflictMap = detectConflicts(overrides);
  const shortcutsByCategory = getShortcutsByCategory();
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    defs: shortcutsByCategory.get(category) ?? [],
  })).filter((g) => g.defs.length > 0);

  const hasOverrides = Object.keys(overrides).length > 0;

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
    return () =>
      window.removeEventListener('keydown', handleRecordKeydown, { capture: true });
  }, [recordingId, handleRecordKeydown]);

  return (
    <div className="max-w-3xl space-y-3">
      {/* One panel: category group rows and shortcut rows are direct
          children so `divide-y` rules the whole list uniformly. */}
      <div className={PANEL}>
        {groups.map(({ category, defs }) => (
          <Fragment key={category}>
            <h4
              id={`settings-shortcuts-${category}`}
              className="px-3 py-1.5 text-[11px] font-semibold text-[var(--vscode-descriptionForeground)] bg-[color-mix(in_srgb,var(--vscode-foreground)_3%,transparent)]"
            >
              {t(CATEGORY_LABEL_KEYS[category] as TranslationKey)}
            </h4>
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
          </Fragment>
        ))}
      </div>

      {/* Only shown once something deviates from the defaults. */}
      {hasOverrides && (
        <div className="flex justify-end">
          <button
            onClick={() => resetAllKeyboardShortcuts()}
            className="px-2 h-7 rounded-md text-[12px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer"
          >
            {t('shortcut.resetAll')}
          </button>
        </div>
      )}

      <GlobalShortcutsContent />
    </div>
  );
}
