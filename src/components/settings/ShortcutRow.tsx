/**
 * ShortcutRow / ReferenceShortcuts — list rows for the shortcuts settings
 * page.
 *
 * Row language: WHAT it does on the left (label + description), HOW to
 * trigger it on the right (key caps). The whole row is the record button,
 * so there is one obvious click target instead of a tile full of chrome.
 */

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useI18n, type TranslationKey } from '../../lib/core/i18n';
import {
  REFERENCE_SHORTCUTS,
  bindingToDisplay,
  conflictingDefs,
  resolveBinding,
  type ShortcutDef,
  type ShortcutOverrides,
} from '../../lib/shortcuts/keyboardShortcuts';
import { KbdKeycap, PANEL_BORDER, PANEL_DIVIDER } from './KbdKeycap';

// ────────────────────────────────────────────────────────────────────────────
// ShortcutRow — one customizable shortcut
// ────────────────────────────────────────────────────────────────────────────

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

  const toggleRecording = () => onRecord(isRecording ? null : def.id);

  // Rows are keyboard-operable (Enter/Space records), so focus needs a visible
  // ring — a hover-identical background alone is not enough to tell them apart.
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t(def.labelKey as TranslationKey)}
      onClick={toggleRecording}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleRecording();
        }
      }}
      className={`group relative flex items-center gap-3 py-2 pl-3 pr-2 cursor-pointer outline-none transition-colors focus-visible:shadow-[inset_0_0_0_1px_var(--vscode-focusBorder)] ${
        isRecording
          ? 'bg-[color-mix(in_srgb,var(--vscode-focusBorder)_12%,transparent)]'
          : 'hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
    >
      {/* Conflict accent rail */}
      {conflictName && (
        <span
          aria-hidden
          className="absolute left-0 inset-y-0 w-[2px] bg-[var(--vscode-errorForeground)]"
        />
      )}

      {/* What it does */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[13px] text-[var(--vscode-foreground)] truncate">
            {t(def.labelKey as TranslationKey)}
          </span>
          {isOverridden && (
            <span className="shrink-0 text-tiny leading-[15px] px-1.5 rounded-full bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
              {t('shortcut.customized')}
            </span>
          )}
        </div>
        {conflictName ? (
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-[var(--vscode-errorForeground)] truncate">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="truncate">{t('shortcut.conflictWith', { name: conflictName })}</span>
          </div>
        ) : (
          def.descKey && (
            <div className="mt-0.5 text-[11px] text-[var(--vscode-descriptionForeground)] truncate">
              {t(def.descKey as TranslationKey)}
            </div>
          )
        )}
      </div>

      {/* How to trigger it (also the record button) + reset */}
      <div className="flex items-center gap-1 shrink-0">
        <KbdKeycap
          display={binding ? bindingToDisplay(binding) : ''}
          recording={isRecording}
          conflicted={!!conflictName}
        />
        {/* Fixed-width slot keeps the key caps from shifting on hover */}
        <div className="flex justify-center w-6">
          {isOverridden && !isRecording && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReset(def.id);
              }}
              title={t('shortcut.resetToDefault')}
              className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--vscode-descriptionForeground)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-[var(--vscode-foreground)] hover:bg-[color-mix(in_srgb,var(--vscode-foreground)_8%,transparent)] transition-opacity cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ReferenceShortcuts — read-only cheatsheet (editor formatting + markdown)
// ────────────────────────────────────────────────────────────────────────────

export function ReferenceShortcuts() {
  const { t } = useI18n();

  return (
    <div className={`rounded-[10px] ${PANEL_BORDER} ${PANEL_DIVIDER} overflow-hidden`}>
      {REFERENCE_SHORTCUTS.map((group) => (
        <div key={group.category} className="py-2">
          <div className="px-3 pb-1 text-[11px] font-medium text-[var(--vscode-descriptionForeground)]">
            {t(group.category as TranslationKey)}
          </div>
          <div className="grid grid-cols-2 gap-x-6">
            {group.items.map((item) => (
              <div
                key={item.labelKey}
                className="flex items-center justify-between gap-3 h-[26px] px-3 min-w-0"
              >
                <span className="text-[12px] text-[var(--vscode-foreground)] truncate">
                  {t(item.labelKey as TranslationKey)}
                </span>
                {item.binding ? (
                  <KbdKeycap display={bindingToDisplay(item.binding)} />
                ) : (
                  <code className="shrink-0 px-1.5 rounded font-mono text-[11px] whitespace-pre bg-[color-mix(in_srgb,var(--vscode-foreground)_6%,var(--vscode-editor-background))] text-[var(--vscode-descriptionForeground)]">
                    {item.display}
                  </code>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
