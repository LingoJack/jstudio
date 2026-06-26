/**
 * GlobalShortcutsSection — OS-level global shortcuts settings page.
 *
 * Card-based UI following the AgentModelSection pattern:
 *   - Each shortcut is a card in a list (icon + kbd pill + label + actions)
 *   - Edit mode: card expands inline into a ShortcutEditForm
 *   - Add mode: dashed "+" button at bottom expands into a ShortcutEditForm
 *   - Delete: inline ✓/✗ confirmation (no modal)
 *   - Enable/disable toggle: AgentModelSection-style ToggleRow inside card
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Globe,
  Plus,
  Trash2,
  AlertTriangle,
  Play,
  Pencil,
  Check,
  X,
  Folder,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useI18n, type TranslationKey } from '../../lib/i18n';
import { useStore } from '../../store/useStore';
import { eventToBinding, bindingToDisplay } from '../../lib/shortcuts';
import { toast } from '../../lib/toast';
import {
  getAllActionDefs,
  getActionDef,
  syncGlobalShortcuts,
  findShortcutConflict,
  executeAction,
  type GlobalShortcutConfig,
  type ActionParamField,
} from '../../lib/globalShortcuts';

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

function genId(): string {
  return `gs-${Date.now()}`;
}

function getActionDisplayLabel(
  config: GlobalShortcutConfig,
  t: (k: TranslationKey) => string,
): string {
  const def = getActionDef(config.actionType);
  if (def) return t(def.labelKey as TranslationKey);
  return config.actionLabel || config.actionType;
}

// ════════════════════════════════════════════════════════════════════
// KbdPill — styled key caps
// ════════════════════════════════════════════════════════════════════

function KbdPill({
  binding,
  recording,
  conflicted,
}: {
  binding: string;
  recording: boolean;
  conflicted: boolean;
}) {
  const { t } = useI18n();

  if (recording) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] text-xs font-mono animate-pulse">
        {t('shortcut.pressKeys')}
      </span>
    );
  }

  if (!binding) {
    return (
      <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md border border-dashed border-[var(--vscode-widget-border)] text-[var(--vscode-descriptionForeground)] bg-transparent text-xs italic transition-colors hover:border-[var(--vscode-focusBorder)] hover:text-[var(--vscode-foreground)] cursor-pointer">
        {t('shortcut.clickToRecord')}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-md border text-xs font-mono transition-colors cursor-pointer ${
        conflicted
          ? 'border-[var(--vscode-errorForeground)] text-[var(--vscode-errorForeground)] bg-[var(--vscode-inputValidation-errorBackground)]'
          : 'border-[var(--vscode-widget-border)] text-[var(--vscode-foreground)] bg-[var(--vscode-list-hoverBackground)]'
      }`}
    >
      {binding}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════
// ToggleRow — reused from AgentModelSection
// ════════════════════════════════════════════════════════════════════

function ToggleRow({
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
        className={`relative w-8 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
          checked
            ? 'bg-[var(--vscode-button-background)]'
            : 'bg-[var(--vscode-input-border)]'
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
      <span className="text-xs text-[var(--vscode-descriptionForeground)]">{label}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// FormField — reused from AgentModelSection
// ════════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════════
// ParamFieldEditor — renders a form field based on ActionParamField schema
// ════════════════════════════════════════════════════════════════════

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
  const inputClass =
    'w-full px-3 py-2 text-sm rounded-md bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] focus:border-[var(--vscode-focusBorder)] outline-none transition-colors';

  if (field.type === 'select') {
    return (
      <FormField label={t(field.labelKey as TranslationKey)}>
        <select
          value={String((value as string) ?? field.defaultValue ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} cursor-pointer`}
        >
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey as TranslationKey)}
            </option>
          ))}
        </select>
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
            placeholder={field.placeholderKey ? t(field.placeholderKey as TranslationKey) : ''}
            className={inputClass}
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

  // text
  return (
    <FormField label={t(field.labelKey as TranslationKey)}>
      <input
        type="text"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholderKey ? t(field.placeholderKey as TranslationKey) : ''}
        className={inputClass}
      />
    </FormField>
  );
}

// ════════════════════════════════════════════════════════════════════
// ShortcutCard — a single shortcut entry (non-editing state)
// ════════════════════════════════════════════════════════════════════

function ShortcutCard({
  config,
  configs,
  onToggle,
  onEdit,
  onDelete,
  isConfirmingDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  config: GlobalShortcutConfig;
  configs: GlobalShortcutConfig[];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isConfirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const { t } = useI18n();
  const conflict = findShortcutConflict(config.shortcut, configs, config.id);
  const def = getActionDef(config.actionType);
  const Icon = def?.icon ?? Globe;
  const display = config.shortcut ? bindingToDisplay(config.shortcut) : '';

  const handleTest = async () => {
    try {
      await executeAction(config, {
        emit: async (event, payload) => {
          const { emit } = await import('@tauri-apps/api/event');
          await emit(event, payload);
        },
      });
    } catch {
      toast.error(t('globalShortcut.testFailed'));
    }
  };

  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
        conflict
          ? 'border-[var(--vscode-errorForeground)] bg-[var(--vscode-inputValidation-errorBackground)]'
          : config.enabled
            ? 'border-[var(--vscode-widget-border)] bg-[var(--vscode-list-hoverBackground)]'
            : 'border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] opacity-60'
      }`}
    >
      {/* Icon */}
      <div className="w-9 h-9 rounded-lg bg-[var(--vscode-badge-background)] flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-[var(--vscode-badge-foreground)]" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Row 1: kbd pill + name + badges */}
        <div className="flex items-center gap-2">
          <KbdPill binding={display} recording={false} conflicted={!!conflict} />
          <span className="text-sm font-medium text-[var(--vscode-foreground)] truncate">
            {getActionDisplayLabel(config, t)}
          </span>
          {config.enabled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] flex-shrink-0 leading-tight">
              {t('globalShortcut.badgeGlobal')}
            </span>
          )}
        </div>
        {/* Row 2: description / conflict */}
        {conflict ? (
          <div className="flex items-center gap-1 mt-0.5 text-xs text-[var(--vscode-errorForeground)]">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>{t('globalShortcut.conflict')}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--vscode-descriptionForeground)]">
            {def?.descriptionKey && <span className="truncate">{t(def.descriptionKey as TranslationKey)}</span>}
          </div>
        )}
      </div>

      {/* Enable toggle */}
      <div className="flex-shrink-0">
        <ToggleRow
          label={t('globalShortcut.enabled')}
          checked={config.enabled}
          onChange={onToggle}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {isConfirmingDelete ? (
          <div className="flex items-center gap-1 px-1">
            <button
              onClick={onConfirmDelete}
              className="p-1.5 rounded text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer transition-colors"
              title={t('globalShortcut.delete')}
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={onCancelDelete}
              className="p-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={handleTest}
              className="p-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer transition-colors"
              title={t('globalShortcut.test')}
            >
              <Play className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer transition-colors"
              title={t('globalShortcut.edit')}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer transition-colors"
              title={t('globalShortcut.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// ShortcutEditForm — inline add/edit form (ProviderEditForm pattern)
// ════════════════════════════════════════════════════════════════════

function ShortcutEditForm({
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
    if (!shortcut) {
      toast.warning(t('globalShortcut.noShortcut'));
      return;
    }
    if (conflict) {
      toast.warning(t('globalShortcut.conflict'));
      return;
    }
    const config: GlobalShortcutConfig = {
      id: initial?.id ?? genId(),
      enabled,
      shortcut,
      actionType,
      actionLabel: currentDef ? t(currentDef.labelKey as TranslationKey) : actionType,
      actionParams,
    };
    onSave(config);
  };

  const display = shortcut ? bindingToDisplay(shortcut) : '';
  const inputClass =
    'w-full px-3 py-2 text-sm rounded-md bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] focus:border-[var(--vscode-focusBorder)] outline-none transition-colors';

  return (
    <div className="p-5 rounded-lg border border-[var(--vscode-focusBorder)] bg-[var(--vscode-editor-background)] space-y-4">
      {/* Shortcut recording */}
      <FormField label={t('globalShortcut.shortcutKey')}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRecording(true)}
            className="cursor-pointer"
          >
            <KbdPill binding={display} recording={recording} conflicted={!!conflict} />
          </button>
          {conflict && (
            <span className="text-[11px] text-[var(--vscode-errorForeground)] flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {t('globalShortcut.conflict')}
            </span>
          )}
        </div>
      </FormField>

      {/* Action type selector */}
      <FormField label={t('globalShortcut.action')}>
        <select
          value={actionType}
          onChange={(e) => handleActionTypeChange(e.target.value)}
          className={`${inputClass} cursor-pointer`}
        >
          {actionDefs.map((def) => (
            <option key={def.type} value={def.type}>
              {t(def.labelKey as TranslationKey)}
            </option>
          ))}
        </select>
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
          className="jstudio-btn-primary"
        >
          <span>{t('globalShortcut.save')}</span>
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Main component
// ════════════════════════════════════════════════════════════════════

export default function GlobalShortcutsSection() {
  const { t } = useI18n();
  const configs = useStore((s) => s.globalShortcuts);
  const setGlobalShortcuts = useStore((s) => s.setGlobalShortcuts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── Persist + sync to OS ──
  const persistAndSync = useCallback(
    async (newConfigs: GlobalShortcutConfig[]) => {
      setGlobalShortcuts(newConfigs);
      try {
        await syncGlobalShortcuts(newConfigs.filter((c) => c.enabled));
      } catch (err) {
        console.error('[GlobalShortcutsSection] Failed to sync:', err);
      }
    },
    [setGlobalShortcuts],
  );

  const handleSave = (config: GlobalShortcutConfig) => {
    const exists = configs.some((c) => c.id === config.id);
    if (exists) {
      persistAndSync(configs.map((c) => (c.id === config.id ? config : c)));
    } else {
      persistAndSync([...configs, config]);
    }
    setEditingId(null);
    setIsAdding(false);
  };

  const handleToggle = (id: string) => {
    persistAndSync(configs.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  };

  const handleDelete = (id: string) => {
    persistAndSync(configs.filter((c) => c.id !== id));
    setConfirmDeleteId(null);
  };

  return (
    <div id="settings-globalShortcuts" className="space-y-6">
      {/* Header */}
      <div id="settings-globalShortcuts-header">
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('globalShortcut.title')}
        </label>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('globalShortcut.description')}
        </p>
      </div>

      {/* Shortcut cards */}
      <div className="space-y-2">
        {configs.map((config) => {
          const isEditing = editingId === config.id;

          if (isEditing) {
            return (
              <ShortcutEditForm
                key={`edit-${config.id}`}
                initial={config}
                configs={configs}
                onSave={handleSave}
                onCancel={() => setEditingId(null)}
              />
            );
          }

          return (
            <ShortcutCard
              key={config.id}
              config={config}
              configs={configs}
              onToggle={() => handleToggle(config.id)}
              onEdit={() => setEditingId(config.id)}
              onDelete={() => setConfirmDeleteId(config.id)}
              isConfirmingDelete={confirmDeleteId === config.id}
              onConfirmDelete={() => handleDelete(config.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
            />
          );
        })}

        {/* Add form */}
        {isAdding && (
          <ShortcutEditForm
            initial={null}
            configs={configs}
            onSave={handleSave}
            onCancel={() => setIsAdding(false)}
          />
        )}
      </div>

      {/* Add button — dashed full-width row */}
      {!isAdding && editingId === null && (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm rounded-lg border border-dashed border-[var(--vscode-widget-border)] text-[var(--vscode-descriptionForeground)] hover:border-[var(--vscode-focusBorder)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t('globalShortcut.add')}</span>
        </button>
      )}
    </div>
  );
}
