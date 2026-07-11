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

import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { storage } from '../../lib/core/storage';
import {
  ArrowLeft,
  History,
  Share2,
  Star,
  StarOff,
  MoreHorizontal,
  Send,
  Square,
  ChevronRight,
  Paperclip,
  Image,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Ban,
  Bot,
  User,
  ChevronDown,
} from 'lucide-react';
import MarkdownMessage from './MarkdownMessage';
import { ModelSelector } from './ModelSelector';
import type { AgentSession, ChatMessage, ToolCallItem, AgentRunState, AgentAskRequest, AskQuestion } from '../../types/agent';

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
  const [isFavorite, setIsFavorite] = useState(false);

  const title = getSessionTitle(session);

  return (
    <div
      className="shrink-0 flex items-center justify-between px-4 py-2"
      style={{
        background: 'var(--vscode-editorGroupHeader-tabsBackground)',
        borderBottom: '1px solid var(--vscode-widget-border)',
      }}
    >
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
            title={t('agent.back')}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: 'var(--vscode-foreground)' }} />
          </button>
        )}
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium truncate max-w-[300px]"
            style={{ color: 'var(--vscode-foreground)' }}
          >
            {title}
          </span>
          {session.runState !== 'idle' && <RunStateBadge state={session.runState} />}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title={t('agent.history')}
        >
          <History className="w-4 h-4" style={{ color: 'var(--vscode-foreground)' }} />
        </button>
        <button
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title={t('agent.share')}
        >
          <Share2 className="w-4 h-4" style={{ color: 'var(--vscode-foreground)' }} />
        </button>
        <button
          onClick={() => setIsFavorite(!isFavorite)}
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title={isFavorite ? t('agent.unfavorite') : t('agent.favorite')}
        >
          {isFavorite ? (
            <StarOff className="w-4 h-4" style={{ color: 'var(--vscode-foreground)' }} />
          ) : (
            <Star className="w-4 h-4" style={{ color: 'var(--vscode-foreground)' }} />
          )}
        </button>
        <button
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title={t('agent.more')}
        >
          <MoreHorizontal className="w-4 h-4" style={{ color: 'var(--vscode-foreground)' }} />
        </button>
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

function ToolResultBubble({ message }: { message: ChatMessage }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const isError = message.toolResult?.isError ?? false;
  const status = message.toolResult?.status ?? 'executed';

  const statusConfig = {
    executed: { label: t('agent.toolExecuted'), icon: CheckCircle2, color: 'var(--vscode-terminal-ansiGreen)' },
    failed: { label: t('agent.toolFailed'), icon: AlertCircle, color: 'var(--vscode-errorForeground)' },
    rejected: { label: t('agent.toolRejected'), icon: Ban, color: 'var(--vscode-descriptionForeground)' },
    auto_approved: { label: t('agent.toolAutoApproved'), icon: CheckCircle2, color: 'var(--vscode-terminal-ansiGreen)' },
  }[status] || { label: status, icon: Loader2, color: 'var(--vscode-descriptionForeground)' };

  const StatusIcon = statusConfig.icon;

  // 内容为空且无图片时不渲染
  if (!message.content.trim() && (!message.images || message.images.length === 0)) return null;

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
        <div className="flex items-center gap-2 mb-2">
          <StatusIcon className="w-3.5 h-3.5" style={{ color: statusConfig.color }} />
          <span className="text-xs font-medium" style={{ color: 'var(--vscode-foreground)' }}>
            {t('agent.toolResult')}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
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
              className="ml-auto flex items-center gap-1 text-[10px] hover:opacity-80"
              style={{ color: 'var(--vscode-descriptionForeground)' }}
            >
              {expanded ? t('agent.cancel') : t('agent.history')}
              <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        {/* Content — 默认折叠，点击展开 */}
        {expanded && message.content.trim() && (
          <pre
            className="whitespace-pre-wrap break-words font-mono text-xs overflow-x-auto max-h-48 rounded-lg p-2 mb-2"
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
          <div className="flex flex-wrap gap-2">
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

  const isRunning =
    session.runState !== 'idle' &&
    session.runState !== 'error' &&
    session.runState !== 'cancelled';

  const handleSend = useCallback(() => {
    if (!input.trim() && images.length === 0) return;
    onSend(input.trim(), images.length > 0 ? images : undefined);
    setInput('');
    setImages([]);
  }, [input, images, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
          placeholder={t('agent.inputPlaceholder')}
          rows={2}
          className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none"
          style={{
            color: 'var(--vscode-input-foreground)',
            minHeight: '56px',
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
            <span>{session.autoApprove ? t('agent.autoApproveOn') : t('agent.autoApproveOff')}</span>
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sendAgentMessage = useStore((s) => s.sendAgentMessage);
  const cancelAgent = useStore((s) => s.cancelAgent);
  const submitAgentToolResult = useStore((s) => s.submitAgentToolResult);
  const submitAgentPlanDecision = useStore((s) => s.submitAgentPlanDecision);
  const submitAgentAskAnswer = useStore((s) => s.submitAgentAskAnswer);

  // Auto-scroll to bottom whenever content changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages, session.streamingContent, session.pendingToolCalls, session.pendingPlan, session.pendingAsk, session.runState]);

  const handleSend = useCallback(
    (message: string, images?: { base64: string; mediaType: string }[]) => {
      sendAgentMessage(session.id, message, images);
    },
    [session.id, sendAgentMessage],
  );

  const handleCancel = useCallback(() => {
    cancelAgent(session.id);
  }, [session.id, cancelAgent]);

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <TopBar session={session} onBack={onBack} />

      {/* Messages area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
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
                <AssistantMessageBubble
                  key={msg.id || `msg-${i}`}
                  content={msg.content}
                  reasoningContent={msg.reasoningContent}
                />
              );
            case 'tool':
              return (
                <ToolResultBubble
                  key={msg.id || `msg-${i}`}
                  message={msg}
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

      {/* Input area */}
      <InputArea session={session} onSend={handleSend} onCancel={handleCancel} />
    </div>
  );
}