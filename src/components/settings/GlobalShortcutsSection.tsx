/**
 * GlobalShortcutsSection — Settings page for OS-level global shortcuts.
 *
 * Features:
 *   - List of configured shortcuts (enable/disable toggle, edit, delete)
 *   - Add new shortcut → action type dropdown → dynamic param form
 *   - Key recording (click → press combo → captured)
 *   - Conflict detection within global shortcuts
 *   - Auto-syncs to OS on every change
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Globe,
  Plus,
  Trash2,
  AlertTriangle,
  Play,
  X,
  Check,
  Folder,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useI18n, type TranslationKey } from '../../lib/i18n';
import { useStore } from '../../store/useStore';
import { eventToBinding } from '../../lib/shortcuts';
import {
  getAllActionDefs,
  getActionDef,
  syncGlobalShortcuts,
  findShortcutConflict,
  executeAction,
  type GlobalShortcutConfig,
  type ActionParamField,
} from '../../lib/globalShortcuts';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function genId(): string {
  return `gs-${Date.now()}`;
}

function getActionLabel(config: GlobalShortcutConfig, t: (k: TranslationKey) => string): string {
  const def = getActionDef(config.actionType);
  if (def) return t(def.labelKey as TranslationKey);
  return config.actionLabel || config.actionType;
}

// ──────────────────────────────────────────────────────────────────
// KbdPill — reused style from ShortcutsSection
// ──────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────
// ParamFieldEditor — renders a form field based on ActionParamField schema
// ──────────────────────────────────────────────────────────────────

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
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--vscode-descriptionForeground)]">
          {t(field.labelKey as TranslationKey)}
        </label>
        <select
          value={String((value as string) ?? field.defaultValue ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="px-2.5 py-1.5 rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] text-sm outline-none focus:border-[var(--vscode-focusBorder)]"
        >
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey as TranslationKey)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === 'directory') {
    const currentValue = (value as string) ?? (field.defaultValue as string) ?? '';
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--vscode-descriptionForeground)]">
          {t(field.labelKey as TranslationKey)}
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={currentValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholderKey ? t(field.placeholderKey as TranslationKey) : ''}
            className="flex-1 px-2.5 py-1.5 rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] text-sm outline-none focus:border-[var(--vscode-focusBorder)]"
          />
          <button
            onClick={async () => {
              const selected = await open({ directory: true });
              if (selected) onChange(selected);
            }}
            className="shrink-0 px-2.5 py-1.5 rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] text-sm hover:bg-[var(--vscode-list-hoverBackground)] flex items-center gap-1.5"
          >
            <Folder className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // text
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[var(--vscode-descriptionForeground)]">
        {t(field.labelKey as TranslationKey)}
      </label>
      <input
        type="text"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholderKey ? t(field.placeholderKey as TranslationKey) : ''}
        className="px-2.5 py-1.5 rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] text-sm outline-none focus:border-[var(--vscode-focusBorder)]"
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// ConfigRow — a single existing shortcut entry
// ──────────────────────────────────────────────────────────────────

function ConfigRow({
  config,
  configs,
  onToggle,
  onEdit,
  onDelete,
}: {
  config: GlobalShortcutConfig;
  configs: GlobalShortcutConfig[];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const conflict = findShortcutConflict(config.shortcut, configs, config.id);

  const handleTest = async () => {
    await executeAction(config, {
      emit: async (event, payload) => {
        const { emit } = await import('@tauri-apps/api/event');
        await emit(event, payload);
      },
    });
  };

  const def = getActionDef(config.actionType);
  const Icon = def?.icon ?? Globe;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] hover:border-[var(--vscode-input-border)] transition-colors">
      {/* Icon */}
      <div className="w-8 h-8 rounded-md bg-[var(--vscode-list-hoverBackground)] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[var(--vscode-descriptionForeground)]" />
      </div>

      {/* Shortcut + action info */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <KbdPill binding={config.shortcut} recording={false} conflicted={!!conflict} />
        <div className="min-w-0 flex flex-col">
          <span className="text-sm text-[var(--vscode-foreground)] truncate">
            {getActionLabel(config, t)}
          </span>
          {conflict && (
            <span className="text-[11px] text-[var(--vscode-errorForeground)] flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {t('globalShortcut.conflict')}
            </span>
          )}
        </div>
      </div>

      {/* Toggle */}
      <button
        onClick={onToggle}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
          config.enabled
            ? 'bg-[var(--vscode-button-background)]'
            : 'bg-[var(--vscode-widget-border)]'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            config.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>

      {/* Actions */}
      <button
        onClick={handleTest}
        title={t('globalShortcut.test')}
        className="shrink-0 p-1.5 rounded-md text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:text-[var(--vscode-foreground)] transition-colors"
      >
        <Play className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onEdit}
        title={t('globalShortcut.edit')}
        className="shrink-0 px-2 py-1 rounded-md text-xs text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:text-[var(--vscode-foreground)] transition-colors"
      >
        {t('globalShortcut.editBtn')}
      </button>
      <button
        onClick={onDelete}
        title={t('globalShortcut.delete')}
        className="shrink-0 p-1.5 rounded-md text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:text-[var(--vscode-errorForeground)] transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// EditPanel — add/edit form
// ──────────────────────────────────────────────────────────────────

