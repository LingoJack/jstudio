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
import { ipc } from '../../lib/core/ipc';
import type { ModelProvider, AgentConfigFile, ToolCallMode } from '../../types/storage';
import { useI18n } from '../../lib/core/i18n';
import { toast } from '../../lib/core/toast';

/**
 * AgentModelSection — manage model capability providers.
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
      const raw = await ipc.loadAgentConfig();
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
        await ipc.saveAgentConfig(next);
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
          className="jstudio-btn-primary mt-4"
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
        <label className="block text-sm font-medium text-[var(--vscode-foreground)] mb-4">
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
        {/* Header: title + add button */}
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-[var(--vscode-foreground)]">
            {t('agent.providers')}
          </label>
          {!isAdding && editingIndex === null && providers.length > 0 && (
            <button
              onClick={() => setIsAdding(true)}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-[var(--vscode-input-border)] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:border-[var(--vscode-focusBorder)] transition-all cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{t('agent.addProvider')}</span>
            </button>
          )}
        </div>
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {t('agent.noProvidersDesc')}
        </p>

        {/* Empty state */}
        {providers.length === 0 && !isAdding && (
          <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-[var(--vscode-widget-border)] rounded-lg">
            <Bot className="w-10 h-10 text-[var(--vscode-descriptionForeground)] opacity-40 mb-3" />
            <p className="text-sm font-medium text-[var(--vscode-foreground)] mb-1">
              {t('agent.noProviders')}
            </p>
            <p className="text-xs text-[var(--vscode-descriptionForeground)] max-w-xs mb-4">
              {t('agent.noProvidersDesc')}
            </p>
            <button
              onClick={() => setIsAdding(true)}
              disabled={saving}
              className="jstudio-btn-primary"
            >
              <Plus className="w-4 h-4" />
              <span>{t('agent.addProvider')}</span>
            </button>
          </div>
        )}

        {/* Provider cards */}
        <div className="grid grid-cols-2 gap-3">
          {providers.map((provider, index) => {
            const isActive = index === activeIndex;
            const isEditing = editingIndex === index;
            const isConfirmingDelete = confirmDeleteIndex === index;

            if (isEditing) {
              return (
                <div key={`edit-${index}`} className="col-span-2">
                  <ProviderEditForm
                    initial={provider}
                    onCancel={() => setEditingIndex(null)}
                    onSave={(updated) => handleUpdateProvider(index, updated)}
                    saving={saving}
                  />
                </div>
              );
            }

            return (
              <div
                key={`provider-${index}`}
                className={`relative flex flex-col p-4 rounded-lg border transition-colors ${
                  isActive
                    ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
                    : 'border-[var(--vscode-widget-border)] bg-[var(--vscode-list-hoverBackground)] hover:border-[var(--vscode-focusBorder)]'
                }`}
              >
                {/* Header: radio + name + active badge */}
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => !isActive && handleSetActive(index)}
                    className="flex-shrink-0 cursor-pointer flex items-center justify-center w-5 h-5"
                    title={t('agent.setActive')}
                  >
                    {isActive ? (
                      <div className="w-4 h-4 rounded-full border-2 border-[var(--vscode-focusBorder)] bg-[var(--vscode-focusBorder)] flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-list-activeSelectionBackground)]" />
                      </div>
                    ) : (
                      <Circle className="w-4 h-4 text-[var(--vscode-descriptionForeground)] opacity-40 transition-opacity" />
                    )}
                  </button>
                  <span className="text-sm font-medium text-[var(--vscode-foreground)] truncate flex-1 min-w-0">
                    {provider.name}
                  </span>
                  {isActive && (
                    <span className="text-tiny px-2 py-0.5 rounded-full bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] flex-shrink-0 leading-tight">
                      {t('agent.active')}
                    </span>
                  )}
                </div>

                {/* Body: model + api_base */}
                <div className="space-y-1 mb-3 min-w-0">
                  <div className="text-xs text-[var(--vscode-foreground)] truncate font-mono">
                    {provider.model}
                  </div>
                  <div className="text-xs text-[var(--vscode-descriptionForeground)] truncate">
                    {provider.api_base}
                  </div>
                  {provider.max_tokens != null && provider.max_tokens > 0 && (
                    <div className="text-xs text-[var(--vscode-descriptionForeground)] truncate">
                      {t('agent.field.maxTokens')}: {provider.max_tokens}
                    </div>
                  )}
                </div>

                {/* Badges */}
                {(provider.supports_vision ||
                  provider.tool_call_mode === 'disabled' ||
                  (provider.thinking_effort ?? '').trim() !== '') && (
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    {provider.supports_vision && (
                      <span className="text-tiny px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] flex-shrink-0 leading-tight">
                        Vision
                      </span>
                    )}
                    {provider.tool_call_mode === 'disabled' && (
                      <span className="text-tiny px-1.5 py-0.5 rounded bg-[var(--vscode-editorWarning-background)] text-[var(--vscode-editorWarning-foreground)] flex-shrink-0 leading-tight">
                        No Tools
                      </span>
                    )}
                    {(provider.thinking_effort ?? '').trim() !== '' && (
                      <span
                        className="text-tiny px-1.5 py-0.5 rounded bg-[var(--vscode-textBlockQuote-background)] text-[var(--vscode-textBlockQuote-foreground)] flex-shrink-0 leading-tight font-mono"
                        title={t('agent.field.thinkingEffort')}
                      >
                        {t('agent.field.thinkingEffort')}: {provider.thinking_effort}
                      </span>
                    )}
                  </div>
                )}

                {/* Footer: actions */}
                <div className="flex items-center gap-1 mt-auto pt-2 border-t border-[var(--vscode-widget-border)]">
                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-2 w-full">
                      <span className="text-xs text-[var(--vscode-errorForeground)] flex-1 truncate">
                        {t('agent.confirmDelete')}
                      </span>
                      <button
                        onClick={() => handleDeleteProvider(index)}
                        disabled={saving}
                        className="p-1.5 rounded text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer disabled:opacity-50 transition-colors"
                        title={t('agent.delete')}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteIndex(null)}
                        className="p-1.5 rounded text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setEditingIndex(index)}
                        disabled={saving}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer disabled:opacity-50 transition-colors"
                        title={t('agent.edit')}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>{t('agent.edit')}</span>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteIndex(index)}
                        disabled={saving}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer disabled:opacity-50 transition-colors"
                        title={t('agent.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{t('agent.delete')}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add form */}
          {isAdding && (
            <div className="col-span-2">
              <ProviderEditForm
                onCancel={() => setIsAdding(false)}
                onSave={handleAddProvider}
                saving={saving}
              />
            </div>
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
    max_tokens: null,
    thinking_effort: '',
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
    // Normalise max_tokens: empty / invalid -> null (API default)
    const rawTokens = form.max_tokens;
    const num = Math.floor(Number(rawTokens));
    const maxTokens =
      rawTokens === null || rawTokens === undefined || rawTokens === 0 || Number.isNaN(num)
        ? null
        : Math.max(1, num);
    onSave({
      ...form,
      name: form.name.trim(),
      api_base: form.api_base.trim(),
      model: form.model.trim(),
      api_key: form.api_key.trim(),
      thinking_effort: form.thinking_effort?.trim() ?? '',
      max_tokens: maxTokens,
    });
  };

  const inputClass =
    'w-full px-3 py-2 text-sm rounded-md bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] focus:border-[var(--vscode-focusBorder)] outline-none transition-colors';

  return (
    <div className="p-5 rounded-lg border border-[var(--vscode-focusBorder)] bg-[var(--vscode-editor-background)] space-y-4">
      {/* Name + Model */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label={t('agent.field.name')}>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder={t('agent.field.namePlaceholder')}
            autoFocus
            className={inputClass}
          />
        </FormField>
        <FormField label={t('agent.field.model')}>
          <input
            type="text"
            value={form.model}
            onChange={(e) => update('model', e.target.value)}
            placeholder={t('agent.field.modelPlaceholder')}
            className={`${inputClass} font-mono`}
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
          className={`${inputClass} font-mono`}
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
            className={`${inputClass} pr-12 font-mono`}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] cursor-pointer transition-colors"
            title={showKey ? t('agent.hideKey') : t('agent.showKey')}
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </FormField>

      {/* Toggles */}
      <div className="grid grid-cols-2 gap-4 pt-1">
        {/* Supports Vision */}
        <ToggleRow
          label={t('agent.field.supportsVision')}
          desc={t('agent.field.supportsVisionDesc')}
          checked={form.supports_vision}
          onChange={(v) => update('supports_vision', v)}
        />

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
                className={`flex-1 px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer ${
                  form.tool_call_mode === mode
                    ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)]'
                    : 'border-[var(--vscode-input-border)] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                }`}
              >
                {mode === 'native'
                  ? t('agent.field.toolCallModeNative')
                  : t('agent.field.toolCallModeDisabled')}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1.5 opacity-70 leading-tight">
            {t('agent.field.toolCallModeDesc')}
          </p>
        </div>
      </div>

      {/* Max Tokens + Thinking Effort */}
      <div className="grid grid-cols-2 gap-4 pt-1">
        <FormField label={t('agent.field.maxTokens')}>
          <input
            type="number"
            min={1}
            value={form.max_tokens ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              update('max_tokens', v === '' ? null : Number(v));
            }}
            placeholder={t('agent.field.maxTokensPlaceholder')}
            className={inputClass}
          />
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1.5 opacity-70 leading-tight">
            {t('agent.field.maxTokensDesc')}
          </p>
        </FormField>
        <FormField label={t('agent.field.thinkingEffort')}>
          <input
            type="text"
            value={form.thinking_effort ?? ''}
            onChange={(e) => update('thinking_effort', e.target.value)}
            placeholder={t('agent.field.thinkingEffortPlaceholder')}
            className={`${inputClass} font-mono`}
          />
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1.5 opacity-70 leading-tight">
            {t('agent.field.thinkingEffortDesc')}
          </p>
        </FormField>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--vscode-widget-border)]">
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
          className="jstudio-btn-primary"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{t('agent.save')}</span>
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
    </div>
  );
}
