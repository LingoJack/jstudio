import { useState } from 'react';
import { CheckCircle2, AlertCircle, Ban, Loader2, ChevronDown } from 'lucide-react';
import { useI18n } from '../../../lib/core/i18n';
import type { ChatMessage } from '../../../types/agent';

export function ToolResultBubble({ message, toolName }: { message: ChatMessage; toolName?: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const isError = message.toolResult?.isError ?? false;
  const status = message.toolResult?.status ?? 'executed';
  const displayName = message.toolResult?.toolName ?? toolName;

  const statusConfig = {
    executed: { label: t('agent.toolExecuted'), icon: CheckCircle2, color: 'var(--vscode-terminal-ansiGreen)' },
    failed: { label: t('agent.toolFailed'), icon: AlertCircle, color: 'var(--vscode-errorForeground)' },
    rejected: { label: t('agent.toolRejected'), icon: Ban, color: 'var(--vscode-descriptionForeground)' },
    auto_approved: { label: t('agent.toolAutoApproved'), icon: CheckCircle2, color: 'var(--vscode-terminal-ansiGreen)' },
  }[status] || { label: status, icon: Loader2, color: 'var(--vscode-descriptionForeground)' };

  const StatusIcon = statusConfig.icon;

  // 内容为空且无图片时不渲染
  if (!message.content.trim() && (!message.images || message.images.length === 0)) return null;

  // 折叠时的一行预览（仿 remote 的 preview）
  const preview = (() => {
    const text = message.content.replace(/\n/g, ' ').trim();
    return text.length > 80 ? text.slice(0, 80) + '…' : text;
  })();

  return (
    <div className="flex justify-start px-2 py-1">
      <div
        className="rounded-xl px-4 py-3 max-w-[80%] overflow-hidden"
        style={{
          background: 'var(--vscode-editor-background)',
          border: `1px solid ${
            isError
              ? 'var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground))'
              : 'var(--vscode-widget-border)'
          }`,
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <StatusIcon className="w-3.5 h-3.5 shrink-0" style={{ color: statusConfig.color }} />
          {displayName && (
            <span
              className="text-xs font-mono font-medium truncate max-w-[180px]"
              style={{ color: 'var(--vscode-textPreformat-foreground)' }}
              title={displayName}
            >
              {displayName}
            </span>
          )}
          <span
            className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full"
            style={{
              background: isError
                ? 'var(--vscode-inputValidation-errorBackground)'
                : 'var(--vscode-badge-background)',
              color: isError
                ? 'var(--vscode-errorForeground)'
                : 'var(--vscode-badge-foreground)',
            }}
          >
            {statusConfig.label}
          </span>
          {message.content.trim() && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-auto shrink-0 flex items-center gap-1 text-[10px] hover:opacity-80"
              style={{ color: 'var(--vscode-descriptionForeground)' }}
            >
              {expanded ? t('agent.collapse') : t('agent.expand')}
              <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        {/* 折叠时的一行预览 */}
        {!expanded && message.content.trim() && (
          <div
            className="text-[11px] font-mono truncate"
            style={{ color: 'var(--vscode-descriptionForeground)' }}
            title={message.content.slice(0, 500)}
          >
            {preview}
          </div>
        )}

        {/* Content - 默认折叠，点击展开 */}
        {expanded && message.content.trim() && (
          <pre
            className="whitespace-pre-wrap break-words font-mono text-xs overflow-x-auto max-h-48 rounded-lg p-2 mt-1 mb-1"
            style={{
              color: isError ? 'var(--vscode-errorForeground)' : 'var(--vscode-descriptionForeground)',
              background: 'var(--vscode-menu-background)',
              border: '1px solid var(--vscode-widget-border)',
            }}
          >
            {message.content}
          </pre>
        )}

        {/* Images */}
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {message.images.map((img, i) => (
              <img
                key={i}
                src={`data:${img.mediaType};base64,${img.base64}`}
                alt="Tool result"
                className="max-w-32 max-h-32 rounded-lg object-cover"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
