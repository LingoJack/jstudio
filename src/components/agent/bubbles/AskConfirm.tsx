import { useState } from 'react';
import { Bot } from 'lucide-react';
import { useI18n } from '../../../lib/core/i18n';
import type { AgentAskRequest } from '../../../types/agent';

export function AskConfirm({
  askRequest,
  sessionId,
  onSubmit,
}: {
  askRequest: AgentAskRequest;
  sessionId: string;
  onSubmit: (sessionId: string, answer: Record<string, string>) => void;
}) {
  const { t } = useI18n();
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const handleOptionSelect = (questionIdx: number, optionLabel: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionIdx.toString()]: optionLabel,
    }));
  };

  const handleSubmit = () => {
    onSubmit(sessionId, answers);
  };

  const allAnswered = askRequest.questions.every((_, idx) => answers[idx.toString()]);

  return (
    <div className="flex justify-start px-2 py-1">
      <div
        className="rounded-xl px-4 py-3 max-w-[80%]"
        style={{
          background: 'var(--vscode-menu-background)',
          border: '1px solid var(--vscode-menu-border)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4" style={{ color: 'var(--vscode-terminal-ansiBlue)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--vscode-foreground)' }}>
            {t('agent.askTitle')}
          </span>
        </div>
        {askRequest.questions.map((q, idx) => (
          <div key={idx} className="mb-4 last:mb-0">
            <div className="text-xs mb-2" style={{ color: 'var(--vscode-foreground)' }}>
              {q.question}
            </div>
            <div className="flex flex-wrap gap-2">
              {q.options.map((opt, optIdx) => (
                <button
                  key={optIdx}
                  onClick={() => handleOptionSelect(idx, opt.label)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    answers[idx.toString()] === opt.label ? 'ring-1 ring-[var(--vscode-focusBorder)]' : ''
                  }`}
                  style={{
                    background:
                      answers[idx.toString()] === opt.label
                        ? 'var(--vscode-button-background)'
                        : 'var(--vscode-button-secondaryBackground)',
                    color:
                      answers[idx.toString()] === opt.label
                        ? 'var(--vscode-button-foreground)'
                        : 'var(--vscode-button-secondaryForeground)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button
          onClick={handleSubmit}
          disabled={!allAnswered}
          className="mt-2 px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-40 hover:opacity-90"
          style={{
            background: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
          }}
        >
          {t('agent.askSubmit')}
        </button>
      </div>
    </div>
  );
}
