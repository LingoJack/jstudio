/**
 * ContextSwitchCard - 上下文切换卡片
 *
 * 整合模型选择器 + 操作按钮，放在侧边栏顶部。
 * 设计原则：
 * - 去硬边框，用背景色区分（hover 时略深）
 * - 箭头靠右对齐，弱化视觉
 * - 卡片紧凑，下部分合并成一行操作按钮
 *
 * 模型选择逻辑与面板 UI 复用 `useModelDropdown` hook 和
 * `ModelDropdownPanel` 组件（见 ModelDropdownPanel.tsx）。
 */

import { ChevronDown, Plus, MessageSquarePlus, List } from 'lucide-react';
import { useI18n } from '../../lib/core/i18n';
import { useModelDropdown, ModelDropdownPanel } from './ModelDropdownPanel';

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
  } = useModelDropdown('down');

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
        <ModelDropdownPanel
          providers={providers}
          activeIndex={activeIndex}
          selectedIndex={selectedIndex}
          onSelect={selectProvider}
          onHover={setSelectedIndex}
          panelRef={panelRef}
          className="absolute left-3 right-3 top-full mt-1 z-dropdown py-1 rounded-lg border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] shadow-lg text-sm max-h-60 overflow-y-auto"
        />
      )}
    </div>
  );
}
