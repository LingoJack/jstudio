import { Bot, ChevronRight } from 'lucide-react';
import { useI18n } from '../../../lib/core/i18n';
import MarkdownMessage from '../MarkdownMessage';

export function AssistantMessageBubble({
  content,
  reasoningContent,
  isStreaming,
}: {
  content: string;
  reasoningContent?: string;
  isStreaming?: boolean;
}) {
  const { t } = useI18n();

  // 空内容且不在 streaming 中时不渲染
  if (!content.trim() && !reasoningContent && !isStreaming) return null;

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
        className="rounded-2xl rounded-bl-md px-4 py-2.5 text-sm max-w-[80%] overflow-x-auto"
        style={{
          background: 'var(--vscode-editor-background)',
          color: 'var(--vscode-editor-foreground)',
          border: '1px solid var(--vscode-widget-border)',
        }}
      >
        {/* 推理内容（可折叠） */}
        {reasoningContent && (
          <details className="mb-2">
            <summary
              className="text-xs cursor-pointer select-none flex items-center gap-1.5"
              style={{ color: 'var(--vscode-descriptionForeground)' }}
            >
              <ChevronRight className="w-3 h-3" />
              {t('agent.thinking')}
            </summary>
            <div
              className="mt-1.5 text-xs whitespace-pre-wrap opacity-70 pl-3 rounded-md py-1.5"
              style={{
                color: 'var(--vscode-descriptionForeground)',
                borderLeft: '2px solid var(--vscode-terminal-ansiBlue)',
                background: 'var(--vscode-editor-inactiveSelectionBackground)',
              }}
            >
              {reasoningContent}
            </div>
          </details>
        )}

        {/* 主要内容 */}
        {content.trim() ? (
          <MarkdownMessage>{content}</MarkdownMessage>
        ) : isStreaming ? (
          <span className="animate-pulse" style={{ color: 'var(--vscode-descriptionForeground)' }}>
            ▋
          </span>
        ) : null}
      </div>
    </div>
  );
}
