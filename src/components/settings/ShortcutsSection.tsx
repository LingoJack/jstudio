import { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
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
  checkBindingConflict,
  type ShortcutDef,
  type ShortcutCategory,
  type ShortcutOverrides,
  type ReferenceShortcut,
} from '../../lib/shortcuts/keyboardShortcuts';
import { KbdKeycap, SectionTitle, tileBase, tileSurface } from './KbdKeycap';
import { GlobalShortcutsContent } from './GlobalShortcutsSection';

// ─────────────────────────────────────────────────────────────
// ShortcutTile — one customizable shortcut as a compact tile:
// key caps as the hero on top, label + status at the bottom.
// ─────────────────────────────────────────────────────────────

function ShortcutTile({
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
  const currentBinding = resolveBinding(def.id, overrides);
  const isOverridden = def.id in overrides;
  const display = currentBinding ? bindingToDisplay(currentBinding) : '';

  // Check if this shortcut is in a conflict (skip if unbound)
  const conflictingDefs = currentBinding ? conflictMap.get(currentBinding) : undefined;
  const isConflicted =
    conflictingDefs && conflictingDefs.some((d) => d.id !== def.id && d.scope === def.scope);

  const conflictName = isConflicted
    ? conflictingDefs
        ?.filter((d) => d.id !== def.id && d.scope === def.scope)
        .map((d) => t(d.labelKey as TranslationKey))
        .join(', ')
    : null;

  return (
    <div
      className={`${tileBase} ${tileSurface} min-h-[84px] ${
        isConflicted
          ? 'bg-[var(--vscode-inputValidation-errorBackground)] border-[color-mix(in_srgb,var(--vscode-errorForeground)_40%,transparent)]'
          : ''
      } ${isRecording ? 'border-[var(--vscode-focusBorder)]' : ''}`}
    >
      {/* Key caps (click to re-record) + reset (hover) */}
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onRecord(isRecording ? null : def.id)}
          className="cursor-pointer"
          title={t('shortcut.pressKeys')}
        >
          <KbdKeycap display={display} recording={isRecording} conflicted={!!isConflicted} />
        </button>
        {isOverridden && !isRecording && (
          <button
            onClick={() => onReset(def.id)}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--vscode-descriptionForeground)] opacity-0 group-hover:opacity-100 hover:text-[var(--vscode-foreground)] hover:bg-[color-mix(in_srgb,var(--vscode-foreground)_8%,transparent)] transition-all cursor-pointer"
            title={t('shortcut.resetToDefault')}
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Label + status */}
      <div className="mt-auto min-w-0">
        <div className="text-[13px] text-[var(--vscode-foreground)] truncate">
          {t(def.labelKey as TranslationKey)}
        </div>
        {isConflicted && conflictName ? (
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-[var(--vscode-errorForeground)] truncate">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="truncate">{t('shortcut.conflictWith', { name: conflictName })}</span>
          </div>
        ) : (
          isOverridden && (
            <div className="mt-0.5 text-[11px] text-[var(--vscode-descriptionForeground)]">
              {t('shortcut.customized')}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ReferenceBlock — collapsible group of read-only mini tiles
// ─────────────────────────────────────────────────────────────

function ReferenceBlock({ category, items }: {
  category: string;
  items: ReferenceShortcut[];
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] transition-colors cursor-pointer"
      >
        <span className="shrink-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        {t(category as TranslationKey)}
      </button>
      {expanded && (
        <div className="mt-1.5 ml-5 grid grid-cols-2 gap-1.5">
          {items.map((item) => {
            const text = item.binding ? bindingToDisplay(item.binding) : (item.display ?? '');
            return (
              <div
                key={item.labelKey}
                className="flex flex-col gap-1 p-2.5 rounded-[8px] border border-[color-mix(in_srgb,var(--vscode-foreground)_6%,transparent)]"
              >
                {text ? (
                  <KbdKeycap display={text} />
                ) : (
                  <span className="h-[22px]" aria-hidden />
                )}
                <div className="text-xs text-[var(--vscode-descriptionForeground)] truncate">
                  {t(item.labelKey as TranslationKey)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export default function ShortcutsSection() {
  const { t } = useI18n();
  const overrides = useStore((s) => s.keyboardShortcuts);
  const setKeyboardShortcut = useStore((s) => s.setKeyboardShortcut);
  const resetKeyboardShortcut = useStore((s) => s.resetKeyboardShortcut);
  const resetAllKeyboardShortcuts = useStore((s) => s.resetAllKeyboardShortcuts);

  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const recordRef = useRef<HTMLDivElement>(null);

  const conflictMap = detectConflicts(overrides);
  const shortcutsByCategory = getShortcutsByCategory();
  const hasOverrides = Object.keys(overrides).length > 0;

  // ── Recording keydown handler ──
  const handleRecordKeydown = useCallback(
    (e: KeyboardEvent) => {
      // Escape cancels recording
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setRecordingId(null);
        setConflictWarning(null);
        return;
      }

      // Backspace or Delete clears the binding (sets to unbound)
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        setKeyboardShortcut(recordingId!, '');
        setRecordingId(null);
        setConflictWarning(null);
        return;
      }

      const binding = eventToBinding(e);
      if (!binding) return; // modifier-only press — keep listening

      e.preventDefault();
      e.stopPropagation();

      // Find the def for the shortcut being recorded
      const def = SHORTCUTS.find((s) => s.id === recordingId);
      if (!def) {
        setRecordingId(null);
        return;
      }

      // Check for conflict with other shortcuts in same scope
      const conflict = checkBindingConflict(binding, def.scope, def.id, overrides);
      if (conflict) {
        setConflictWarning(
          t('shortcut.conflictWarning', {
            name: t(conflict.labelKey as TranslationKey),
          }),
        );
      } else {
        setConflictWarning(null);
      }

      // Apply the binding (even if there's a conflict — user can resolve later)
      setKeyboardShortcut(def.id, binding);
      setRecordingId(null);
    },
    [recordingId, overrides, setKeyboardShortcut, t],
  );

  // Capture-phase listener while recording
  useEffect(() => {
    if (!recordingId) return;

    window.addEventListener('keydown', handleRecordKeydown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleRecordKeydown, { capture: true } as unknown as EventListenerOptions);
    };
  }, [recordingId, handleRecordKeydown]);

  return (
    <div ref={recordRef} className="max-w-2xl space-y-7">
      {/* ── One-line hint (the nav already names the section) ── */}
      <p className="px-1 text-xs text-[var(--vscode-descriptionForeground)]">
        {t('shortcut.description')}
      </p>

      {/* ── Conflict warning banner ── */}
      {conflictWarning && recordingId && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-[10px] bg-[var(--vscode-inputValidation-errorBackground)] border border-[color-mix(in_srgb,var(--vscode-errorForeground)_40%,transparent)] text-xs text-[var(--vscode-errorForeground)]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {conflictWarning}
        </div>
      )}

      {/* ── Customizable shortcut tiles by category ── */}
      {CATEGORY_ORDER.map((cat: ShortcutCategory) => {
        const defs = shortcutsByCategory.get(cat);
        if (!defs || defs.length === 0) return null;

        return (
          <section key={cat} id={`settings-shortcuts-${cat}`} className="space-y-2">
            <SectionTitle title={t(CATEGORY_LABEL_KEYS[cat] as TranslationKey)} />
            <div className="grid grid-cols-2 gap-2">
              {defs.map((def) => (
                <ShortcutTile
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
        );
      })}

      {/* ── Global shortcuts (inline sub-section) ── */}
      <GlobalShortcutsContent />

      {/* ── Reference shortcuts (read-only) ── */}
      <section id="settings-shortcuts-reference" className="space-y-2">
        <SectionTitle title={t('shortcut.reference')} />
        <div className="space-y-2">
          {REFERENCE_SHORTCUTS.map((group) => (
            <ReferenceBlock key={group.category} category={group.category} items={group.items} />
          ))}
        </div>
      </section>

      {/* ── Reset all ── */}
      {hasOverrides && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              resetAllKeyboardShortcuts();
              setConflictWarning(null);
            }}
            className="px-3 h-8 rounded-md text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[color-mix(in_srgb,var(--vscode-foreground)_6%,transparent)] border border-transparent hover:border-[color-mix(in_srgb,var(--vscode-foreground)_9%,transparent)] transition-colors cursor-pointer"
          >
            {t('shortcut.resetAll')}
          </button>
        </div>
      )}
    </div>
  );
}
