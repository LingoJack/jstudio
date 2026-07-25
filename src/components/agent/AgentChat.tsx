/**
 * AgentChat — 右侧聊天区域组件
 *
 * 核心设计原则（参考 remote 模块的交互模式）：
 * 1. 用户消息发送后立即显示气泡，无需等待后端确认
 * 2. 工具调用有独立的气泡展示（可展开/折叠参数）
 * 3. 工具结果以独立气泡展示（成功/失败状态清晰）
 * 4. 支持文件选择（图片上传）
 * 5. 消息永不覆盖——使用唯一 id 追踪每条消息
 * 6. streaming 内容实时显示，flush 到消息列表后保留完整内容
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { storage } from '../../lib/core/storage';
import {
  ArrowLeft,
  Send,
  Square,
  ChevronRight,
  Paperclip,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Ban,
  Bot,
  ChevronDown,
  ArrowDown,
} from 'lucide-react';
import MarkdownMessage from './MarkdownMessage';
import { ModelSelector, useActiveProvider } from './ModelSelector';
import type { AgentSession, ChatMessage, ToolCallItem, AgentRunState, AgentAskRequest } from '../../types/agent';
import { handleNativeSelectAll } from '../../lib/shortcuts/nativeSelectAll';

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────

let _msgIdCounter = 0;
function nextMsgId(): string {
  return `msg-${Date.now()}-${++_msgIdCounter}`;
}

function getSessionTitle(session: AgentSession): string {
  const firstUserMessage = session.messages.find((m) => m.role === 'user');
  if (firstUserMessage?.content) {
    const content = firstUserMessage.content.trim();
    return content.length > 50 ? content.slice(0, 50) + '...' : content;
  }
  return session.title || 'New Task';
}

// ────────────────────────────────────────────────
// Top Bar
// ────────────────────────────────────────────────

interface TopBarProps {
  session: AgentSession;
  onBack?: () => void;
}

function TopBar({ session, onBack }: TopBarProps) {
  const { t } = useI18n();
  const activeProvider = useActiveProvider();

  const title = getSessionTitle(session);

  return (
    <div
      className="shrink-0 flex items-center justify-between px-4 py-2"
      style={{
        background: 'var(--vscode-editorGroupHeader-tabsBackground)',
        borderBottom: '1px solid var(--vscode-widget-border)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
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
            className="text-sm font-medium truncate max-w-[300px]"
            style={{ color: 'var(--vscode-foreground)' }}
          >
            {title}
          </span>
          {session.runState !== 'idle' && <RunStateBadge state={session.runState} />}
        </div>
      </div>

      {/* 右侧信息区 — 仿 remote header：模型名 · autoApprove 指示 · 消息数 */}
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

