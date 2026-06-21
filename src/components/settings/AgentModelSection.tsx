import { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Eye,
  EyeOff,
  Loader2,
  Bot,
  AlertCircle,
  Circle,
} from 'lucide-react';
import { storage } from '../../lib/storage';
import type { ModelProvider, AgentConfigFile, ToolCallMode } from '../../lib/storage';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';

/**
 * AgentModelSection — manage jcli agent model providers.
 *
 * Reads from / writes to `~/.jdata/agent/data/agent_config.json`.
 * Only touches `providers` + `active_index`; all other config fields
 * (system_prompt, compact, etc.) are carried through untouched.
 */
export default function AgentModelSection() {
  const { t } = useI18n();
  const [config, setConfig] = useState<AgentConfigFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Load config on mount ──────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await storage.loadAgentConfig();
      // Normalise: ensure providers array + active_index exist
      const normalised: AgentConfigFile = {
        ...raw,
        providers: Array.isArray(raw.providers) ? (raw.providers as ModelProvider[]) : [],
        active_index: typeof raw.active_index === 'number' ? raw.active_index : 0,
      };
      setConfig(normalised);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // ── Save full config (preserves all other fields) ─────────────────
  const saveConfig = useCallback(
    async (next: AgentConfigFile) => {
      setSaving(true);
      try {
        await storage.saveAgentConfig(next);
        setConfig(next);
        toast.success(t('agent.saveSuccess'));
      } catch (e) {
        toast.error(t('agent.saveFailed', { error: String(e) }));
      } finally {
        setSaving(false);
      }
    },
    [t],
  );

  // ── Actions ───────────────────────────────────────────────────────

  const handleSetActive = (index: number) => {
    if (!config || index === config.active_index) return;
    saveConfig({ ...config, active_index: index });
  };

  const handleAddProvider = (provider: ModelProvider) => {
    if (!config) return;
    const next = { ...config, providers: [...config.providers, provider] };
    // If first provider, make it active
    if (config.providers.length === 0) {
      next.active_index = 0;
    }
    saveConfig(next);
    setIsAdding(false);
  };

  const handleUpdateProvider = (index: number, provider: ModelProvider) => {
    if (!config) return;
    const providers = [...config.providers];
    providers[index] = provider;
    saveConfig({ ...config, providers });
    setEditingIndex(null);
  };

  const handleDeleteProvider = (index: number) => {
    if (!config) return;
    const providers = config.providers.filter((_, i) => i !== index);
    // Adjust active_index
    let activeIndex = config.active_index;
    if (index === activeIndex) {
      activeIndex = 0;
    } else if (index < activeIndex) {
      activeIndex -= 1;
    }
    activeIndex = Math.min(activeIndex, Math.max(0, providers.length - 1));
    saveConfig({ ...config, providers, active_index: activeIndex });
    setConfirmDeleteIndex(null);
  };

  // ── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--vscode-descriptionForeground)]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">{t('agent.loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--vscode-errorForeground)]">
        <AlertCircle className="w-8 h-8 mb-3" />
        <p className="text-sm">{t('agent.configError')}</p>
        <p className="text-xs mt-1 opacity-70">{error}</p>
        <button
          onClick={loadConfig}
          className="mt-4 px-4 py-1.5 text-sm rounded border border-[var(--vscode-widget-border)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
        >
          {t('agent.retry')}
        </button>
      </div>
    );
  }

  const providers = config?.providers ?? [];
  const activeIndex = config?.active_index ?? 0;
  const activeProvider = providers[activeIndex];

  return (
    <div className="space-y-8">
      {/* ---- Active Model ---- */}
      <div id="settings-agent-providers">
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-1.5">
          {t('agent.activeModel')}
        </label>
        {activeProvider ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--vscode-list-activeSelectionBackground)] border border-[var(--vscode-focusBorder)]">
            <div className="w-10 h-10 rounded-lg bg-[var(--vscode-badge-background)] flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-[var(--vscode-badge-foreground)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--vscode-foreground)] truncate">
                {activeProvider.name}
              </p>
              <p className="text-xs text-[var(--vscode-descriptionForeground)] truncate">
                {activeProvider.model} · {activeProvider.api_base}
              </p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] flex-shrink-0">
              {t('agent.active')}
            </span>
          </div>
        ) : (
          <p className="text-sm text-[var(--vscode-descriptionForeground)]">
            {t('agent.noProviders')}
          </p>
        )}
      </div>

      <div className="border-t border-[var(--vscode-widget-border)]" />

      {/* ---- Provider List ---- */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <label className="block text-sm font-medium text-[var(--vscode-foreground)]">
              {t('agent.providers')}
            </label>
            <p className="text-sm text-[var(--vscode-descriptionForeground)] mt-1">
              {t('agent.providersDesc')}
            </p>
          </div>
          {!isAdding && editingIndex === null && (
            <button
              onClick={() => setIsAdding(true)}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {t('agent.addProvider')}
            </button>
          )}
        </div>

        {/* Empty state */}
        {providers.length === 0 && !isAdding && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="w-12 h-12 text-[var(--vscode-descriptionForeground)] opacity-40 mb-3" />
            <p className="text-sm font-medium text-[var(--vscode-foreground)] mb-1">
              {t('agent.noProviders')}
            </p>
            <p className="text-xs text-[var(--vscode-descriptionForeground)] max-w-xs">
              {t('agent.noProvidersDesc')}
            </p>
          </div>
        )}

        {/* Provider cards */}
        <div className="space-y-2">
          {providers.map((provider, index) => {
            const isActive = index === activeIndex;
            const isEditing = editingIndex === index;
            const isConfirmingDelete = confirmDeleteIndex === index;

            if (isEditing) {
              return (
                <ProviderEditForm
                  key={`edit-${index}`}
                  initial={provider}
                  onCancel={() => setEditingIndex(null)}
                  onSave={(updated) => handleUpdateProvider(index, updated)}
                  saving={saving}
                />
              );
            }

            return (
              <div
                key={`provider-${index}`}
                className={`group relative flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                  isActive
                    ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
                    : 'border-[var(--vscode-widget-border)] bg-[var(--vscode-list-hoverBackground)]'
                }`}
              >
                {/* Radio to set active */}
                <button
                  onClick={() => !isActive && handleSetActive(index)}
                  className="mt-0.5 flex-shrink-0 cursor-pointer"
                  title={t('agent.setActive')}
                >
                  {isActive ? (
                    <div className="w-4 h-4 rounded-full border-2 border-[var(--vscode-focusBorder)] bg-[var(--vscode-focusBorder)] flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-list-activeSelectionBackground)]" />
                    </div>
                  ) : (
                    <Circle className="w-4 h-4 text-[var(--vscode-descriptionForeground)] opacity-50 group-hover:opacity-100" />
                  )}
                </button>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--vscode-foreground)] truncate">
                      {provider.name}
                    </span>
                    {provider.supports_vision && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] flex-shrink-0">
                        Vision
                      </span>
                    )}
                    {provider.tool_call_mode === 'disabled' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--vscode-editorWarning-background)] text-[var(--vscode-editorWarning-foreground)] flex-shrink-0">
                        No Tools
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5 space-y-0.5">
                    <p>
                      <span className="opacity-70">model:</span>{' '}
                      <span className="text-[var(--vscode-foreground)]">{provider.model}</span>
                    </p>
                    <p className="truncate">
                      <span className="opacity-70">base:</span>{' '}
                      <span className="text-[var(--vscode-foreground)]">{provider.api_base}</span>
                    </p>
                    <p>
                      <span className="opacity-70">key:</span>{' '}
                      <span className="text-[var(--vscode-foreground)]">
                        {'•'.repeat(Math.min(12, provider.api_key.length || 0))}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[var(--vscode-errorForeground)] mr-1">
                        {t('agent.deleteConfirm', { name: provider.name })}
                      </span>
                      <button
                        onClick={() => handleDeleteProvider(index)}
                        disabled={saving}
                        className="p-1.5 rounded text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer disabled:opacity-50"
                        title={t('agent.delete')}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteIndex(null)}
                        className="p-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setEditingIndex(index)}
                        disabled={saving}
                        className="p-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        title={t('agent.edit')}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteIndex(index)}
                        disabled={saving}
                        className="p-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        title={t('agent.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add form */}
          {isAdding && (
            <ProviderEditForm
              onCancel={() => setIsAdding(false)}
              onSave={handleAddProvider}
              saving={saving}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// ProviderEditForm — inline add/edit form
// ════════════════════════════════════════════════════════════════════

function emptyProvider(): ModelProvider {
  return {
    name: '',
    api_base: '',
    api_key: '',
    model: '',
    supports_vision: false,
    tool_call_mode: 'native',
  };
}

function ProviderEditForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: ModelProvider;
  onSave: (provider: ModelProvider) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<ModelProvider>(initial ?? emptyProvider());
  const [showKey, setShowKey] = useState(false);

  const update = <K extends keyof ModelProvider>(key: K, value: ModelProvider[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.api_base.trim() || !form.model.trim()) {
      toast.warning(t('agent.fillRequired'));
      return;
    }
    onSave({
      ...form,
      name: form.name.trim(),
      api_base: form.api_base.trim(),
      model: form.model.trim(),
      api_key: form.api_key.trim(),
    });
  };

  return (
    <div className="p-4 rounded-lg border border-[var(--vscode-focusBorder)] bg-[var(--vscode-editor-background)] space-y-4">
      {/* Name + Model */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label={t('agent.field.name')}>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder={t('agent.field.namePlaceholder')}
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] focus:border-[var(--vscode-focusBorder)] outline-none transition-colors"
          />
        </FormField>
        <FormField label={t('agent.field.model')}>
          <input
            type="text"
            value={form.model}
            onChange={(e) => update('model', e.target.value)}
            placeholder={t('agent.field.modelPlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] focus:border-[var(--vscode-focusBorder)] outline-none transition-colors"
          />
        </FormField>
      </div>

      {/* API Base */}
      <FormField label={t('agent.field.apiBase')}>
        <input
          type="text"
          value={form.api_base}
          onChange={(e) => update('api_base', e.target.value)}
          placeholder={t('agent.field.apiBasePlaceholder')}
          className="w-full px-3 py-2 text-sm rounded-md bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] focus:border-[var(--vscode-focusBorder)] outline-none transition-colors"
        />
      </FormField>

      {/* API Key */}
      <FormField label={t('agent.field.apiKey')}>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={form.api_key}
            onChange={(e) => update('api_key', e.target.value)}
            placeholder={t('agent.field.apiKeyPlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] focus:border-[var(--vscode-focusBorder)] outline-none transition-colors pr-20 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] cursor-pointer"
          >
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showKey ? t('agent.hideKey') : t('agent.showKey')}
          </button>
        </div>
      </FormField>

      {/* Toggles */}
      <div className="grid grid-cols-2 gap-4">
        {/* Supports Vision */}
        <div>
          <ToggleRow
            label={t('agent.field.supportsVision')}
            desc={t('agent.field.supportsVisionDesc')}
            checked={form.supports_vision}
            onChange={(v) => update('supports_vision', v)}
          />
        </div>

        {/* Tool Call Mode */}
        <div>
          <label className="block text-xs font-medium text-[var(--vscode-foreground)] mb-1.5">
            {t('agent.field.toolCallMode')}
          </label>
          <div className="flex gap-2">
            {(['native', 'disabled'] as ToolCallMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => update('tool_call_mode', mode)}
                className={`flex-1 px-3 py-1.5 text-xs rounded border transition-colors cursor-pointer ${
                  form.tool_call_mode === mode
                    ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)]'
                    : 'border-[var(--vscode-input-border)] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                }`}
              >
                {mode === 'native' ? t('agent.field.toolCallModeNative') : t('agent.field.toolCallModeDisabled')}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1 opacity-70">
            {t('agent.field.toolCallModeDesc')}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--vscode-widget-border)]">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-1.5 text-sm rounded-md border border-[var(--vscode-input-border)] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer disabled:opacity-50"
        >
          {t('agent.cancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {t('agent.save')}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Small helpers
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

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <label className="block text-xs font-medium text-[var(--vscode-foreground)] mb-0.5">
          {label}
        </label>
        {desc && (
          <p className="text-xs text-[var(--vscode-descriptionForeground)] opacity-70 leading-tight">
            {desc}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
          checked
            ? 'bg-[var(--vscode-focusBorder)]'
            : 'bg-[var(--vscode-input-border)]'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-3' : ''
          }`}
        />
      </button>
    </div>
  );
}
