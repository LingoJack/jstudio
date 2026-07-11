/**
 * AgentChat — 右侧聊天区域组件
 * 
 * 结构：
 * - 顶部标题栏：返回按钮、任务标题、操作图标（历史、分享、收藏等）
 * - 中央消息区：对话消息列表
 * - 底部输入区：引导标签、输入框、权限状态、发送按钮
 * - 状态栏：AI 免责声明、模型版本、语音输入
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import {
  ArrowLeft,
  History,
  Share2,
  Star,
  StarOff,
  MoreHorizontal,
  Send,
  Square,
  Mic,
  ChevronRight,
} from 'lucide-react';
import MarkdownMessage from './MarkdownMessage';
import type { AgentSession, ChatMessage, ToolCallItem, AgentRunState, AgentAskRequest, AskQuestion } from '../../types/agent';

// ────────────────────────────────────────────────
// 获取任务标题（用户第一条消息）
// ────────────────────────────────────────────────

function getSessionTitle(session: AgentSession): string {
  // 优先使用用户第一条消息作为标题
  const firstUserMessage = session.messages.find((m) => m.role === 'user');
  if (firstUserMessage?.content) {
    const content = firstUserMessage.content.trim();
    // 截取前 50 个字符
    return content.length > 50 ? content.slice(0, 50) + '...' : content;
  }
  // 回退到 session.title 或默认
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
  const [isFavorite, setIsFavorite] = useState(false); // TODO: 从 session 读取

  const title = getSessionTitle(session);

  return (
    <div
      className="shrink-0 flex items-center justify-between px-4 py-2"
      style={{
        background: 'var(--vscode-editorGroupHeader-tabsBackground)',
        borderBottom: '1px solid var(--vscode-widget-border)',
      }}
    >
      {/* 左侧：返回 + 标题 */}
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

      {/* 右侧：操作图标 */}
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
// Message Bubble
// ────────────────────────────────────────────────