// ────────────────────────────────────────────────
// Run State Badge
// ────────────────────────────────────────────────

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
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${
        isActive ? 'animate-pulse' : ''
      }`}
      style={{
        color: isError ? 'var(--vscode-errorForeground)' : 'var(--vscode-descriptionForeground)',
      }}
    >
      {isActive && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--vscode-terminal-ansiBlue)' }}
        />
      )}
      {labels[state] ?? state}
    </span>
  );
}

// ────────────────────────────────────────────────
// User Message Bubble
// ────────────────────────────────────────────────

function UserMessageBubble({ content, images }: { content: string; images?: { base64: string; mediaType: string }[] }) {
  return (
    <div className="flex justify-end px-2 py-1">
      <div
        className="rounded-2xl px-4 py-2.5 text-sm max-w-[75%] overflow-x-auto"
        style={{
          background: 'var(--vscode-button-background)',
          color: 'var(--vscode-button-foreground)',
        }}
      >
        {/* 图片预览 */}
        {images && images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {images.map((img, i) => (
              <img
                key={i}
                src={`data:${img.mediaType};base64,${img.base64}`}
                alt=""
                className="max-w-[200px] max-h-[200px] rounded-lg object-cover"
              />
            ))}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{content}</div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Assistant Message Bubble
// ────────────────────────────────────────────────

function AssistantMessageBubble({
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
    <div className="flex justify-start px-2 py-1">
      <div
        className="rounded-2xl px-4 py-2.5 text-sm max-w-[80%] overflow-x-auto"
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
              className="text-xs cursor-pointer select-none"
              style={{ color: 'var(--vscode-descriptionForeground)' }}
            >
              {t('agent.thinking')}
            </summary>
            <div
              className="mt-1 text-xs whitespace-pre-wrap opacity-70 pl-3 border-l-2"
              style={{
                color: 'var(--vscode-descriptionForeground)',
                borderColor: 'var(--vscode-terminal-ansiBlue)',
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

// ────────────────────────────────────────────────
// Tool Call Bubble (独立气泡，参考 remote 的 ToolCallMsg)
// ────────────────────────────────────────────────

function ToolCallBubble({
  toolCalls,
  sessionId,
  onApprove,
  onReject,
  pendingPlan,
  onPlanDecision,
}: {
  toolCalls: ToolCallItem[];
  sessionId: string;
  onApprove: (sessionId: string, toolCallId: string, result: string, isError: boolean) => void;
  onReject: (sessionId: string, toolCallId: string, result: string, isError: boolean) => void;
  pendingPlan?: { plan: string };
  onPlanDecision?: (
    sessionId: string,
    decision: 'approve' | 'reject' | 'approveAndClearContext',
  ) => void;
}) {
  const { t } = useI18n();
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

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
          const isExpanded = expandedTool === tc.id;

          return (
            <div key={tc.id} className="mb-2 last:mb-0">
              {/* Tool header — 点击展开/折叠 */}
              <button
                onClick={() => setExpandedTool(isExpanded ? null : tc.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
                style={{ color: 'var(--vscode-foreground)' }}
              >
                <ChevronRight
                  className={`w-3 h-3 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  style={{ color: 'var(--vscode-descriptionForeground)' }}
                />
                <span
                  className="font-mono font-medium"
                  style={{ color: 'var(--vscode-textPreformat-foreground)' }}
                >
                  {tc.name}
                </span>
                {isDangerous && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded ml-auto"
                    style={{
                      background: 'var(--vscode-inputValidation-warningBackground)',
                      color: 'var(--vscode-inputValidation-warningForeground)',
                    }}
                  >
                    {t('agent.toolDangerous')}
                  </span>
                )}
              </button>

              {/* Arguments — 展开时显示 */}
              {isExpanded && (
                <pre
                  className="text-xs mt-1 ml-7 whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-40 rounded-lg p-2"
                  style={{
                    color: 'var(--vscode-descriptionForeground)',
                    background: 'var(--vscode-editor-background)',
                    border: '1px solid var(--vscode-widget-border)',
                  }}
                >
                  {tc.arguments}
                </pre>
              )}

              {/* 批准/拒绝按钮 */}
              <div className="flex gap-2 mt-2 ml-7">
                <button
                  onClick={() =>
                    onApprove(sessionId, tc.id, JSON.stringify({ approved: true }), false)
                  }
                  className="px-3 py-1 rounded-lg text-xs transition-colors hover:opacity-90"
                  style={{
                    background: 'var(--vscode-button-background)',
                    color: 'var(--vscode-button-foreground)',
                  }}
                >
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
                  className="px-3 py-1 rounded-lg text-xs transition-colors hover:opacity-90"
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

// ────────────────────────────────────────────────
// Tool Result Bubble (独立气泡，参考 remote 的 ToolResultMsg)
// ────────────────────────────────────────────────

