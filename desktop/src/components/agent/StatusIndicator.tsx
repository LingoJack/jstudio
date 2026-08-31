import { Loader2, AlertCircle } from 'lucide-react';
import { useI18n } from '../../lib/core/i18n';
import type { AgentSession } from '../../types/agent';

export function StatusIndicator({ session }: { session: AgentSession }) {
  const { t } = useI18n();
  const { runState, retryInfo } = session;

  if (runState === 'compacting') {
    return (
      <div className="flex justify-center px-2 py-1">
        <div
          className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full"
          style={{
            background: 'var(--vscode-editor-inactiveSelectionBackground)',
            border: '1px solid var(--vscode-widget-border)',
            color: 'var(--vscode-descriptionForeground)',
          }}
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('agent.compacting')}</span>
        </div>
      </div>
    );
  }

  if (runState === 'retrying' && retryInfo) {
    return (
      <div className="flex justify-center px-2 py-1">
        <div
          className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full"
          style={{
            background: 'var(--vscode-editor-inactiveSelectionBackground)',
            border: '1px solid var(--vscode-widget-border)',
            color: 'var(--vscode-descriptionForeground)',
          }}
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('agent.retrying')} ({retryInfo.attempt}/{retryInfo.maxAttempts})</span>
        </div>
      </div>
    );
  }

  if (runState === 'error') {
    return (
      <div className="flex justify-center px-2 py-1">
        <div
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
          style={{
            background: 'var(--vscode-inputValidation-errorBackground)',
            border: '1px solid var(--vscode-inputValidation-errorBorder)',
            color: 'var(--vscode-errorForeground)',
          }}
        >
          <AlertCircle className="w-3 h-3" />
          <span>{t('agent.error')}</span>
        </div>
      </div>
    );
  }

  return null;
}
