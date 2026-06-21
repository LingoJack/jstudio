import { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, Keyboard, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useI18n, type TranslationKey } from '../../lib/i18n';
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
} from '../../lib/shortcuts';

// ─────────────────────────────────────────────────────────────
// kbd pill — displays a binding string as styled key caps
// ─────────────────────────────────────────────────────────────

function KbdPill({ binding, recording, conflicted }: {
  binding: string;
  recording: boolean;
  conflicted: boolean;
}) {
  const { t } = useI18n();
  const unbound = !binding;

  if (recording) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] text-xs font-mono animate-pulse">
        {t('shortcut.pressKeys')}
      </span>
    );
  }

  if (unbound) {
    return (
      <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md border border-dashed border-[var(--vscode-widget-border)] text-[var(--vscode-descriptionForeground)] bg-transparent text-xs italic transition-colors hover:border-[var(--vscode-focusBorder)] hover:text-[var(--vscode-foreground)]">
        {t('shortcut.unbound')}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-md border text-xs font-mono transition-colors ${
        conflicted
          ? 'border-[var(--vscode-errorForeground)] text-[var(--vscode-errorForeground)] bg-[var(--vscode-inputValidation-errorBackground)]'
          : 'border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)] bg-[var(--vscode-list-hoverBackground)]'
      }`}
    >
      {binding}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// ShortcutRow — a single customizable shortcut row
// ─────────────────────────────────────────────────────────────

function ShortcutRow({
  def,
  overrides,
  conflictMap,
  recordingId,
  onRecord,
  onReset,
  onApply,
}: {
  def: ShortcutDef;
  overrides: ShortcutOverrides;
  conflictMap: Map<string, ShortcutDef[]>;
  recordingId: string | null;
  onRecord: (id: string | null) => void;
  onReset: (id: string) => void;
  onApply: (id: string, binding: string) => void;
}) {
  const { t } = useI18n();
  const isRecording = recordingId === def.id;
  const currentBinding = resolveBinding(def.id, overrides);
  const isOverridden = def.id in overrides;
  const display = currentBinding ? bindingToDisplay(currentBinding) : '';
  const unbound = !currentBinding;

  // Check if this shortcut is in a conflict (skip if unbound)
  const conflictingDefs = unbound ? undefined : conflictMap.get(currentBinding);
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
      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-md transition-colors ${
        isConflicted
          ? 'bg-[var(--vscode-inputValidation-errorBackground)] border border-[var(--vscode-errorForeground)]'
          : 'hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm text-[var(--vscode-foreground)] truncate">
          {t(def.labelKey as TranslationKey)}
        </div>
        {isConflicted && conflictName && (
          <div className="flex items-center gap-1 mt-0.5 text-xs text-[var(--vscode-errorForeground)]">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>{t('shortcut.conflictWith', { name: conflictName })}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {isOverridden && !isRecording && (
          <button
            onClick={() => onReset(def.id)}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer"
            title={t('shortcut.resetToDefault')}
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={() => onRecord(isRecording ? null : def.id)}
          className="cursor-pointer"
        >
          <KbdPill binding={display} recording={isRecording} conflicted={!!isConflicted} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ReferenceSection — collapsible read-only shortcuts
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
        className="flex items-center gap-1.5 text-sm font-medium text-[var(--vscode-foreground)] hover:text-[var(--vscode-focusBorder)] transition-colors cursor-pointer"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {t(category as TranslationKey)}
      </button>
      {expanded && (
        <div className="mt-2 ml-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {items.map((item) => {
            const text = item.binding ? bindingToDisplay(item.binding) : (item.display ?? '');
            return (
              <div key={item.labelKey} className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--vscode-descriptionForeground)] truncate">
                  {t(item.labelKey as TranslationKey)}
                </span>
                <span className="text-xs font-mono text-[var(--vscode-foreground)] shrink-0 px-2 py-0.5 rounded border border-[var(--vscode-widget-border)] bg-[var(--vscode-list-hoverBackground)]">
                  {text}
                </span>
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
    <div ref={recordRef} className="max-w-2xl space-y-8">
      {/* ── Header ── */}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--vscode-foreground)]">
          <Keyboard className="w-5 h-5 opacity-70" />
          {t('settings.shortcuts')}
        </h2>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mt-1">
          {t('shortcut.description')}
        </p>
      </div>

      {/* ── Conflict warning banner ── */}
      {conflictWarning && recordingId && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--vscode-inputValidation-errorBackground)] border border-[var(--vscode-errorForeground)] text-sm text-[var(--vscode-errorForeground)]">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {conflictWarning}
        </div>
      )}

      {/* ── Customizable shortcuts by category ── */}
      {CATEGORY_ORDER.map((cat: ShortcutCategory) => {
        const defs = shortcutsByCategory.get(cat);
        if (!defs || defs.length === 0) return null;

        return (
          <div key={cat} id={`settings-shortcuts-${cat}`}>
            <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-2">
              {t(CATEGORY_LABEL_KEYS[cat] as TranslationKey)}
            </label>
            <div className="space-y-1">
              {defs.map((def) => (
                <ShortcutRow
                  key={def.id}
                  def={def}
                  overrides={overrides}
                  conflictMap={conflictMap}
                  recordingId={recordingId}
                  onRecord={setRecordingId}
                  onReset={resetKeyboardShortcut}
                  onApply={setKeyboardShortcut}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Divider ── */}
      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ── Reference shortcuts (read-only) ── */}
      <div id="settings-shortcuts-reference">
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-3">
          {t('shortcut.reference')}
        </label>
        <div className="space-y-4">
          {REFERENCE_SHORTCUTS.map((group) => (
            <ReferenceBlock key={group.category} category={group.category} items={group.items} />
          ))}
        </div>
      </div>

      {/* ── Reset all ── */}
      {hasOverrides && (
        <>
          <div className="border-t border-[var(--vscode-widget-border)]" />
          <div>
            <button
              onClick={() => {
                resetAllKeyboardShortcuts();
                setConflictWarning(null);
              }}
              className="px-4 py-2 rounded-lg text-sm text-[var(--vscode-foreground)] bg-[var(--vscode-list-hoverBackground)] hover:bg-[var(--vscode-list-activeSelectionBackground)] border border-[var(--vscode-widget-border)] hover:border-[var(--vscode-focusBorder)] transition-colors cursor-pointer"
            >
              {t('shortcut.resetAll')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
