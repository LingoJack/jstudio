/**
 * ModelSelector - 紧凑型模型切换器
 *
 * 放在输入框底部状态栏，点击展开上拉式下拉面板选择模型。
 * 设计原则：
 * - 透明背景，融入输入框浮空玻璃风格
 * - 触发器仅显示模型名 + 小箭头，hover 用半透明背景
 * - 下拉面板向上弹出（bottom-full），避免被屏幕底部截断
 *
 * 核心逻辑与面板 UI 复用 `useModelDropdown` hook 和
 * `ModelDropdownPanel` 组件（见 ModelDropdownPanel.tsx）。
 */

import { useState, useEffect } from 'react';
import { ChevronUp } from 'lucide-react';
import { ipc } from '../../lib/core/ipc';
import type { ModelProvider } from '../../types/storage';
import { useI18n } from '../../lib/core/i18n';
import {
  useModelDropdown,
  ModelDropdownPanel,
  AGENT_CONFIG_CHANGED_EVENT,
} from './ModelDropdownPanel';

// ────────────────────────────────────────────────────────
// Shared hook - 当前激活的模型 provider
//
// 通过自定义事件与 ModelSelector 的切换保持同步：
// selectProvider 保存成功后 dispatch AGENT_CONFIG_CHANGED_EVENT，
// 所有使用此 hook 的组件（如 TopBar 的模型名显示）会自动刷新。
// ────────────────────────────────────────────────────────

export function useActiveProvider(): ModelProvider | null {
  const [activeProvider, setActiveProvider] = useState<ModelProvider | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await ipc.loadAgentConfig();
        const providers = Array.isArray(raw.providers)
          ? (raw.providers as ModelProvider[])
          : [];
        const activeIndex = typeof raw.active_index === 'number' ? raw.active_index : 0;
        setActiveProvider(providers[activeIndex] ?? null);
      } catch (e) {
        console.error('Failed to load agent config:', e);
      }
    };
    load();
    window.addEventListener(AGENT_CONFIG_CHANGED_EVENT, load);
    return () => window.removeEventListener(AGENT_CONFIG_CHANGED_EVENT, load);
  }, []);

  return activeProvider;
}

// ────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────

export function ModelSelector() {
  const { t } = useI18n();
  const {
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
  } = useModelDropdown('up');

  // Loading / no providers - render nothing visible
  if (loading || providers.length === 0) return null;

  return (
    <div className="relative">
      {/* Trigger - 透明背景，融入输入框玻璃风格 */}
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

      {/* Dropdown panel - 向上弹出 */}
      {open && (
        <ModelDropdownPanel
          providers={providers}
          activeIndex={activeIndex}
          selectedIndex={selectedIndex}
          onSelect={selectProvider}
          onHover={setSelectedIndex}
          panelRef={panelRef}
          className="absolute bottom-full left-0 mb-1 z-dropdown py-1 rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-lg text-sm max-h-60 overflow-y-auto min-w-[220px]"
        />
      )}
    </div>
  );
}
