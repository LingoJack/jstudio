/**
 * AgentChatPanel — Agent 聊天面板
 * 
 * 与 SectionedEditorPanel 保持一致的架构：
 * - 只负责主内容区域（聊天界面）
 * - 不包含 Sidebar（Sidebar 在 App 层级渲染）
 * 
 * 当有 active session 时显示聊天界面，
 * 无 active session 时显示空状态。
 */

import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { AgentChat } from './AgentChat';
import { Bot } from 'lucide-react';

export default function AgentChatPanel({ hidden }: { hidden?: boolean }) {
  const { t } = useI18n();
  const agentSessions = useStore((s) => s.agentSessions);
  const activeAgentSessionId = useStore((s) => s.activeAgentSessionId);

  const activeSession = agentSessions.find((s) => s.id === activeAgentSessionId);

  if (hidden) {
    return null;
  }

  // 无 active session 时显示空状态
  if (!activeSession) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[var(--vscode-editor-background)]">
        <div className="flex flex-col items-center gap-3">
          <Bot className="w-12 h-12 text-[var(--vscode-descriptionForeground)] opacity-20" />
          <p className="text-sm text-[var(--vscode-descriptionForeground)] opacity-60">
            {t('agent.noActiveSession')}
          </p>
        </div>
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