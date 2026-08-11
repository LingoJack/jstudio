/**
 * AgentChatPanel — Agent 聊天面板
 *
 * 与 DocumentPanel 保持一致的架构：
 * - 只负责主内容区域（聊天界面）
 * - 不包含 Sidebar（Sidebar 在 App 层级渲染）
 *
 * 当有 active session 时显示聊天界面，
 * 无 active session 时显示空状态。
 *
 * 空状态保持克制：欢迎语 + 工作目录 badge / 选择工作目录 CTA。
 * 不再显示通用建议卡——JStudio 是笔记应用，通用 chat 模板抄来的
 * "分析代码/写函数" 建议对场景没意义。Workspace 选择走 store 共享状态
 * `showAgentWorkspaceModal`，Modal 仍在 AgentSidebar 单点渲染。
 */

import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { AgentChat } from './AgentChat';
import { Bot, FolderOpen, Plus } from 'lucide-react';

export default function AgentChatPanel({ hidden }: { hidden?: boolean }) {
  const { t } = useI18n();
  const agentSessions = useStore((s) => s.agentSessions);
  const activeAgentSessionId = useStore((s) => s.activeAgentSessionId);
  const activeAgentWorkspace = useStore((s) => s.activeAgentWorkspace);
  const setShowAgentWorkspaceModal = useStore((s) => s.setShowAgentWorkspaceModal);

  const activeSession = agentSessions.find((s) => s.id === activeAgentSessionId);

  if (hidden) {
    return null;
  }

  // 无 active session 时显示空状态
  if (!activeSession) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--vscode-editor-background)] px-8">
        {/* Bot 图标带柔和背景圆角方块 */}
        <div
          className="flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
          style={{
            background: 'var(--vscode-editor-inactiveSelectionBackground)',
          }}
        >
          <Bot
            className="w-8 h-8"
            style={{ color: 'var(--vscode-descriptionForeground)' }}
          />
        </div>

        {/* 欢迎标题 + 副标题 */}
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--vscode-foreground)' }}>
          {t('agent.welcomeTitle')}
        </h2>
        <p
          className="text-sm text-center max-w-md mb-8"
          style={{ color: 'var(--vscode-descriptionForeground)' }}
        >
          {t('agent.welcomeSubtitle')}
        </p>

        {/* 工作目录 badge / 选择工作目录 CTA */}
        {activeAgentWorkspace ? (
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
            style={{
              background: 'var(--vscode-editor-inactiveSelectionBackground)',
              color: 'var(--vscode-descriptionForeground)',
            }}
          >
            <FolderOpen className="w-3 h-3" />
            <span className="max-w-[200px] truncate">{activeAgentWorkspace.split('/').pop()}</span>
          </div>
        ) : (
          <button
            onClick={() => setShowAgentWorkspaceModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
            style={{
              background: 'var(--vscode-editor-inactiveSelectionBackground)',
              color: 'var(--vscode-descriptionForeground)',
            }}
          >
            <Plus className="w-3 h-3" />
            {t('agent.selectWorkspace')}
          </button>
        )}
      </div>
    );
  }

  // 有 active session 时显示聊天界面
  return (
    <div
      className="w-full h-full flex overflow-hidden"
      style={{ background: 'var(--vscode-editor-background)' }}
    >
      <div className="flex-1 min-w-0 flex flex-col">
        <AgentChat session={activeSession} />
      </div>
    </div>
  );
}
