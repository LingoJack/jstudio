/**
 * AgentChat - 右侧聊天区域组件
 *
 * 核心设计原则（参考 remote 模块的交互模式）：
 * 1. 用户消息发送后立即显示气泡，无需等待后端确认
 * 2. 工具调用有独立的气泡展示（可展开/折叠参数）
 * 3. 工具结果以独立气泡展示（成功/失败状态清晰）
 * 4. 支持文件选择（图片上传）
 * 5. 消息永不覆盖--使用唯一 id 追踪每条消息
 * 6. streaming 内容实时显示，flush 到消息列表后保留完整内容
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { Bot, ArrowDown } from 'lucide-react';
import type { AgentSession } from '../../types/agent';

import { ChatTopBar } from './ChatTopBar';
import { ChatInput } from './ChatInput';
import { StatusIndicator } from './StatusIndicator';
import { UserMessageBubble } from './bubbles/UserMessageBubble';
import { AssistantMessageBubble } from './bubbles/AssistantMessageBubble';
import { ToolCallBubble } from './bubbles/ToolCallBubble';
import { ToolResultBubble } from './bubbles/ToolResultBubble';
import { CompletedToolCallBubble } from './bubbles/CompletedToolCallBubble';
import { SystemMessageBubble } from './bubbles/SystemMessageBubble';
import { StreamingMessage } from './bubbles/StreamingMessage';
import { AskConfirm } from './bubbles/AskConfirm';

interface AgentChatProps {
  session: AgentSession;
  onBack?: () => void;
}

export function AgentChat({ session, onBack }: AgentChatProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 智能自动滚动 - 仿 remote 的 autoScrollRef：
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

  // 历史消息中 toolCallId -> toolName 的映射（补齐 tool 结果气泡的工具名）
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
      <ChatTopBar session={session} onBack={onBack} />

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
            onApprove={(sid, tcId, result, isErr, approved) =>
              submitAgentToolResult(sid, tcId, result, isErr, undefined, undefined, approved)
            }
            onReject={(sid, tcId, result, isErr) =>
              submitAgentToolResult(sid, tcId, result, isErr)
            }
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

      {/* 回到底部浮动按钮 - 用户上翻时显示（仿 remote 的 scroll-bottom-btn） */}
      {showScrollBottom && !isEmpty && (
        <div className="relative">
          <button
            onClick={() => {
              autoScrollRef.current = true;
              setShowScrollBottom(false);
              scrollToBottom(true);
            }}
            className="absolute right-6 -top-12 z-10 flex items-center justify-center w-9 h-9 rounded-full transition-all hover:scale-110 hover:opacity-100"
            style={{
              background: 'color-mix(in srgb, var(--vscode-button-background) 85%, transparent)',
              color: 'var(--vscode-button-foreground)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
            title={t('agent.scrollToBottom')}
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input area */}
      <ChatInput session={session} onSend={handleSend} onCancel={handleCancel} />
    </div>
  );
}
