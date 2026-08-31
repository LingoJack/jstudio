import { useState } from 'react';
import { Bot, AlertTriangle, Braces, Play } from 'lucide-react';
import { useI18n } from '../../../lib/core/i18n';
import type { ToolCallItem } from '../../../types/agent';
import { TOOL_META, parseToolArgs } from '../utils/toolMeta';
import { CodeBlock, FieldRow } from '../utils/codeBlock';

export function ToolCallBubble({
  toolCalls,
  sessionId,
  onApprove,
  onReject,
  pendingPlan,
  onPlanDecision,
}: {
  toolCalls: ToolCallItem[];
  sessionId: string;
  onApprove: (sessionId: string, toolCallId: string, result: string, isError: boolean, approved: boolean) => void;
  onReject: (sessionId: string, toolCallId: string, result: string, isError: boolean) => void;
  pendingPlan?: { plan: string };
  onPlanDecision?: (
    sessionId: string,
    decision: 'approve' | 'reject' | 'approveAndClearContext',
  ) => void;
}) {
  const { t } = useI18n();
  const [showRaw, setShowRaw] = useState<Record<string, boolean>>({});

  // Plan review mode
  if (pendingPlan && toolCalls.some((tc) => tc.name === 'ExitPlanMode')) {
    return (
      <div className="flex justify-start px-2 py-1">
        <div
          className="rounded-xl px-4 py-3 max-w-[80%]"
          style={{
            background: 'var(--vscode-menu-background)',
            border: '1px solid var(--vscode-menu-border)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-4 h-4" style={{ color: 'var(--vscode-terminal-ansiBlue)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--vscode-foreground)' }}>
              {t('agent.planTitle')}
            </span>
          </div>
          <pre
            className="text-xs mb-3 whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-48 rounded-lg p-2"
            style={{
              color: 'var(--vscode-descriptionForeground)',
              background: 'var(--vscode-editor-background)',
              border: '1px solid var(--vscode-widget-border)',
            }}
          >
            {pendingPlan.plan}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => onPlanDecision?.(sessionId, 'approve')}
              className="px-3 py-1.5 rounded-lg text-xs transition-colors hover:opacity-90"
              style={{
                background: 'var(--vscode-button-background)',
                color: 'var(--vscode-button-foreground)',
              }}
            >
              {t('agent.planApprove')}
            </button>
            <button
              onClick={() => onPlanDecision?.(sessionId, 'approveAndClearContext')}
              className="px-3 py-1.5 rounded-lg text-xs transition-colors hover:opacity-90"
              style={{
                background: 'var(--vscode-button-secondaryBackground)',
                color: 'var(--vscode-button-secondaryForeground)',
              }}
            >
              {t('agent.planApproveClear')}
            </button>
            <button
              onClick={() => onPlanDecision?.(sessionId, 'reject')}
              className="px-3 py-1.5 rounded-lg text-xs transition-colors hover:opacity-90"
              style={{
                background: 'var(--vscode-inputValidation-errorBackground)',
                color: 'var(--vscode-errorForeground)',
              }}
            >
              {t('agent.planReject')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start px-2 py-1">
      <div
        className="rounded-xl px-4 py-3 max-w-[80%]"
        style={{
          background: 'var(--vscode-menu-background)',
          border: '1px solid var(--vscode-menu-border)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Bot className="w-4 h-4" style={{ color: 'var(--vscode-terminal-ansiBlue)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--vscode-foreground)' }}>
            {t('agent.toolCall')}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{
              background: 'var(--vscode-badge-background)',
              color: 'var(--vscode-badge-foreground)',
            }}
          >
            {toolCalls.length}
          </span>
        </div>

        {toolCalls.map((tc) => {
          const isDangerous = tc.isDangerous ?? tc.requiresConfirmation;
          const meta = TOOL_META[tc.name] || { icon: Braces, color: 'var(--vscode-descriptionForeground)' };
          const ToolIcon = meta.icon;
          const parsed = parseToolArgs(tc.name, tc.arguments);
          const isRaw = showRaw[tc.id];

          return (
            <div
              key={tc.id}
              className="mb-2 last:mb-0 rounded-lg overflow-hidden"
              style={{
                border: '1px solid var(--vscode-widget-border)',
                background: 'var(--vscode-editor-background)',
              }}
            >
              {/* Tool header - 点击展开/折叠 */}
              <div
                className="flex items-center gap-2 px-2.5 py-1.5"
                style={{ borderBottom: '1px solid var(--vscode-widget-border)' }}
              >
                <ToolIcon className="w-3.5 h-3.5 shrink-0" style={{ color: meta.color }} />
                <span
                  className="font-mono text-xs font-medium"
                  style={{ color: 'var(--vscode-foreground)' }}
                >
                  {tc.name}
                </span>
                {isDangerous && (
                  <span
                    className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 ml-auto"
                    style={{
                      background: 'var(--vscode-inputValidation-warningBackground)',
                      color: 'var(--vscode-inputValidation-warningForeground)',
                    }}
                  >
                    <AlertTriangle className="w-2.5 h-2.5" />
                    {t('agent.toolDangerous')}
                  </span>
                )}
                <button
                  onClick={() => setShowRaw((prev) => ({ ...prev, [tc.id]: !prev[tc.id] }))}
                  className="shrink-0 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
                  style={{
                    color: 'var(--vscode-descriptionForeground)',
                    opacity: 0.7,
                    marginLeft: isDangerous ? undefined : 'auto',
                  }}
                  title={t('agent.toolRawJson')}
                >
                  <Braces className="w-2.5 h-2.5" />
                  {isRaw ? 'Parsed' : 'JSON'}
                </button>
              </div>

              {/* Arguments display */}
              <div className="px-2.5 py-2">
                {isRaw ? (
                  <pre
                    className="text-xs whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-60"
                    style={{ color: 'var(--vscode-descriptionForeground)' }}
                  >
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(tc.arguments), null, 2);
                      } catch {
                        return tc.arguments;
                      }
                    })()}
                  </pre>
                ) : (
                  <>
                    {parsed.primary && (
                      <div className="mb-1.5">
                        {tc.name === 'Shell' ? (
                          <div
                            className="flex items-start gap-1.5 rounded-md p-2"
                            style={{
                              background: 'rgba(0, 0, 0, 0.2)',
                              border: '1px solid var(--vscode-widget-border)',
                            }}
                          >
                            <span
                              className="font-mono text-xs shrink-0 mt-px"
                              style={{ color: 'var(--vscode-terminal-ansiGreen)' }}
                            >
                              $
                            </span>
                            <code
                              className="text-xs font-mono whitespace-pre-wrap break-all"
                              style={{ color: 'var(--vscode-foreground)' }}
                            >
                              {parsed.primary.value}
                            </code>
                          </div>
                        ) : (
                          <FieldRow label={parsed.primary.label} value={parsed.primary.value} />
                        )}
                      </div>
                    )}

                    {parsed.fields && parsed.fields.length > 0 && (
                      <div className="space-y-1 mb-1.5">
                        {parsed.fields.map((f, i) => (
                          <FieldRow key={i} label={f.label} value={f.value} />
                        ))}
                      </div>
                    )}

                    {parsed.codeBlock && (
                      <CodeBlock
                        label={parsed.codeBlock.label}
                        content={parsed.codeBlock.content}
                        maxLines={parsed.codeBlock.maxLines}
                      />
                    )}

                    {parsed.diffBlocks && (
                      <div className="space-y-1.5">
                        {parsed.diffBlocks.map((db, i) => (
                          <CodeBlock
                            key={i}
                            label={db.label}
                            content={db.content}
                            tone={db.tone}
                            maxLines={15}
                          />
                        ))}
                      </div>
                    )}

                    {!parsed.primary && !parsed.fields?.length && !parsed.codeBlock && !parsed.diffBlocks && (
                      <pre
                        className="text-xs whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-40"
                        style={{ color: 'var(--vscode-descriptionForeground)' }}
                      >
                        {tc.arguments}
                      </pre>
                    )}
                  </>
                )}
              </div>

              {/* Approve / Reject buttons */}
              <div
                className="flex gap-2 px-2.5 py-2"
                style={{ borderTop: '1px solid var(--vscode-widget-border)' }}
              >
                <button
                  onClick={() =>
                    onApprove(sessionId, tc.id, JSON.stringify({ approved: true }), false, true)
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:brightness-110"
                  style={{
                    background: 'var(--vscode-button-background)',
                    color: 'var(--vscode-button-foreground)',
                  }}
                >
                  <Play className="w-3 h-3" />
                  {t('agent.approveTool')}
                </button>
                <button
                  onClick={() =>
                    onReject(
                      sessionId,
                      tc.id,
                      JSON.stringify({ approved: false, reason: 'user_rejected' }),
                      true,
                    )
                  }
                  className="px-3 py-1.5 rounded-lg text-xs transition-colors hover:opacity-90"
                  style={{
                    background: 'var(--vscode-button-secondaryBackground)',
                    color: 'var(--vscode-button-secondaryForeground)',
                  }}
                >
                  {t('agent.rejectTool')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
