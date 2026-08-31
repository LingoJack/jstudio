/**
 * ShortcutRow — one customizable shortcut in the settings list.
 *
 * Single-line rows so a 29-entry list stays even: label, then a muted
 * note (description / conflict / recording hint), then the key caps.
 * The whole row is the record button, so there is one obvious click
 * target. A customised binding is marked by tinting the caps instead of
 * adding a badge — the row carries no extra chrome.
 */

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useI18n, type TranslationKey } from '../../lib/core/i18n';
import {
  bindingToAria,
  bindingToDisplay,
  conflictingDefs,
  resolveBinding,
  type ShortcutDef,
  type ShortcutOverrides,
} from '../../lib/shortcuts/keyboardShortcuts';
import { KbdKeycap } from './KbdKeycap';

export function ShortcutRow({
  def,
  overrides,
  conflictMap,
  recordingId,
  onRecord,
  onReset,
}: {
  def: ShortcutDef;
  overrides: ShortcutOverrides;
  conflictMap: Map<string, ShortcutDef[]>;
  recordingId: string | null;
  onRecord: (id: string | null) => void;
  onReset: (id: string) => void;
}) {
  const { t } = useI18n();
  const isRecording = recordingId === def.id;
  const isOverridden = def.id in overrides;
  const binding = resolveBinding(def.id, overrides);

  const others = conflictingDefs(def, binding, conflictMap);
  const conflictName =
    others.length > 0
      ? others.map((d) => t(d.labelKey as TranslationKey)).join(', ')
      : null;

  // The note slot is reused for three states, so the row height never
  // changes: recording hint > conflict > plain description.
  const note = isRecording
    ? t('shortcut.recordingHint')
    : conflictName
      ? t('shortcut.conflictWith', { name: conflictName })
      : def.descKey
        ? t(def.descKey as TranslationKey)
        : '';

  const noteTone = isRecording
    ? 'text-[var(--vscode-focusBorder)]'
    : conflictName
      ? 'text-[var(--vscode-errorForeground)]'
      : 'text-[var(--vscode-descriptionForeground)]';

  // The row sets aria-label, which replaces its text content as the
  // accessible name — so the binding, the conflict and the recording state
  // all have to be spelled out here. bindingToAria() is used rather than
  // bindingToDisplay() because glyphs like ⌘ read poorly or not at all.
  const spoken = isRecording
    ? t('shortcut.pressKeys')
    : binding
      ? bindingToAria(binding)
      : t('shortcut.unbound');
  const ariaLabel = [
    t(def.labelKey as TranslationKey),
    spoken,
    conflictName && !isRecording
      ? t('shortcut.conflictWith', { name: conflictName })
      : '',
  ]
    .filter(Boolean)
    .join(', ');

  const toggleRecording = () => onRecord(isRecording ? null : def.id);

  return (
    // The row itself is a plain container: recording lives in the inner
    // button so no interactive element is ever nested inside a role="button".
    // The focus ring is on the container (focus-within) so it still outlines
    // the whole row.
    <div
      className={`group relative flex items-center gap-1 h-9 pl-3 pr-2 transition-colors focus-within:shadow-[inset_0_0_0_1px_var(--vscode-focusBorder)] ${
        isRecording
          ? 'bg-[color-mix(in_srgb,var(--vscode-focusBorder)_12%,transparent)]'
          : 'hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
    >
      {conflictName && (
        <span
          aria-hidden
          className="absolute left-0 inset-y-0 w-[2px] bg-[var(--vscode-errorForeground)]"
        />
      )}

      {/* What it does + how to trigger it — one record target */}
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={toggleRecording}
        className="flex flex-1 items-center gap-2.5 min-w-0 text-left cursor-pointer outline-none"
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="shrink-0 text-[13px] text-[var(--vscode-foreground)]">
            {t(def.labelKey as TranslationKey)}
          </span>
          {note && (
            <>
              <span
                aria-hidden
                className="shrink-0 text-[11px] text-[var(--vscode-descriptionForeground)] opacity-40"
              >
                ·
              </span>
              <span
                className={`flex items-center gap-1 min-w-0 text-[11px] ${noteTone}`}
              >
                {conflictName && !isRecording && (
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                )}
                <span className="truncate">{note}</span>
              </span>
            </>
          )}
        </div>

        <KbdKeycap
          display={binding ? bindingToDisplay(binding) : ''}
          recording={isRecording}
          conflicted={!!conflictName}
          modified={isOverridden && !conflictName}
        />
      </button>

      {/* Fixed-width slot keeps the key caps from shifting on hover */}
      <div className="flex justify-center w-6 shrink-0">
        {isOverridden && !isRecording && (
          <button
            type="button"
            onClick={() => onReset(def.id)}
            title={t('shortcut.resetToDefault')}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--vscode-descriptionForeground)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-[var(--vscode-foreground)] hover:bg-[color-mix(in_srgb,var(--vscode-foreground)_8%,transparent)] transition-opacity cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
