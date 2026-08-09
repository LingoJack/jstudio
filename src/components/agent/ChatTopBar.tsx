import { ArrowLeft, FolderOpen } from 'lucide-react';
import { useI18n } from '../../lib/core/i18n';
import { useActiveProvider } from './ModelSelector';
import type { AgentSession, AgentRunState } from '../../types/agent';
import { getSessionTitle } from './utils/messageHelpers';

function RunStateBadge({ state }: { state: AgentRunState }) {
  const { t } = useI18n();

  if (state === 'idle') return null;

  const labels: Record<string, string> = {
    thinking: t('agent.thinking'),
    streaming: t('agent.streaming'),
    tool_call: t('agent.toolCall'),
    plan_review: t('agent.planReview'),
    compacting: t('agent.compacting'),
    retrying: t('agent.retrying'),
    error: t('agent.error'),
    cancelled: t('agent.cancelled'),
  };

  const isError = state === 'error';
  const isActive =
    state === 'thinking' || state === 'streaming' || state === 'tool_call' || state === 'plan_review';

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full`}
      style={{
        color: isError ? 'var(--vscode-errorForeground)' : 'var(--vscode-descriptionForeground)',
        background: 'var(--vscode-editor-inactiveSelectionBackground)',
      }}
    >
      {isActive && (
        <span className="relative flex w-2 h-2">
          <span
            className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping"
            style={{ background: 'var(--vscode-terminal-ansiBlue)' }}
          />
          <span
            className="relative inline-flex w-2 h-2 rounded-full"
            style={{ background: 'var(--vscode-terminal-ansiBlue)' }}
          />
        </span>
      )}
      {labels[state] ?? state}
    </span>
  );
}

interface TopBarProps {
  session: AgentSession;
  onBack?: () => void;
}

export function ChatTopBar({ session, onBack }: TopBarProps) {
  const { t } = useI18n();
  const activeProvider = useActiveProvider();

  const title = getSessionTitle(session);
  const wsName = session.workspace ? session.workspace.split('/').pop() : null;

  return (
    <div
      className="shrink-0 flex items-center justify-between px-3 py-1.5"
      style={{
        background: 'var(--vscode-editorGroupHeader-tabsBackground)',
        borderBottom: '1px solid var(--vscode-widget-border)',
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {onBack && (
          <button
            onClick={onBack}
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
            title={t('agent.back')}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: 'var(--vscode-foreground)' }} />
          </button>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-sm font-medium truncate max-w-[260px]"
            style={{ color: 'var(--vscode-foreground)' }}
          >
            {title}
          </span>
          {session.runState !== 'idle' && <RunStateBadge state={session.runState} />}
          {/* 工作目录 badge */}
          {wsName && (
            <span
              className="hidden sm:inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full shrink-0"
              style={{
                background: 'var(--vscode-editor-inactiveSelectionBackground)',
                color: 'var(--vscode-descriptionForeground)',
              }}
              title={session.workspace}
            >
              <FolderOpen className="w-2.5 h-2.5" />
              <span className="max-w-[120px] truncate">{wsName}</span>
            </span>
          )}
        </div>
      </div>

      {/* 右侧信息区 - 仿 remote header：模型名 · autoApprove 指示 · 消息数 */}
      <div
        className="shrink-0 flex items-center gap-2 text-xs"
        style={{ color: 'var(--vscode-descriptionForeground)' }}
      >
        {activeProvider && (
          <span className="truncate max-w-[140px]" title={activeProvider.model}>
            {activeProvider.name}
          </span>
        )}
        {session.autoApprove && (
          <span
            className="font-mono font-semibold"
            style={{ color: 'var(--vscode-inputValidation-warningForeground, #cca700)' }}
            title={t('agent.autoApproveOn')}
          >
            &gt;&gt;
          </span>
        )}
        <span>{t('agent.msgCount', { count: session.messages.length })}</span>
      </div>
    </div>
  );
}
