/**
 * ModelSelector — 紧凑型模型切换器
 *
 * 放在输入框底部状态栏，点击展开上拉式下拉面板选择模型。
 * 设计原则：
 * - 透明背景，融入输入框浮空玻璃风格
 * - 触发器仅显示模型名 + 小箭头，hover 用半透明背景
 * - 下拉面板向上弹出（bottom-full），避免被屏幕底部截断
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronUp, Check } from 'lucide-react';
import { storage, type ModelProvider, type AgentConfigFile } from '../../lib/core/storage';
import { useI18n } from '../../lib/core/i18n';
import { toast } from '../../lib/toast';

// ────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────

export function ModelSelector() {
  const { t } = useI18n();
  const [config, setConfig] = useState<AgentConfigFile | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load config on mount
  useEffect(() => {
    const load = async () => {
      try {
        const raw = await storage.loadAgentConfig();
        const normalised: AgentConfigFile = {
          ...raw,
          providers: Array.isArray(raw.providers) ? (raw.providers as ModelProvider[]) : [],
          active_index: typeof raw.active_index === 'number' ? raw.active_index : 0,
        };
        setConfig(normalised);
      } catch (e) {
        console.error('Failed to load agent config:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const providers = config?.providers ?? [];
  const activeIndex = config?.active_index ?? 0;
  const activeProvider = providers[activeIndex];

  // Sync selectedIndex when opening
  useEffect(() => {
    if (open) setSelectedIndex(activeIndex);
  }, [open, activeIndex]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Select provider
  const selectProvider = useCallback(
    async (idx: number) => {
      if (!config || idx === config.active_index) return;
      try {
        const next = { ...config, active_index: idx };
        await storage.saveAgentConfig(next);
        setConfig(next);
        setOpen(false);
        toast.success(t('agent.modelSwitched'));
      } catch (e) {
        toast.error(t('agent.saveFailed', { error: String(e) }));
      }
    },
    [config, t],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, providers.length - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        selectProvider(selectedIndex);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  // Loading / no providers — render nothing visible
  if (loading || providers.length === 0) return null;

  return (
    <div className="relative">
      {/* Trigger — 透明背景，融入输入框玻璃风格 */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors hover:bg-[rgba(255,255,255,0.12)]"
        style={{ color: 'var(--vscode-descriptionForeground)' }}
      >
        <span className="truncate max-w-[120px] font-medium">
          {activeProvider?.name || t('agent.selectModel')}
        </span>
        <ChevronUp
          className={`w-3 h-3 shrink-0 transition-transform ${open ? '' : 'rotate-180'}`}
        />
      </button>

      {/* Dropdown panel — 向上弹出 */}
      {open && (
        <div
          ref={panelRef}
          className="absolute bottom-full left-0 mb-1 z-dropdown py-1 rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-lg text-sm max-h-60 overflow-y-auto min-w-[220px]"
        >
          {providers.map((provider, idx) => (
            <button
              key={`${provider.name}-${idx}`}
              type="button"
              onMouseEnter={() => setSelectedIndex(idx)}
              onClick={() => selectProvider(idx)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer transition-colors ${
                idx === selectedIndex
                  ? 'bg-[var(--vscode-menu-hoverBackground)]'
                  : ''
              }`}
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                {idx === activeIndex && (
                  <Check className="w-3.5 h-3.5 text-[var(--vscode-foreground)]" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[var(--vscode-menu-foreground)] truncate font-medium">
                  {provider.name}
                </span>
                <span className="block text-xs text-[var(--vscode-descriptionForeground)] truncate mt-0.5 font-mono">
                  {provider.model}
                </span>
              </span>
              {provider.supports_vision && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] flex-shrink-0">
                  Vision
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
