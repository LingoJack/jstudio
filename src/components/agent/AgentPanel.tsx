/**
 * AgentPanel — Agent 面板主入口
 *
 * 布局结构（参考 WorkBuddy 设计）：
 * - 左侧边栏：功能菜单 + 空间管理 + 任务历史 + 用户信息
 * - 右侧主区域：顶部标题栏 + 消息区 + 输入区 + 状态栏
 *
 * 任务标题：使用用户第一条消息作为标题
 */

import { useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { AgentSidebar } from './AgentSidebar';
import { AgentChat } from './AgentChat';

export default function AgentPanel({ hidden }: { hidden?: boolean }) {
  const agentSessions = useStore((s) => s.agentSessions);
  const activeAgentSessionId = useStore((s) => s.activeAgentSessionId);
  const openAgentSession = useStore((s) => s.openAgentSession);
  const deleteAgentSession = useStore((s) => s.deleteAgentSession);
  const initAgentSessions = useStore((s) => s.initAgentSessions);
  const { t } = useI18n();

  // Init sessions on mount
  useEffect(() => {
    initAgentSessions();
  }, [initAgentSessions]);

  const activeSession = agentSessions.find((s) => s.id === activeAgentSessionId);

  return (
    <div
      className={`w-full h-full flex overflow-hidden ${hidden ? 'hidden' : ''}`}
      style={{ background: 'var(--vscode-editor-background)' }}
    >
      {/* 左侧边栏 */}
      <AgentSidebar
        onSelectSession={openAgentSession}
        activeSessionId={activeAgentSessionId}
        onDeleteSession={deleteAgentSession}
      />

      {/* 右侧主区域 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {activeSession ? (
          <AgentChat session={activeSession} />
        ) : null}
      </div>
    </div>
  );
}
