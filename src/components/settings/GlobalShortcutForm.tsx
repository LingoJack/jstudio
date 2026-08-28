/**
 * GlobalShortcutForm — inline add/edit form for an OS-level global shortcut.
 *
 * Rendered as a full-width row inside the global shortcuts panel. Fields are
 * driven by the action definition's `paramFields` schema, so adding a new
 * action type needs no UI change here.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AlertTriangle, Folder } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useI18n, type TranslationKey } from '../../lib/core/i18n';
import { eventToBinding, bindingToDisplay } from '../../lib/shortcuts/keyboardShortcuts';
import { SelectDropdown } from '../ui/SelectDropdown';
import { KbdKeycap } from './KbdKeycap';
import {
  getAllActionDefs,
  getActionDef,
  findShortcutConflict,
  type GlobalShortcutConfig,
  type ActionParamField,
} from '../../lib/shortcuts/globalShortcuts';
import { handleNativeSelectAll } from '../../lib/shortcuts/nativeSelectAll';

/** Shared input styling for the form fields. */
const FORM_INPUT_CLASS =
  'w-full px-3 py-2 text-sm rounded-md bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] focus:border-[var(--vscode-focusBorder)] outline-none transition-colors';

// ────────────────────────────────────────────────────────────────────────────
// Form primitives
// ────────────────────────────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--vscode-foreground)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={`relative w-8 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
          checked ? 'bg-[var(--vscode-button-background)]' : 'bg-[var(--vscode-input-border)]'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${
            checked
              ? 'translate-x-3 bg-[var(--vscode-button-foreground)]'
              : 'bg-[var(--vscode-descriptionForeground)]'
          }`}
        />
      </button>
      {label && (
        <span className="text-xs text-[var(--vscode-descriptionForeground)]">{label}</span>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ParamFieldEditor — renders a form field based on ActionParamField schema
// ────────────────────────────────────────────────────────────────────────────

function ParamFieldEditor({
  field,
  value,
  onChange,
}: {
  field: ActionParamField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { t } = useI18n();

  if (field.type === 'select') {
    return (
      <FormField label={t(field.labelKey as TranslationKey)}>
        <SelectDropdown
          value={String((value as string) ?? field.defaultValue ?? '')}
          options={(field.options ?? []).map((opt) => ({
            value: opt.value,
            label: t(opt.labelKey as TranslationKey),
          }))}
          onChange={(v) => onChange(v)}
        />
      </FormField>
    );
  }

  if (field.type === 'directory') {
    const currentValue = (value as string) ?? (field.defaultValue as string) ?? '';
    return (
      <FormField label={t(field.labelKey as TranslationKey)}>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={currentValue}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (handleNativeSelectAll(e)) return;
            }}
            placeholder={field.placeholderKey ? t(field.placeholderKey as TranslationKey) : ''}
            className={FORM_INPUT_CLASS}
          />
          <button
            type="button"
            onClick={async () => {
              const selected = await open({ directory: true });
              if (selected) onChange(selected);
            }}
            className="shrink-0 px-3 py-2 rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] text-sm hover:bg-[var(--vscode-list-hoverBackground)] flex items-center cursor-pointer transition-colors"
          >
            <Folder className="w-3.5 h-3.5" />
          </button>
        </div>
      </FormField>
    );
  }

  return (
    <FormField label={t(field.labelKey as TranslationKey)}>
      <input
        type="text"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (handleNativeSelectAll(e)) return;
        }}
        placeholder={field.placeholderKey ? t(field.placeholderKey as TranslationKey) : ''}
        className={FORM_INPUT_CLASS}
      />
    </FormField>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ShortcutEditForm
// ────────────────────────────────────────────────────────────────────────────

export function ShortcutEditForm({
  initial,
  configs,
  onSave,
  onCancel,
}: {
  initial: GlobalShortcutConfig | null;
  configs: GlobalShortcutConfig[];
  onSave: (config: GlobalShortcutConfig) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const actionDefs = getAllActionDefs();

  const [shortcut, setShortcut] = useState(initial?.shortcut ?? '');
  const [actionType, setActionType] = useState(initial?.actionType ?? actionDefs[0]?.type ?? '');
  const [actionParams, setActionParams] = useState<Record<string, unknown>>(
    initial?.actionParams ?? {},
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);

  const currentDef = getActionDef(actionType);
  const conflict = findShortcutConflict(shortcut, configs, initial?.id ?? '');

  // ── Key recording ──
  const handleRecordKey = useCallback((e: KeyboardEvent) => {
    if (!recordingRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      recordingRef.current = false;
      setRecording(false);
      return;
    }
    // Ignore lone modifier presses
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

    const binding = eventToBinding(e);
    if (binding) {
      setShortcut(binding);
      recordingRef.current = false;
      setRecording(false);
    }
  }, []);

  useEffect(() => {
    if (recording) {
      recordingRef.current = true;
      window.addEventListener('keydown', handleRecordKey, true);
    } else {
      recordingRef.current = false;
    }
    return () => window.removeEventListener('keydown', handleRecordKey, true);
  }, [recording, handleRecordKey]);

  // When action type changes, reset params to defaults
  const handleActionTypeChange = (newType: string) => {
    setActionType(newType);
    const def = getActionDef(newType);
    const newParams: Record<string, unknown> = {};
    for (const f of def?.paramFields ?? []) {
      if (f.defaultValue !== undefined) newParams[f.key] = f.defaultValue;
    }
    setActionParams(newParams);
  };

  const handleSave = () => {
    if (!shortcut) return;
    const config: GlobalShortcutConfig = {
      id: initial?.id ?? `gs-${Date.now()}`,
      enabled,
      shortcut,
      actionType,
      actionLabel: currentDef ? t(currentDef.labelKey as TranslationKey) : actionType,
      actionParams,
    };
    onSave(config);
  };

  const display = shortcut ? bindingToDisplay(shortcut) : '';

  return (
    <div className="p-4 space-y-4 bg-[color-mix(in_srgb,var(--vscode-focusBorder)_6%,var(--vscode-editor-background))]">
      {/* Shortcut recording */}
      <FormField label={t('globalShortcut.shortcutKey')}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setRecording(true)} className="cursor-pointer">
            <KbdKeycap
              display={display}
              recording={recording}
              unboundLabel={t('shortcut.clickToRecord')}
              conflicted={!!conflict}
            />
          </button>
          {conflict && (
            <span className="text-small text-[var(--vscode-errorForeground)] flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {t('globalShortcut.conflict')}
            </span>
          )}
        </div>
      </FormField>

      {/* Action type selector */}
      <FormField label={t('globalShortcut.action')}>
        <SelectDropdown
          value={actionType}
          options={actionDefs.map((def) => ({
            value: def.type,
            label: t(def.labelKey as TranslationKey),
          }))}
          onChange={(v) => handleActionTypeChange(v)}
        />
        {currentDef?.descriptionKey && (
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1.5 opacity-70 leading-tight">
            {t(currentDef.descriptionKey as TranslationKey)}
          </p>
        )}
      </FormField>

      {/* Dynamic param fields */}
      {currentDef?.paramFields && currentDef.paramFields.length > 0 && (
        <div className="space-y-3 pt-1">
          {currentDef.paramFields.map((field) => (
            <ParamFieldEditor
              key={field.key}
              field={field}
              value={actionParams[field.key]}
              onChange={(v) => setActionParams((prev) => ({ ...prev, [field.key]: v }))}
            />
          ))}
        </div>
      )}

      {/* Enable toggle */}
      <ToggleRow
        label={t('globalShortcut.enabledDesc')}
        checked={enabled}
        onChange={setEnabled}
      />

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--vscode-widget-border)]">
        <button
          onClick={onCancel}
          className="px-4 py-1.5 text-sm rounded-md border border-[var(--vscode-input-border)] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer"
        >
          {t('globalShortcut.cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={!shortcut || !!conflict}
          className="jstudio-btn-primary"
        >
          <span>{t('globalShortcut.save')}</span>
        </button>
      </div>
    </div>
  );
}
