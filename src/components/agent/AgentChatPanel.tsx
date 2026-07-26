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

import { useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n, type TranslationKey } from '../../lib/core/i18n';
import { AgentChat } from './AgentChat';
import { useActiveProvider } from './ModelSelector';
import { groupSessionsByWorkspace } from './WorkspaceList';
import { Bot, Code2, FunctionSquare, BookOpen, Bug, ArrowUpRight, FolderOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SuggestionCard {
  icon: LucideIcon;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  prompt: string;
}

const SUGGESTIONS: SuggestionCard[] = [
  {
    icon: Code2,
    titleKey: 'agent.suggestionAnalyzeCode',
    descKey: 'agent.suggestionAnalyzeCodeDesc',
    prompt: '帮我分析一下这段代码的逻辑和结构',
  },
  {
    icon: FunctionSquare,
    titleKey: 'agent.suggestionWriteFunction',
    descKey: 'agent.suggestionWriteFunctionDesc',
    prompt: '帮我写一个函数来实现以下功能：',
  },
  {
    icon: BookOpen,
    titleKey: 'agent.suggestionExplainConcept',
    descKey: 'agent.suggestionExplainConceptDesc',
    prompt: '帮我解释一下这个技术概念：',
  },
  {
    icon: Bug,
    titleKey: 'agent.suggestionDebugIssue',
    descKey: 'agent.suggestionDebugIssueDesc',
    prompt: '帮我排查这个报错的原因：',
  },
];

export default function AgentChatPanel({ hidden }: { hidden?: boolean }) {
  const { t } = useI18n();
  const agentSessions = useStore((s) => s.agentSessions);
  const activeAgentSessionId = useStore((s) => s.activeAgentSessionId);
  const activeAgentWorkspace = useStore((s) => s.activeAgentWorkspace);
  const createAgentSession = useStore((s) => s.createAgentSession);
  const sendAgentMessage = useStore((s) => s.sendAgentMessage);
  const activeProvider = useActiveProvider();

  const activeSession = agentSessions.find((s) => s.id === activeAgentSessionId);

  const handleSuggestionClick = useCallback(
    async (prompt: string) => {
      const ws = activeAgentWorkspace ?? groupSessionsByWorkspace(agentSessions)[0]?.workspace ?? '';
      const id = await createAgentSession(ws);
      await sendAgentMessage(id, prompt);
    },
    [agentSessions, activeAgentWorkspace, createAgentSession, sendAgentMessage],
  );

  if (hidden) {
    return null;
  }

  // 无 active session 时显示空状态
  if (!activeSession) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--vscode-editor-background)] px-8">
        {/* 大尺寸 Bot 图标带柔和背景圆圈 */}
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
          className="text-sm text-center max-w-md mb-3"
          style={{ color: 'var(--vscode-descriptionForeground)' }}
        >
          {t('agent.welcomeSubtitle')}
        </p>

        {/* 当前工作目录 badge */}
        {activeAgentWorkspace && (
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs mb-8"
            style={{
              background: 'var(--vscode-editor-inactiveSelectionBackground)',
              color: 'var(--vscode-descriptionForeground)',
            }}
          >
            <FolderOpen className="w-3 h-3" />
            <span className="max-w-[200px] truncate">{activeAgentWorkspace.split('/').pop()}</span>
          </div>
        )}
        {!activeAgentWorkspace && <div className="mb-8" />}

        {/* 快捷操作建议卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
          {SUGGESTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.titleKey}
                onClick={() => handleSuggestionClick(s.prompt)}
                className="group flex items-start gap-3 p-3.5 rounded-xl text-left transition-all hover:scale-[1.02]"
                style={{
                  background: 'var(--vscode-editor-inactiveSelectionBackground)',
                  border: '1px solid transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                }}
              >
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                  style={{ background: 'var(--vscode-editor-background)' }}
                >
                  <Icon
                    className="w-4 h-4"
                    style={{ color: 'var(--vscode-descriptionForeground)' }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>
                      {t(s.titleKey)}
                    </span>
                    <ArrowUpRight
                      className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      style={{ color: 'var(--vscode-descriptionForeground)' }}
                    />
                  </div>
                  <p
                    className="text-xs mt-0.5 truncate"
                    style={{ color: 'var(--vscode-descriptionForeground)' }}
                  >
                    {t(s.descKey)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* 底部模型信息 */}
        {activeProvider && (
          <p
            className="text-xs mt-8 opacity-50"
            style={{ color: 'var(--vscode-descriptionForeground)' }}
          >
            {t('agent.modelPoweredBy', { model: activeProvider.name })}
          </p>
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