function MessageBubble({
  message,
  isStreaming,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
}) {
  const { t } = useI18n();
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const isSystem = message.role === 'system';

  // System message (error notifications)
  if (isSystem) {
    return (
      <div className="flex justify-center px-2 py-1">
        <div
          className="rounded-lg px-3 py-2 text-xs max-w-[80%]"
          style={{
            background: 'var(--vscode-editor-background)',
            border: '1px solid var(--vscode-widget-border)',
            color: message.content.startsWith('Error:')
              ? 'var(--vscode-errorForeground)'
              : 'var(--vscode-descriptionForeground)',
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Tool result message
  if (isTool) {
    return <ToolResultBubble message={message} />;
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-2 py-1`}>
      <div
        className="rounded-lg px-3 py-2 text-sm max-w-[80%] overflow-x-auto"
        style={{
          background: isUser ? 'var(--vscode-button-background)' : 'var(--vscode-editor-background)',
          color: isUser
            ? 'var(--vscode-button-foreground)'
            : 'var(--vscode-editor-foreground)',
          border: isUser ? 'none' : '1px solid var(--vscode-widget-border)',
        }}
      >
        {/* Reasoning content (collapsible) */}
        {message.reasoningContent && (
          <details className="mb-2">
            <summary
              className="text-xs cursor-pointer"
              style={{ color: 'var(--vscode-descriptionForeground)' }}
            >
              {t('agent.thinking')}
            </summary>
            <div
              className="mt-1 text-xs whitespace-pre-wrap opacity-70"
              style={{ color: 'var(--vscode-descriptionForeground)' }}
            >
              {message.reasoningContent}
            </div>
          </details>
        )}

        {/* Main content */}
        {isUser ? (
          <div
            className={`whitespace-pre-wrap break-words ${isStreaming && !message.content ? 'animate-pulse' : ''}`}
          >
            {message.content || (isStreaming ? '' : '')}
          </div>
        ) : (
          <MarkdownMessage>{message.content}</MarkdownMessage>
        )}

        {/* Streaming cursor */}
        {isStreaming && !message.content && <span className="animate-pulse">▋</span>}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Tool Result Bubble
// ────────────────────────────────────────────────

function ToolResultBubble({ message }: { message: ChatMessage }) {
  const { t } = useI18n();
  const isError = message.toolResult?.isError ?? false;
  const status = message.toolResult?.status ?? 'executed';

  const statusLabel = {
    executed: t('agent.toolExecuted'),
    failed: t('agent.toolFailed'),
    rejected: t('agent.toolRejected'),
    auto_approved: t('agent.toolAutoApproved'),
  }[status] || status;

  return (
    <div className="flex justify-start px-2 py-1">
      <div
        className="rounded-lg px-3 py-2 text-xs max-w-[80%] overflow-hidden"
        style={{
          background: isError
            ? 'var(--vscode-inputValidation-errorBackground, var(--vscode-editor-background))'
            : 'var(--vscode-editor-background)',
          border: isError
            ? '1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground))'
            : '1px solid var(--vscode-widget-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium" style={{ color: 'var(--vscode-foreground)' }}>
            {t('agent.toolResult')}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              background: isError
                ? 'var(--vscode-inputValidation-errorBackground)'
                : 'var(--vscode-button-background)',
              color: isError
                ? 'var(--vscode-errorForeground)'
                : 'var(--vscode-button-foreground)',
            }}
          >
            {statusLabel}
          </span>
        </div>

        {/* Content */}
        <pre
          className="whitespace-pre-wrap break-words font-mono text-xs overflow-x-auto max-h-48"
          style={{
            color: isError ? 'var(--vscode-errorForeground)' : 'var(--vscode-descriptionForeground)',
          }}
        >
          {message.content}
        </pre>

        {/* Images */}
        {message.images && message.images.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.images.map((img, i) => (
              <img
                key={i}
                src={`data:${img.mediaType};base64,${img.base64}`}
                alt="Tool result image"
                className="max-w-32 max-h-32 rounded"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Tool Call Confirmation
// ────────────────────────────────────────────────

function ToolCallConfirm({
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
      <div
        className="rounded-lg px-4 py-3 max-w-[80%]"
        style={{
          background: 'var(--vscode-menu-background)',
          border: '1px solid var(--vscode-menu-border)',
        }}
      >
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--vscode-foreground)' }}>
          {t('agent.planTitle')}
        </div>
        <pre
          className="text-xs mb-3 whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-48"
          style={{ color: 'var(--vscode-descriptionForeground)' }}
        >
          {pendingPlan.plan}
        </pre>
        <div className="flex gap-2">
          <button
            onClick={() => onPlanDecision?.(sessionId, 'approve')}
            className="px-3 py-1.5 rounded text-xs transition-colors"
            style={{
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
            }}
          >
            {t('agent.planApprove')}
          </button>
          <button
            onClick={() => onPlanDecision?.(sessionId, 'approveAndClearContext')}
            className="px-3 py-1.5 rounded text-xs transition-colors"
            style={{
              background: 'var(--vscode-button-secondaryBackground)',
              color: 'var(--vscode-button-secondaryForeground)',
            }}
          >
            {t('agent.planApproveClear')}
          </button>
          <button
            onClick={() => onPlanDecision?.(sessionId, 'reject')}
            className="px-3 py-1.5 rounded text-xs transition-colors"
            style={{
              background: 'var(--vscode-inputValidation-errorBackground)',
              color: 'var(--vscode-errorForeground)',
            }}
          >
            {t('agent.planReject')}
          </button>
        </div>
      </div>
    );
  }

  // Regular tool confirmation
  return (
    <div
      className="rounded-lg px-4 py-3 max-w-[80%]"
      style={{
        background: 'var(--vscode-menu-background)',
        border: '1px solid var(--vscode-menu-border)',
      }}
    >
      <div className="text-xs font-medium mb-2" style={{ color: 'var(--vscode-foreground)' }}>
        {t('agent.toolCall')}
      </div>
      {toolCalls.map((tc) => {
        const isDangerous = tc.isDangerous ?? tc.requiresConfirmation;
        return (
          <div key={tc.id} className="mb-3 last:mb-0">
            {/* Tool header */}
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => setExpandedTool(expandedTool === tc.id ? null : tc.id)}
            >
              <ChevronRight
                className={`w-3 h-3 transition-transform ${expandedTool === tc.id ? 'rotate-90' : ''}`}
                style={{ color: 'var(--vscode-descriptionForeground)' }}
              />
              <span
                className="text-xs font-mono"
                style={{ color: 'var(--vscode-textPreformat-foreground)' }}
              >
                {tc.name}
              </span>
              {isDangerous && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    background: 'var(--vscode-inputValidation-warningBackground)',
                    color: 'var(--vscode-inputValidation-warningForeground)',
                  }}
                >
                  {t('agent.toolDangerous')}
                </span>
              )}
            </div>

            {/* Arguments */}
            {expandedTool === tc.id && (
              <pre
                className="text-xs mt-1 ml-5 whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-32"
                style={{ color: 'var(--vscode-descriptionForeground)' }}
              >
                {tc.arguments}
              </pre>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-2 ml-5">
              <button
                onClick={() =>
                  onApprove(sessionId, tc.id, JSON.stringify({ approved: true }), false)
                }
                className="px-3 py-1 rounded text-xs transition-colors"
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
                className="px-3 py-1 rounded text-xs transition-colors"
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
    <div
      className="rounded-lg px-4 py-3 max-w-[80%]"
      style={{
        background: 'var(--vscode-menu-background)',
        border: '1px solid var(--vscode-menu-border)',
      }}
    >
      <div className="text-xs font-medium mb-3" style={{ color: 'var(--vscode-foreground)' }}>
        {t('agent.askTitle')}
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
                className={`px-3 py-1.5 rounded text-xs transition-colors ${
                  answers[idx.toString()] === opt.label
                    ? 'ring-1 ring-[var(--vscode-focusBorder)]'
                    : ''
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
        className="mt-2 px-3 py-1.5 rounded text-xs transition-colors disabled:opacity-40"
        style={{
          background: 'var(--vscode-button-background)',
          color: 'var(--vscode-button-foreground)',
        }}
      >
        {t('agent.askSubmit')}
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────
// Input Area
// ────────────────────────────────────────────────

interface InputAreaProps {
  session: AgentSession;
  onSend: (message: string) => void;
  onCancel: () => void;
}

function InputArea({ session, onSend, onCancel }: InputAreaProps) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isRunning =
    session.runState !== 'idle' &&
    session.runState !== 'error' &&
    session.runState !== 'cancelled';

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  }, [input, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div
      className="shrink-0 px-4 py-3"
      style={{
        background: 'var(--vscode-editor-background)',
        borderTop: '1px solid var(--vscode-widget-border)',
      }}
    >
      {/* 引导标签 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs" style={{ color: 'var(--vscode-descriptionForeground)' }}>
          {t('agent.nextSteps')}
        </span>
        <div className="flex items-center gap-1">
          <button
            className="text-xs px-2 py-0.5 rounded transition-colors hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            style={{ color: 'var(--vscode-textLink-foreground)' }}
          >
            @ {t('agent.reference')}
          </button>
          <button
            className="text-xs px-2 py-0.5 rounded transition-colors hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            style={{ color: 'var(--vscode-textLink-foreground)' }}
          >
            / {t('agent.skills')}
          </button>
        </div>
      </div>

      {/* 输入框 */}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('agent.inputPlaceholder')}
          rows={1}
          className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none transition-colors"
          style={{
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-input-border)',
            maxHeight: '120px',
          }}
        />
        <div className="flex items-center gap-1">
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex items-center justify-center w-9 h-9 rounded-full transition-colors disabled:opacity-30"
            style={{
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
            }}
            title={t('agent.send')}
          >
            <Send className="w-4 h-4" />
          </button>
          {isRunning && (
            <button
              onClick={onCancel}
              className="flex items-center justify-center w-9 h-9 rounded-full transition-colors"
              style={{
                background: 'var(--vscode-button-secondaryBackground)',
                color: 'var(--vscode-button-secondaryForeground)',
              }}
              title={t('agent.cancel')}
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 权限状态 */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs" style={{ color: 'var(--vscode-descriptionForeground)' }}>
          {session.autoApprove ? t('agent.autoApproveOn') : t('agent.autoApproveOff')}
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Status Bar
// ────────────────────────────────────────────────

function StatusBar() {
  const { t } = useI18n();

  return (
    <div
      className="shrink-0 flex items-center justify-between px-4 py-1.5"
      style={{
        background: 'var(--vscode-statusBar-background)',
        borderTop: '1px solid var(--vscode-statusBar-border)',
      }}
    >
      {/* 左侧：免责声明 */}
      <span
        className="text-xs"
        style={{ color: 'var(--vscode-statusBar-foreground)', opacity: 0.7 }}
      >
        {t('agent.disclaimer')}
      </span>

      {/* 右侧：模型版本 + 语音 */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            background: 'var(--vscode-badge-background)',
            color: 'var(--vscode-badge-foreground)',
          }}
        >
          {t('agent.modelVersion')}
        </span>
        <button
          className="flex items-center justify-center w-6 h-6 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title={t('agent.voiceInput')}
        >
          <Mic
            className="w-3.5 h-3.5"
            style={{ color: 'var(--vscode-statusBar-foreground)' }}
          />
        </button>
      </div>
    </div>
  );
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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages, session.streamingContent]);

  const handleSend = useCallback(
    (message: string) => {
      sendAgentMessage(session.id, message);
    },
    [session.id, sendAgentMessage],
  );

  const handleCancel = useCallback(() => {
    cancelAgent(session.id);
  }, [session.id, cancelAgent]);

  return (
    <div className="h-full flex flex-col">
      {/* 顶部标题栏 */}
      <TopBar session={session} onBack={onBack} />

      {/* 消息区 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {session.messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {/* Streaming content */}
        {(session.runState === 'streaming' || session.runState === 'thinking') && (
          <MessageBubble
            message={{
              role: 'assistant',
              content: session.streamingContent,
              reasoningContent: session.streamingReasoningContent || undefined,
            }}
            isStreaming
          />
        )}

        {/* Pending tool calls */}
        {session.pendingToolCalls.length > 0 && (
          <ToolCallConfirm
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

        {/* Status indicators */}
        {session.runState === 'thinking' && (
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: 'var(--vscode-descriptionForeground)' }}
          >
            <span className="animate-pulse">{t('agent.thinking')}</span>
          </div>
        )}
        {session.runState === 'compacting' && (
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: 'var(--vscode-descriptionForeground)' }}
          >
            <span>{t('agent.compacting')}</span>
          </div>
        )}
        {session.runState === 'retrying' && session.retryInfo && (
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: 'var(--vscode-descriptionForeground)' }}
          >
            <span>
              {t('agent.retrying')} ({session.retryInfo.attempt}/{session.retryInfo.maxAttempts})
            </span>
          </div>
        )}
        {session.runState === 'error' && (
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: 'var(--vscode-errorForeground)' }}
          >
            <span>{t('agent.error')}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <InputArea session={session} onSend={handleSend} onCancel={handleCancel} />

      {/* 状态栏 */}
      <StatusBar />
    </div>
  );
}