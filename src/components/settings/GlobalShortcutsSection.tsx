/**
 * GlobalShortcutsSection — OS-level global shortcuts settings page.
 *
 * Row list matching the in-app shortcut editor: each row reads
 * "what it does" → "how to trigger it", with the enabled toggle and the
 * test / edit / delete actions on the right. Adding or editing expands a
 * full-width ShortcutEditForm inside the panel; deleting confirms inline
 * (✓/✗) rather than via a modal.
 */

import { useState, useCallback } from 'react';
import { Plus, Trash2, AlertTriangle, Play, Pencil, Check, X } from 'lucide-react';
import { useI18n, type TranslationKey } from '../../lib/core/i18n';
import { useStore } from '../../store/useStore';
import { bindingToDisplay } from '../../lib/shortcuts/keyboardShortcuts';
import { toast } from '../../lib/core/toast';
import { KbdKeycap, GroupHeading, PANEL_BORDER, PANEL_DIVIDER, PANEL_SURFACE } from './KbdKeycap';
import { ShortcutEditForm, ToggleRow } from './GlobalShortcutForm';
import {
  getActionDef,
  syncGlobalShortcuts,
  findShortcutConflict,
  executeAction,
  type GlobalShortcutConfig,
} from '../../lib/shortcuts/globalShortcuts';

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

function getActionDisplayLabel(
  config: GlobalShortcutConfig,
  t: (k: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  const def = getActionDef(config.actionType);
  if (def) return t(def.labelKey as TranslationKey);
  return config.actionLabel || config.actionType;
}

/** Renders the configured action params as a "a · b · c" summary line. */
function getParamSummary(
  config: GlobalShortcutConfig,
  t: (k: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  const def = getActionDef(config.actionType);
  return (def?.paramFields ?? [])
    .map((field) => {
      const raw = config.actionParams?.[field.key];
      if (raw === undefined || raw === null || raw === '') return '';
      if (field.type === 'select') {
        const opt = field.options?.find((o) => o.value === String(raw));
        return opt ? t(opt.labelKey as TranslationKey) : String(raw);
      }
      return String(raw);
    })
    .filter(Boolean)
    .join(' · ');
}

// ════════════════════════════════════════════════════════════════════
// GlobalShortcutRow — one shortcut entry (non-editing state)
// ════════════════════════════════════════════════════════════════════

function GlobalShortcutRow({
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
  const display = config.shortcut ? bindingToDisplay(config.shortcut) : '';
  const paramSummary = getParamSummary(config, t);

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
      className={`group relative flex items-center gap-3 py-2 pl-3 pr-2 transition-colors ${
        conflict
          ? 'bg-[var(--vscode-inputValidation-errorBackground)]'
          : 'hover:bg-[var(--vscode-list-hoverBackground)]'
      } ${config.enabled ? '' : 'opacity-55'}`}
    >
      {conflict && (
        <span
          aria-hidden
          className="absolute left-0 inset-y-0 w-[2px] bg-[var(--vscode-errorForeground)]"
        />
      )}

      {/* Action + description / params / conflict */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-[var(--vscode-foreground)] truncate">
          {getActionDisplayLabel(config, t)}
        </div>
        {conflict ? (
          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-[var(--vscode-errorForeground)] truncate">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="truncate">{t('globalShortcut.conflict')}</span>
          </div>
        ) : (
          <div className="mt-0.5 text-[11px] text-[var(--vscode-descriptionForeground)] truncate">
            {paramSummary ||
              (def?.descriptionKey ? t(def.descriptionKey as TranslationKey) : '')}
          </div>
        )}
      </div>

      {/* Keys + enable toggle + row actions */}
      <div className="flex items-center gap-2 shrink-0">
        {display && <KbdKeycap display={display} conflicted={!!conflict} />}
        <ToggleRow label="" checked={config.enabled} onChange={onToggle} />

        {/* Fixed width reserves room for the 3 hover actions so the row
            doesn't reflow when they appear. */}
        <div className="flex items-center justify-end gap-0.5 w-[84px] opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {isConfirmingDelete ? (
            <>
              <button
                onClick={onConfirmDelete}
                className="p-1.5 rounded text-[var(--vscode-errorForeground)] hover:bg-[color-mix(in_srgb,var(--vscode-foreground)_8%,transparent)] cursor-pointer transition-colors"
                title={t('globalShortcut.delete')}
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={onCancelDelete}
                className="p-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:bg-[color-mix(in_srgb,var(--vscode-foreground)_8%,transparent)] cursor-pointer transition-colors"
                title={t('globalShortcut.cancel')}
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleTest}
                className="p-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[color-mix(in_srgb,var(--vscode-foreground)_8%,transparent)] cursor-pointer transition-colors"
                title={t('globalShortcut.test')}
              >
                <Play className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onEdit}
                className="p-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[color-mix(in_srgb,var(--vscode-foreground)_8%,transparent)] cursor-pointer transition-colors"
                title={t('globalShortcut.edit')}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="p-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)] hover:bg-[color-mix(in_srgb,var(--vscode-foreground)_8%,transparent)] cursor-pointer transition-colors"
                title={t('globalShortcut.delete')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Main component
// ════════════════════════════════════════════════════════════════════

export function GlobalShortcutsContent() {
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

  const showAddButton = !isAdding && editingId === null;

  return (
    <section id="settings-shortcuts-global" className="space-y-2">
      <GroupHeading title={t('globalShortcut.title')} />
      <p className="px-1 text-[11px] text-[var(--vscode-descriptionForeground)]">
        {t('globalShortcut.description')}
      </p>

      <div
        className={`rounded-[10px] ${PANEL_BORDER} ${PANEL_DIVIDER} ${PANEL_SURFACE} overflow-hidden`}
      >
        {configs.length === 0 && !isAdding ? (
          <div className="px-3 py-6 text-center text-[13px] text-[var(--vscode-descriptionForeground)]">
            {t('globalShortcut.empty')}
          </div>
        ) : (
          configs.map((config) =>
            editingId === config.id ? (
              <ShortcutEditForm
                key={`edit-${config.id}`}
                initial={config}
                configs={configs}
                onSave={handleSave}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <GlobalShortcutRow
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
            ),
          )
        )}

        {isAdding && (
          <ShortcutEditForm
            initial={null}
            configs={configs}
            onSave={handleSave}
            onCancel={() => setIsAdding(false)}
          />
        )}
      </div>

      {showAddButton && (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-1.5 w-full h-9 rounded-[10px] border border-dashed border-[color-mix(in_srgb,var(--vscode-foreground)_15%,transparent)] text-[12px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:border-[var(--vscode-focusBorder)] transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('globalShortcut.add')}</span>
        </button>
      )}
    </section>
  );
}
