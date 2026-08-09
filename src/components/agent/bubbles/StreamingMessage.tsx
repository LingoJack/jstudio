import { Bot } from 'lucide-react';
import { useI18n } from '../../../lib/core/i18n';
import type { AgentRunState } from '../../../types/agent';
import { AssistantMessageBubble } from './AssistantMessageBubble';

export function StreamingMessage({
  content,
  reasoningContent,
  runState,
}: {
  content: string;
  reasoningContent?: string;
  runState: AgentRunState;
}) {
  const { t } = useI18n();

  // 如果正在 streaming 且有内容，显示为 assistant 气泡
  if (runState === 'streaming' && content.trim()) {
    return <AssistantMessageBubble content={content} reasoningContent={reasoningContent} isStreaming />;
  }

  // 如果正在 thinking（还没有内容），显示 thinking 指示器
  if (runState === 'thinking') {
    return (
      <div className="flex justify-start px-2 py-1 items-start gap-2.5">
        {/* Bot 头像 */}
        <div
          className="flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5"
          style={{ background: 'var(--vscode-editor-inactiveSelectionBackground)' }}
        >
          <Bot className="w-4 h-4" style={{ color: 'var(--vscode-terminal-ansiBlue)' }} />
        </div>
        <div
          className="rounded-2xl rounded-bl-md px-4 py-3 text-sm"
          style={{
            background: 'var(--vscode-editor-background)',
            border: '1px solid var(--vscode-widget-border)',
            color: 'var(--vscode-descriptionForeground)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="flex gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{ background: 'var(--vscode-descriptionForeground)', animationDelay: '0ms', animationDuration: '0.6s' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{ background: 'var(--vscode-descriptionForeground)', animationDelay: '150ms', animationDuration: '0.6s' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{ background: 'var(--vscode-descriptionForeground)', animationDelay: '300ms', animationDuration: '0.6s' }}
              />
            </span>
            <span className="text-xs ml-1">{t('agent.thinking')}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
