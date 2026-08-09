/**
 * ModelDropdownPanel - 共享的模型选择下拉面板 + hook
 *
 * 抽取自 ModelSelector 和 ContextSwitchCard 中完全重复的模型选择逻辑：
 * - `useModelDropdown` hook：config 加载、open/selectedIndex 状态、
 *   selectProvider（含 dispatch 同步事件）、键盘导航、外部点击关闭
 * - `ModelDropdownPanel` 组件：provider 列表面板 UI
 *
 * 用法：
 *   const { providers, activeIndex, selectedIndex, open, setOpen,
 *           selectProvider, handleKeyDown, triggerRef, panelRef, loading,
 *           activeProvider } = useModelDropdown('up');
 *   <ModelDropdownPanel providers={providers} activeIndex={activeIndex}
 *       selectedIndex={selectedIndex} onSelect={selectProvider}
 *       onHover={setSelectedIndex} panelRef={panelRef} className="..." />
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Check } from 'lucide-react';
import { ipc } from '../../lib/core/ipc';
import type { ModelProvider, AgentConfigFile } from '../../types/storage';
import { useI18n } from '../../lib/core/i18n';
import { toast } from '../../lib/core/toast';

/** Custom event dispatched whenever the active provider changes. */
export const AGENT_CONFIG_CHANGED_EVENT = 'jstudio:agent-config-changed';

// ────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────

/**
 * Encapsulates all model-dropdown logic shared by ModelSelector (panel opens
 * upward) and ContextSwitchCard (panel opens downward).
 *
 * @param direction - `'up'` panel opens above the trigger (ArrowUp = next),
 *                    `'down'` panel opens below the trigger (ArrowDown = next).
 */
export function useModelDropdown(direction: 'up' | 'down' = 'up') {
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
        const raw = await ipc.loadAgentConfig();
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
        await ipc.saveAgentConfig(next);
        setConfig(next);
        setOpen(false);
        window.dispatchEvent(new Event(AGENT_CONFIG_CHANGED_EVENT));
        toast.success(t('agent.modelSwitched'));
      } catch (e) {
        toast.error(t('agent.saveFailed', { error: String(e) }));
      }
    },
    [config, t],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const nextKey = direction === 'up' ? 'ArrowUp' : 'ArrowDown';
    const prevKey = direction === 'up' ? 'ArrowDown' : 'ArrowUp';

    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === nextKey) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case nextKey:
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, providers.length - 1));
        break;
      case prevKey:
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

  return {
    config,
    providers,
    activeIndex,
    activeProvider,
    open,
    setOpen,
    selectedIndex,
    setSelectedIndex,
    selectProvider,
    handleKeyDown,
    triggerRef,
    panelRef,
    loading,
  };
}

// ────────────────────────────────────────────────────────
// Panel component
// ────────────────────────────────────────────────────────

export interface ModelDropdownPanelProps {
  providers: ModelProvider[];
  activeIndex: number;
  selectedIndex: number;
  onSelect: (idx: number) => void;
  onHover: (idx: number) => void;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

export function ModelDropdownPanel({
  providers,
  activeIndex,
  selectedIndex,
  onSelect,
  onHover,
  panelRef,
  className = '',
}: ModelDropdownPanelProps) {
  return (
    <div ref={panelRef} className={className}>
      {providers.map((provider, idx) => (
        <button
          key={`${provider.name}-${idx}`}
          type="button"
          onMouseEnter={() => onHover(idx)}
          onClick={() => onSelect(idx)}
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
  );
}
