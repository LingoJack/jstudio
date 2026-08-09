/**
 * ContextSwitchCard — 上下文切换卡片
 *
 * 整合模型选择器 + 操作按钮，放在侧边栏顶部。
 * 设计原则：
 * - 去硬边框，用背景色区分（hover 时略深）
 * - 箭头靠右对齐，弱化视觉
 * - 卡片紧凑，下部分合并成一行操作按钮
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, Check, Plus, MessageSquarePlus, List } from 'lucide-react';
import { storage } from '../../lib/core/storage';
import type { ModelProvider, AgentConfigFile } from '../../types/storage';
import { useI18n } from '../../lib/core/i18n';
import { toast } from '../../lib/core/toast';

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

interface ContextSwitchCardProps {
  /** 点击"新建对话"按钮 */
  onNewChat?: () => void;
  /** 点击"会话列表"按钮 */
  onShowList?: () => void;
}

// ────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────

export function ContextSwitchCard({ onNewChat, onShowList }: ContextSwitchCardProps) {
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
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, providers.length - 1));
        break;
      case 'ArrowUp':
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

  // No providers configured
  if (!loading && providers.length === 0) {
    return (
      <div className="px-3 py-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors bg-[var(--vscode-sideBar-background)] hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-descriptionForeground)]"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="truncate">{t('agent.configureModel')}</span>
        </button>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="px-3 py-2">
        <div className="h-9 flex items-center px-3 rounded-lg bg-[var(--vscode-sideBar-background)] text-sm text-[var(--vscode-descriptionForeground)]">
          {t('agent.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      {/* Card container */}
      <div className="rounded-lg bg-[var(--vscode-sideBar-background)] overflow-hidden">
        {/* Top: Model selector */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(!open)}
          onKeyDown={handleKeyDown}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-foreground)]"
        >
          <span className="truncate flex-1 text-left font-medium">
            {activeProvider?.name || t('agent.selectModel')}
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-[var(--vscode-descriptionForeground)] transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Divider line */}
        <div className="h-px bg-[var(--vscode-widget-border)] opacity-50" />

        {/* Bottom: Action buttons */}
        <div className="flex items-center gap-1 px-2 py-1.5">
          <button
            onClick={onNewChat}
            className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
            title={t('agent.newChat')}
          >
            <MessageSquarePlus className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('agent.newChat')}</span>
          </button>
          <button
            onClick={onShowList}
            className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
            title={t('agent.sessionList')}
          >
            <List className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('agent.sessionList')}</span>
          </button>
        </div>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute left-3 right-3 top-full mt-1 z-dropdown py-1 rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-lg text-sm max-h-60 overflow-y-auto"
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