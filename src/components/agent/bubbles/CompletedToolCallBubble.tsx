import { useState } from 'react';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useI18n } from '../../../lib/core/i18n';
import type { ToolCallItem } from '../../../types/agent';

export function CompletedToolCallBubble({ toolCall }: { toolCall: ToolCallItem }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex justify-start px-2 py-1">
      <div
        className="rounded-xl px-4 py-2.5 max-w-[80%] overflow-hidden"
        style={{
          background: 'var(--vscode-menu-background)',
          border: '1px solid var(--vscode-menu-border)',
        }}
      >
        {/* Header - 点击展开/折叠参数 */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 text-xs text-left transition-colors hover:opacity-80"
          style={{ color: 'var(--vscode-foreground)' }}
        >
          <CheckCircle2
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: 'var(--vscode-terminal-ansiGreen)' }}
          />
          <span
            className="font-mono font-medium truncate"
            style={{ color: 'var(--vscode-textPreformat-foreground)' }}
          >
            {toolCall.name}
          </span>
          <span
            className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full"
            style={{
              background: 'var(--vscode-badge-background)',
              color: 'var(--vscode-badge-foreground)',
            }}
          >
            {t('agent.toolCompleted')}
          </span>
          <ChevronRight
            className={`w-3 h-3 shrink-0 ml-auto transition-transform ${expanded ? 'rotate-90' : ''}`}
            style={{ color: 'var(--vscode-descriptionForeground)' }}
          />
        </button>

        {/* Arguments - 展开时显示 */}
        {expanded && toolCall.arguments && (
          <pre
            className="text-xs mt-2 whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-40 rounded-lg p-2"
            style={{
              color: 'var(--vscode-descriptionForeground)',
              background: 'var(--vscode-editor-background)',
              border: '1px solid var(--vscode-widget-border)',
            }}
          >
            {toolCall.arguments}
          </pre>
        )}
      </div>
    </div>
  );
}