function EditPanel({
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
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);

  const currentDef = getActionDef(actionType);
  const conflict = findShortcutConflict(shortcut, configs, initial?.id ?? '');

  // ── Key recording ──
  const handleRecordKey = useCallback(
    (e: KeyboardEvent) => {
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
    },
    [],
  );

  useEffect(() => {
    if (recording) {
      recordingRef.current = true;
      window.addEventListener('keydown', handleRecordKey, true);
    } else {
      recordingRef.current = false;
      window.removeEventListener('keydown', handleRecordKey, true);
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
    const config: GlobalShortcutConfig = {
      id: initial?.id ?? genId(),
      enabled: initial?.enabled ?? true,
      shortcut,
      actionType,
      actionLabel: currentDef ? t(currentDef.labelKey as TranslationKey) : actionType,
      actionParams,
    };
    onSave(config);
  };

  const canSave = shortcut && actionType && !conflict;

  return (
    <div className="rounded-xl border border-[var(--vscode-focusBorder)] bg-[var(--vscode-editor-background)] p-5 space-y-4">
      {/* Shortcut recording */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[var(--vscode-descriptionForeground)]">
          {t('globalShortcut.shortcutKey')}
        </label>
        <div onClick={() => setRecording(true)}>
          <KbdPill binding={shortcut} recording={recording} conflicted={!!conflict} />
        </div>
        {conflict && (
          <span className="text-[11px] text-[var(--vscode-errorForeground)] flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {t('globalShortcut.conflict')}
          </span>
        )}
      </div>

      {/* Action type selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[var(--vscode-descriptionForeground)]">
          {t('globalShortcut.action')}
        </label>
        <select
          value={actionType}
          onChange={(e) => handleActionTypeChange(e.target.value)}
          className="px-2.5 py-1.5 rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] text-sm outline-none focus:border-[var(--vscode-focusBorder)]"
        >
          {actionDefs.map((def) => (
            <option key={def.type} value={def.type}>
              {t(def.labelKey as TranslationKey)}
            </option>
          ))}
        </select>
        {currentDef?.descriptionKey && (
          <span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
            {t(currentDef.descriptionKey as TranslationKey)}
          </span>
        )}
      </div>

      {/* Dynamic param fields */}
      {currentDef?.paramFields && currentDef.paramFields.length > 0 && (
        <div className="space-y-3 pt-1">
          {currentDef.paramFields.map((field) => (
            <ParamFieldEditor
              key={field.key}
              field={field}
              value={actionParams[field.key]}
              onChange={(v) =>
                setActionParams((prev) => ({ ...prev, [field.key]: v }))
              }
            />
          ))}
        </div>
      )}

      {/* Buttons */}
      <div className="flex justify-end gap-2 pt-2 border-t border-[var(--vscode-widget-border)]">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md text-sm text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          {t('globalShortcut.cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="px-3 py-1.5 rounded-md text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          {t('globalShortcut.save')}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────

export default function GlobalShortcutsSection() {
  const { t } = useI18n();
  const configs = useStore((s) => s.globalShortcuts);
  const setGlobalShortcuts = useStore((s) => s.setGlobalShortcuts);
  const [editing, setEditing] = useState<GlobalShortcutConfig | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);

  // ── Persist + sync to OS whenever configs change ──
  const persistAndSync = useCallback(async (newConfigs: GlobalShortcutConfig[]) => {
    setGlobalShortcuts(newConfigs);
    try {
      await syncGlobalShortcuts(newConfigs.filter((c) => c.enabled));
    } catch (err) {
      console.error('[GlobalShortcutsSection] Failed to sync:', err);
    }
  }, [setGlobalShortcuts]);

  const handleAdd = (config: GlobalShortcutConfig) => {
    persistAndSync([...configs, config]);
    setShowAddPanel(false);
  };

  const handleUpdate = (config: GlobalShortcutConfig) => {
    persistAndSync(configs.map((c) => (c.id === config.id ? config : c)));
    setEditing(null);
  };

  const handleToggle = (id: string) => {
    persistAndSync(
      configs.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    );
  };

  const handleDelete = (id: string) => {
    persistAndSync(configs.filter((c) => c.id !== id));
  };

  return (
    <div id="settings-globalShortcuts" className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Globe className="w-5 h-5 text-[var(--vscode-descriptionForeground)]" />
        <h2 className="text-lg font-semibold text-[var(--vscode-foreground)]">
          {t('globalShortcut.title')}
        </h2>
      </div>

      <p className="text-sm text-[var(--vscode-descriptionForeground)] leading-relaxed">
        {t('globalShortcut.description')}
      </p>

      {/* Add button */}
      {!showAddPanel && !editing && (
        <button
          onClick={() => setShowAddPanel(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[var(--vscode-input-border)] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] text-sm font-medium hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('globalShortcut.add')}
        </button>
      )}

      {/* Add / Edit panel */}
      {showAddPanel && (
        <EditPanel
          initial={null}
          configs={configs}
          onSave={handleAdd}
          onCancel={() => setShowAddPanel(false)}
        />
      )}
      {editing && (
        <EditPanel
          initial={editing}
          configs={configs}
          onSave={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Config list */}
      <div className="space-y-2">
        {configs.length === 0 && !showAddPanel ? (
          <div className="text-center py-12 text-sm text-[var(--vscode-descriptionForeground)]">
            {t('globalShortcut.empty')}
          </div>
        ) : (
          configs.map((config) => (
            <ConfigRow
              key={config.id}
              config={config}
              configs={configs}
              onToggle={() => handleToggle(config.id)}
              onEdit={() => setEditing(config)}
              onDelete={() => handleDelete(config.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