function ToolResultBubble({ message, toolName }: { message: ChatMessage; toolName?: string }) {
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

        {/* Content — 默认折叠，点击展开 */}
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

// ────────────────────────────────────────────────
// Completed Tool Call Bubble (历史 tool_call 只读展示，仿 remote session_sync)
// ────────────────────────────────────────────────

function CompletedToolCallBubble({ toolCall }: { toolCall: ToolCallItem }) {
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
        {/* Header — 点击展开/折叠参数 */}
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

        {/* Arguments — 展开时显示 */}
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

// ────────────────────────────────────────────────
// System Message Bubble
// ────────────────────────────────────────────────

function SystemMessageBubble({ content }: { content: string }) {
  const isError = content.startsWith('Error:');
  return (
    <div className="flex justify-center px-2 py-1">
      <div
        className="rounded-lg px-4 py-2 text-xs max-w-[80%]"
        style={{
          background: isError
            ? 'var(--vscode-inputValidation-errorBackground)'
            : 'var(--vscode-editor-background)',
          border: `1px solid ${
            isError
              ? 'var(--vscode-inputValidation-errorBorder)'
              : 'var(--vscode-widget-border)'
          }`,
          color: isError
            ? 'var(--vscode-errorForeground)'
            : 'var(--vscode-descriptionForeground)',
        }}
      >
        {isError ? (
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{content.replace(/^Error:\s*/, '')}</span>
          </div>
        ) : (
          content
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Ask Confirmation
// ────────────────────────────────────────────────

function AskConfirm({
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

// ────────────────────────────────────────────────
// Input Area (Floating Glass Style)
// ────────────────────────────────────────────────

interface InputAreaProps {
  session: AgentSession;
  onSend: (message: string, images?: { base64: string; mediaType: string }[]) => void;
  onCancel: () => void;
}

function InputArea({ session, onSend, onCancel }: InputAreaProps) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [images, setImages] = useState<{ base64: string; mediaType: string }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tabBarGlassOpacity = useStore((s) => s.tabBarGlassOpacity);
  const setAgentAutoApprove = useStore((s) => s.setAgentAutoApprove);

  // IME 合成状态（中文输入法选字时按 Enter 不应发送）— 仿 remote 的 composingRef
  const composingRef = useRef(false);

  const isRunning =
    session.runState !== 'idle' &&
    session.runState !== 'error' &&
    session.runState !== 'cancelled';

  // textarea 自动增高（上限 140px）— 仿 remote 的 autoResize
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const handleSend = useCallback(() => {
    if (!input.trim() && images.length === 0) return;
    onSend(input.trim(), images.length > 0 ? images : undefined);
    setInput('');
    setImages([]);
    // 发送后重置高度
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) el.style.height = 'auto';
    });
  }, [input, images, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (handleNativeSelectAll(e)) return;
      // IME 合成中（中文/日文/韩文输入法选字）不触发发送
      if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleFileSelect = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: true,
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });

      if (!selected) return;
      const files = Array.isArray(selected) ? selected : [selected];

      for (const filePath of files) {
        try {
          const bytes = await storage.readFileBytes(filePath);
          const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
          const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          // Convert number[] to base64
          const uint8 = new Uint8Array(bytes);
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < uint8.length; i += chunkSize) {
            binary += String.fromCharCode(...uint8.slice(i, i + chunkSize));
          }
          const base64 = btoa(binary);
          setImages((prev) => [
            ...prev,
            { base64, mediaType: mime },
          ]);
        } catch (e) {
          console.error('Failed to read file:', e);
        }
      }
    } catch (e) {
      console.error('Failed to open file picker:', e);
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="shrink-0 px-4 pb-4">
      {/* HintBar — 快捷键提示（仿 remote 的 hint-bar） */}
      <div
        className="px-2 pb-1 text-[10px] select-none"
        style={{ color: 'var(--vscode-descriptionForeground)' }}
      >
        {t('agent.hintKeys')}
      </div>
      <div
        className="relative rounded-2xl border border-[var(--vscode-menu-border)]"
        style={{
          background: `rgba(255,255,255,${tabBarGlassOpacity})`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}
      >
        {/* 图片预览 */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={`data:${img.mediaType};base64,${img.base64}`}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    background: 'var(--vscode-button-background)',
                    color: 'var(--vscode-button-foreground)',
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 输入框 */}
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          placeholder={isRunning ? t('agent.appendMessage') : t('agent.inputPlaceholder')}
          rows={1}
          className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none overflow-y-auto"
          style={{
            color: 'var(--vscode-input-foreground)',
            minHeight: '40px',
            maxHeight: '140px',
          }}
        />

        {/* 底部状态栏 */}
        <div
          className="flex items-center justify-between px-4 py-2 text-xs"
          style={{ color: 'var(--vscode-descriptionForeground)' }}
        >
          <div className="flex items-center gap-2">
            <ModelSelector />
            {/* 文件选择按钮 */}
            <button
              onClick={handleFileSelect}
              className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
              title={t('agent.reference')}
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>
            {/* 隐藏的文件输入 */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const files = e.target.files;
                if (!files) return;
                for (let i = 0; i < files.length; i++) {
                  const file = files[i];
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result = reader.result as string;
                    const base64 = result.split(',')[1];
                    setImages((prev) => [
                      ...prev,
                      { base64, mediaType: file.type || 'image/png' },
                    ]);
                  };
                  reader.readAsDataURL(file);
                }
                e.target.value = '';
              }}
            />
            {/* 自动批准开关 — 可点击切换（仿 remote 的 autoApprove switch） */}
            <button
              onClick={() => setAgentAutoApprove(session.id, !session.autoApprove)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
              title={t('agent.autoApprove')}
            >
              <span
                className="relative inline-block w-6 h-3.5 rounded-full transition-colors"
                style={{
                  background: session.autoApprove
                    ? 'var(--vscode-button-background)'
                    : 'var(--vscode-input-background)',
                  border: '1px solid var(--vscode-widget-border)',
                }}
              >
                <span
                  className="absolute top-[1px] w-2.5 h-2.5 rounded-full transition-all"
                  style={{
                    left: session.autoApprove ? '12px' : '1px',
                    background: session.autoApprove
                      ? 'var(--vscode-button-foreground)'
                      : 'var(--vscode-descriptionForeground)',
                  }}
                />
              </span>
              <span>
                {session.autoApprove ? t('agent.autoApproveOn') : t('agent.autoApproveOff')}
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <button
                onClick={onCancel}
                className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.1)]"
                style={{ color: 'var(--vscode-errorForeground)' }}
              >
                <Square className="w-3 h-3" />
                <span>{t('agent.cancel')}</span>
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={!input.trim() && images.length === 0}
              className="flex items-center justify-center w-8 h-8 rounded-full transition-colors disabled:opacity-30 hover:opacity-90"
              style={{
                background: input.trim() || images.length > 0
                  ? 'var(--vscode-button-background)'
                  : 'rgba(255,255,255,0.1)',
                color: input.trim() || images.length > 0
                  ? 'var(--vscode-button-foreground)'
                  : 'var(--vscode-descriptionForeground)',
              }}
              title={t('agent.send')}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Streaming Message (独立组件，处理实时 streaming)
// ────────────────────────────────────────────────

function StreamingMessage({
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
      <div className="flex justify-start px-2 py-1">
        <div
          className="rounded-2xl px-4 py-2.5 text-sm"
          style={{
            background: 'var(--vscode-editor-background)',
            border: '1px solid var(--vscode-widget-border)',
            color: 'var(--vscode-descriptionForeground)',
          }}
        >
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">{t('agent.thinking')}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ────────────────────────────────────────────────
// Status Indicator
// ────────────────────────────────────────────────

function StatusIndicator({ session }: { session: AgentSession }) {
  const { t } = useI18n();
  const { runState, retryInfo } = session;

  if (runState === 'compacting') {
    return (
      <div className="flex justify-center px-2 py-1">
        <div
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
          style={{
            background: 'var(--vscode-editor-background)',
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
          className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
          style={{
            background: 'var(--vscode-editor-background)',
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

// ────────────────────────────────────────────────
// Chat Area (Main)
// ────────────────────────────────────────────────

interface AgentChatProps {
  session: AgentSession;
  onBack?: () => void;
}

export function AgentChat({ session, onBack }: AgentChatProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 智能自动滚动 — 仿 remote 的 autoScrollRef：
  // 仅当用户停留在底部附近时才跟随新内容滚动，上翻阅读历史时不打扰
  const autoScrollRef = useRef(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const sendAgentMessage = useStore((s) => s.sendAgentMessage);
  const cancelAgent = useStore((s) => s.cancelAgent);
  const submitAgentToolResult = useStore((s) => s.submitAgentToolResult);
  const submitAgentPlanDecision = useStore((s) => s.submitAgentPlanDecision);
  const submitAgentAskAnswer = useStore((s) => s.submitAgentAskAnswer);

  const isNearBottom = useCallback(() => {
    const c = scrollRef.current;
    if (!c) return true;
    return c.scrollHeight - c.scrollTop - c.clientHeight < 80;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (!force && !autoScrollRef.current) return;
    requestAnimationFrame(() => {
      const c = scrollRef.current;
      if (c) c.scrollTop = c.scrollHeight;
    });
  }, []);

  const handleScroll = useCallback(() => {
    const near = isNearBottom();
    autoScrollRef.current = near;
    setShowScrollBottom(!near);
  }, [isNearBottom]);

  // 内容变化时跟随滚动（仅当在底部附近）
  useEffect(() => {
    scrollToBottom();
  }, [session.messages, session.streamingContent, session.pendingToolCalls, session.pendingPlan, session.pendingAsk, session.runState, scrollToBottom]);

  // 切换 session 时强制回到底部
  useEffect(() => {
    autoScrollRef.current = true;
    setShowScrollBottom(false);
    scrollToBottom(true);
  }, [session.id, scrollToBottom]);

  // 历史消息中 toolCallId → toolName 的映射（补齐 tool 结果气泡的工具名）
  // 仿 remote 的 toolNameMap
  const toolNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const msg of session.messages) {
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          map.set(tc.id, tc.name);
        }
      }
    }
    return map;
  }, [session.messages]);

  const handleSend = useCallback(
    (message: string, images?: { base64: string; mediaType: string }[]) => {
      // 发送时强制回到底部并恢复自动滚动
      autoScrollRef.current = true;
      scrollToBottom(true);
      sendAgentMessage(session.id, message, images);
    },
    [session.id, sendAgentMessage, scrollToBottom],
  );

  const handleCancel = useCallback(() => {
    cancelAgent(session.id);
  }, [session.id, cancelAgent]);

  const isEmpty =
    session.messages.length === 0 &&
    !session.streamingContent &&
    session.runState !== 'thinking' &&
    session.runState !== 'streaming';

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <TopBar session={session} onBack={onBack} />

      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2"
      >
        {/* 空会话提示 */}
        {isEmpty && (
          <div className="h-full flex flex-col items-center justify-center gap-2 select-none">
            <Bot
              className="w-8 h-8"
              style={{ color: 'var(--vscode-descriptionForeground)' }}
            />
            <span
              className="text-sm"
              style={{ color: 'var(--vscode-descriptionForeground)' }}
            >
              {t('agent.startChat')}
            </span>
          </div>
        )}

        {session.messages.map((msg, i) => {
          // 根据消息角色选择对应的气泡组件
          switch (msg.role) {
            case 'user':
              return (
                <UserMessageBubble
                  key={msg.id || `msg-${i}`}
                  content={msg.content}
                  images={msg.images}
                />
              );
            case 'assistant':
              return (
                <div key={msg.id || `msg-${i}`}>
                  {/* 历史 tool_call 气泡（只读，仿 remote session_sync） */}
                  {msg.toolCalls?.map((tc) => (
                    <CompletedToolCallBubble key={tc.id} toolCall={tc} />
                  ))}
                  {/* assistant 文本内容（可能为空，例如纯 tool_call 消息） */}
                  {msg.content.trim() && (
                    <AssistantMessageBubble
                      content={msg.content}
                      reasoningContent={msg.reasoningContent}
                    />
                  )}
                </div>
              );
            case 'tool':
              return (
                <ToolResultBubble
                  key={msg.id || `msg-${i}`}
                  message={msg}
                  toolName={msg.toolCallId ? toolNameMap.get(msg.toolCallId) : undefined}
                />
              );
            case 'system':
              return (
                <SystemMessageBubble
                  key={msg.id || `msg-${i}`}
                  content={msg.content}
                />
              );
            default:
              return null;
          }
        })}

        {/* Streaming message (实时显示 streaming 内容) */}
        {(session.runState === 'streaming' || session.runState === 'thinking') && (
          <StreamingMessage
            content={session.streamingContent}
            reasoningContent={session.streamingReasoningContent}
            runState={session.runState}
          />
        )}

        {/* Pending tool calls (需要用户审批的工具) */}
        {session.pendingToolCalls.length > 0 && (
          <ToolCallBubble
            toolCalls={session.pendingToolCalls}
            sessionId={session.id}
            onApprove={submitAgentToolResult}
            onReject={submitAgentToolResult}
            pendingPlan={session.pendingPlan}
            onPlanDecision={submitAgentPlanDecision}
          />
        )}

        {/* Pending Ask */}
        {session.pendingAsk && (
          <AskConfirm
            askRequest={session.pendingAsk}
            sessionId={session.id}
            onSubmit={submitAgentAskAnswer}
          />
        )}

        {/* Status indicators (compacting, retrying, error) */}
        <StatusIndicator session={session} />

        {/* Invisible anchor for auto-scroll */}
        <div ref={messagesEndRef} />
      </div>

      {/* 回到底部浮动按钮 — 用户上翻时显示（仿 remote 的 scroll-bottom-btn） */}
      {showScrollBottom && !isEmpty && (
        <div className="relative">
          <button
            onClick={() => {
              autoScrollRef.current = true;
              setShowScrollBottom(false);
              scrollToBottom(true);
            }}
            className="absolute right-6 -top-12 z-10 flex items-center justify-center w-8 h-8 rounded-full shadow-lg transition-opacity hover:opacity-90"
            style={{
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
            }}
            title={t('agent.scrollToBottom')}
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input area */}
      <InputArea session={session} onSend={handleSend} onCancel={handleCancel} />
    </div>
  );
}