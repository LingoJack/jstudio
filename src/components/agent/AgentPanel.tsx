/**
 * AgentPanel — top-level container for the JSpirit chat view.
 *
 * Layout:
 * - Left sidebar: workspace groups with sessions (limit 5 per group, expand modal for more)
 * - Right main: chat messages + input area
 *
 * Follows the terminal panel pattern: mount-once, CSS-hide when switching views.
 */

import { useEffect, useRef, useState, useCallback, type FormEvent } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { Plus, Send, Square, Trash2, MessageSquare, FolderOpen, ChevronRight, X } from 'lucide-react';
import MarkdownMessage from './MarkdownMessage';
import type { AgentSession, ChatMessage, ToolCallItem, AgentRunState } from '../../types/agent';

// ────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────

const MAX_SESSIONS_PER_GROUP = 5;

// ────────────────────────────────────────────────
// Workspace Group
// ────────────────────────────────────────────────

interface WorkspaceGroup {
  workspace: string; // path or 'default' for no workspace
  displayName: string; // folder name
  sessions: AgentSession[];
}

function groupSessionsByWorkspace(sessions: AgentSession[]): WorkspaceGroup[] {
  const groups = new Map<string, AgentSession[]>();

  for (const session of sessions) {
    const key = session.workspace || '';
    if (!key) continue; // skip sessions without workspace
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(session);
  }

  // Sort each group by updatedAt desc
  for (const [, groupSessions] of groups) {
    groupSessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // Convert to array and sort by most recent session
  const result: WorkspaceGroup[] = [];
  for (const [workspace, groupSessions] of groups) {
    const displayName = workspace.split('/').pop() || workspace;
    result.push({
      workspace,
      displayName,
      sessions: groupSessions,
    });
  }

  result.sort((a, b) => {
    const aLatest = a.sessions[0]?.updatedAt || 0;
    const bLatest = b.sessions[0]?.updatedAt || 0;
    return bLatest - aLatest;
  });

  return result;
}

// ────────────────────────────────────────────────
// Expand Modal
// ────────────────────────────────────────────────

function ExpandModal({
  group,
  onSelect,
  onDelete,
  activeId,
  onClose,
}: {
  group: WorkspaceGroup;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  activeId: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-xl w-[400px] max-h-[80vh] overflow-hidden flex flex-col"
        style={{
          background: 'var(--vscode-menu-background)',
          border: '1px solid var(--vscode-menu-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--vscode-widget-border)' }}
        >
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4" style={{ color: 'var(--vscode-foreground)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>
              {group.displayName}
            </span>
            <span
              className="text-xs"
              style={{ color: 'var(--vscode-descriptionForeground)' }}
            >
              ({group.sessions.length})
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          >
            <X className="w-3.5 h-3.5" style={{ color: 'var(--vscode-foreground)' }} />
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto">
          {group.sessions.map((session) => (
            <div
              key={session.id}
              className={`group flex items-center gap-2 px-4 py-2 cursor-pointer text-sm transition-colors ${
                session.id === activeId
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
                  : 'hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
              style={{
                color:
                  session.id === activeId
                    ? 'var(--vscode-list-activeSelectionForeground)'
                    : 'var(--vscode-foreground)',
              }}
              onClick={() => {
                onSelect(session.id);
                onClose();
              }}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
              <span className="truncate flex-1">
                {session.title || session.messages[0]?.content.slice(0, 30) || '...'}
              </span>
              <span className="text-xs opacity-60">
                {new Date(session.updatedAt * 1000).toLocaleDateString()}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(session.id);
                }}
                className="shrink-0 opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-opacity"
                title={t('agent.deleteSession')}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Workspace Group Item (sidebar)
// ────────────────────────────────────────────────

function WorkspaceGroupItem({
  group,
  onSelect,
  onDelete,
  activeId,
  onExpand,
}: {
  group: WorkspaceGroup;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  activeId: string | null;
  onExpand: (group: WorkspaceGroup) => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const visibleSessions = group.sessions.slice(0, MAX_SESSIONS_PER_GROUP);
  const hasMore = group.sessions.length > MAX_SESSIONS_PER_GROUP;

  return (
    <div className="mb-1">
      {/* Group header */}
      <div
        className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          style={{ color: 'var(--vscode-descriptionForeground)' }}
        />
        <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--vscode-foreground)' }} />
        <span
          className="text-xs font-medium flex-1 truncate"
          style={{ color: 'var(--vscode-foreground)' }}
        >
          {group.displayName}
        </span>
        <span
          className="text-xs"
          style={{ color: 'var(--vscode-descriptionForeground)' }}
        >
          {group.sessions.length}
        </span>
      </div>

      {/* Sessions */}
      {expanded && (
        <div className="ml-4">
          {visibleSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              active={session.id === activeId}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}

          {/* Expand button */}
          {hasMore && (
            <button
              onClick={() => onExpand(group)}
              className="w-full flex items-center justify-center gap-1 px-2 py-1 text-xs hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
              style={{ color: 'var(--vscode-descriptionForeground)' }}
            >
              <span>+{group.sessions.length - MAX_SESSIONS_PER_GROUP} 更多</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────
// New Task Modal (select workspace + task name)
// ────────────────────────────────────────────────

function NewTaskModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string, workspace: string) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');

  const handleSelectDir = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('agent.selectWorkspace'),
      });
      if (selected && typeof selected === 'string') {
        setWorkspace(selected);
        setWorkspaceName(selected.split('/').pop() || selected);
      }
    } catch (e) {
      console.error('Failed to open directory picker:', e);
    }
  }, [t]);

  const handleCreate = useCallback(() => {
    if (!title.trim() || !workspace) return;
    onCreate(title.trim(), workspace);
    onClose();
  }, [title, workspace, onCreate, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-xl w-[420px] overflow-hidden flex flex-col"
        style={{
          background: 'var(--vscode-menu-background)',
          border: '1px solid var(--vscode-menu-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--vscode-widget-border)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>
            {t('agent.newTask')}
          </span>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          >
            <X className="w-3.5 h-3.5" style={{ color: 'var(--vscode-foreground)' }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Task name */}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--vscode-foreground)' }}>
              {t('agent.taskName')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('agent.taskNamePlaceholder')}
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={{
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
              }}
              autoFocus
            />
          </div>

          {/* Workspace selector */}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--vscode-foreground)' }}>
              {t('agent.workspace')}
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleSelectDir}
                className="flex-1 flex items-center gap-2 rounded px-3 py-2 text-sm transition-colors"
                style={{
                  background: 'var(--vscode-input-background)',
                  border: '1px solid var(--vscode-input-border)',
                  color: workspace ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)',
                }}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span className="truncate">
                  {workspace ? workspaceName : t('agent.selectWorkspace')}
                </span>
              </button>
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--vscode-descriptionForeground)' }}>
              {t('agent.workspaceHint')}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2 px-4 py-3 border-t"
          style={{ borderColor: 'var(--vscode-widget-border)' }}
        >
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-sm transition-colors"
            style={{
              background: 'var(--vscode-button-secondaryBackground)',
              color: 'var(--vscode-button-secondaryForeground)',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || !workspace}
            className="px-3 py-1.5 rounded text-sm transition-colors disabled:opacity-40"
            style={{
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
            }}
          >
            {t('agent.createTask')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Session List (sidebar)
// ────────────────────────────────────────────────

function AgentSessionList({
  onSelect,
  activeId,
  onDelete,
}: {
  onSelect: (id: string) => void;
  activeId: string | null;
  onDelete: (id: string) => void;
}) {
  const sessions = useStore((s) => s.agentSessions);
  const createAgentSession = useStore((s) => s.createAgentSession);
  const { t } = useI18n();
  const [expandGroup, setExpandGroup] = useState<WorkspaceGroup | null>(null);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);

  const handleCreateTask = useCallback(async (title: string, workspace: string) => {
    try {
      const id = await createAgentSession(title, workspace);
      onSelect(id);
    } catch (e) {
      console.error('Failed to create task:', e);
    }
  }, [createAgentSession, onSelect]);

  const groups = groupSessionsByWorkspace(sessions);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header + new task button */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--vscode-widget-border)' }}
      >
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--vscode-descriptionForeground)' }}
        >
          {t('agent.tasks')}
        </span>
        <button
          onClick={() => setShowNewTaskModal(true)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
          style={{
            background: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
          }}
          title={t('agent.newTask')}
        >
          <Plus className="w-3 h-3" />
          <span>{t('agent.newTask')}</span>
        </button>
      </div>

      {/* Workspace groups */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-3">
            <span className="text-xs" style={{ color: 'var(--vscode-descriptionForeground)' }}>
              {t('agent.noTasks')}
            </span>
            <button
              onClick={() => setShowNewTaskModal(true)}
              className="text-xs px-3 py-1.5 rounded transition-colors"
              style={{
                background: 'var(--vscode-button-background)',
                color: 'var(--vscode-button-foreground)',
              }}
            >
              {t('agent.createFirstTask')}
            </button>
          </div>
        ) : (
          groups.map((group) => (
            <WorkspaceGroupItem
              key={group.workspace}
              group={group}
              activeId={activeId}
              onSelect={onSelect}
              onDelete={onDelete}
              onExpand={setExpandGroup}
            />
          ))
        )}
      </div>

      {/* Expand modal */}
      {expandGroup && (
        <ExpandModal
          group={expandGroup}
          activeId={activeId}
          onSelect={onSelect}
          onDelete={onDelete}
          onClose={() => setExpandGroup(null)}
        />
      )}

      {/* New task modal */}
      {showNewTaskModal && (
        <NewTaskModal
          onClose={() => setShowNewTaskModal(false)}
          onCreate={handleCreateTask}
        />
      )}
    </div>
  );
}

function SessionItem({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: AgentSession;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className={`group flex items-center gap-2 px-2 py-1 cursor-pointer text-sm transition-colors ${
        active ? 'bg-[var(--vscode-list-activeSelectionBackground)]' : 'hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
      style={{ color: active ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)' }}
      onClick={() => onSelect(session.id)}
    >
      <MessageSquare className="w-3 h-3 shrink-0 opacity-60" />
      <span className="truncate flex-1 text-xs">
        {session.title || session.messages[0]?.content.slice(0, 30) || '...'}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirmDelete) {
            onDelete(session.id);
            setConfirmDelete(false);
          } else {
            setConfirmDelete(true);
            setTimeout(() => setConfirmDelete(false), 2000);
          }
        }}
        className="shrink-0 opacity-0 group-hover:opacity-100 flex items-center justify-center w-4 h-4 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-opacity"
        title={t('agent.deleteSession')}
      >
        <Trash2 className="w-2.5 h-2.5" style={{ color: confirmDelete ? 'var(--vscode-errorForeground)' : 'var(--vscode-foreground)' }} />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────
// Chat Area
// ────────────────────────────────────────────────

function ChatArea({ session }: { session: AgentSession }) {
  const { t } = useI18n();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');

  const sendAgentMessage = useStore((s) => s.sendAgentMessage);
  const cancelAgent = useStore((s) => s.cancelAgent);
  const submitAgentToolResult = useStore((s) => s.submitAgentToolResult);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages, session.streamingContent]);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    // Like remote: don't check runState - backend handles queueing
    sendAgentMessage(session.id, input.trim());
    setInput('');
  }, [input, session.id, sendAgentMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const isRunning = session.runState !== 'idle' && session.runState !== 'done' && session.runState !== 'error' && session.runState !== 'cancelled';

  return (
    <div className="flex flex-col h-full w-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
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
          />
        )}

        {/* Status indicator */}
        {session.runState === 'thinking' && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--vscode-descriptionForeground)' }}>
            <span className="animate-pulse">{t('agent.thinking')}</span>
          </div>
        )}
        {session.runState === 'compacting' && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--vscode-descriptionForeground)' }}>
            <span>{t('agent.compacting')}</span>
          </div>
        )}
        {session.runState === 'retrying' && session.retryInfo && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--vscode-descriptionForeground)' }}>
            <span>{t('agent.retrying')} ({session.retryInfo.attempt}/{session.retryInfo.maxAttempts})</span>
          </div>
        )}
        {session.runState === 'error' && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--vscode-errorForeground)' }}>
            <span>{t('agent.error')}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        className="shrink-0 px-4 py-3 border-t"
        style={{ borderColor: 'var(--vscode-widget-border)' }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRunning ? t('agent.appendMessage') : t('agent.inputPlaceholder')}
            rows={1}
            className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none transition-colors"
            style={{
              background: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border)',
              maxHeight: '120px',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-30"
            style={{ background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }}
            title={t('agent.send')}
          >
            <Send className="w-4 h-4" />
          </button>
          {isRunning && (
            <button
              onClick={() => cancelAgent(session.id)}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
              style={{ background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)' }}
              title={t('agent.cancel')}
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Message Bubble
// ────────────────────────────────────────────────

function MessageBubble({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  if (isTool) {
    return (
      <div className="flex justify-start px-2 py-1">
        <div
          className="rounded-lg px-3 py-2 text-xs max-w-[80%] overflow-x-auto"
          style={{
            background: 'var(--vscode-editor-background)',
            border: '1px solid var(--vscode-widget-border)',
            color: 'var(--vscode-descriptionForeground)',
          }}
        >
          <div className="font-medium mb-1" style={{ color: 'var(--vscode-foreground)' }}>
            Tool Result
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono">{message.content}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-2 py-1`}>
      <div
        className={`rounded-lg px-3 py-2 text-sm max-w-[80%] overflow-x-auto ${
          isUser ? '' : ''
        }`}
        style={{
          background: isUser
            ? 'var(--vscode-button-background)'
            : 'var(--vscode-editor-background)',
          color: isUser
            ? 'var(--vscode-button-foreground)'
            : 'var(--vscode-editor-foreground)',
          border: isUser ? 'none' : '1px solid var(--vscode-widget-border)',
        }}
      >
        {/* Reasoning content (collapsible) */}
        {message.reasoningContent && (
          <details className="mb-2">
            <summary className="text-xs cursor-pointer" style={{ color: 'var(--vscode-descriptionForeground)' }}>
              Thinking...
            </summary>
            <div className="mt-1 text-xs whitespace-pre-wrap opacity-70" style={{ color: 'var(--vscode-descriptionForeground)' }}>
              {message.reasoningContent}
            </div>
          </details>
        )}

        {/* Main content — user shows plain text, assistant renders markdown */}
        {isUser ? (
          <div className={`whitespace-pre-wrap break-words ${isStreaming && !message.content ? 'animate-pulse' : ''}`}>
            {message.content || (isStreaming ? '' : '')}
          </div>
        ) : (
          <MarkdownMessage>{message.content}</MarkdownMessage>
        )}
        
        {/* Streaming cursor */}
        {isStreaming && !message.content && (
          <span className="animate-pulse">▋</span>
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
}: {
  toolCalls: ToolCallItem[];
  sessionId: string;
  onApprove: (
    sessionId: string,
    toolCallId: string,
    result: string,
    isError: boolean,
  ) => void;
}) {
  const { t } = useI18n();

  const handleApprove = (tc: ToolCallItem) => {
    onApprove(sessionId, tc.id, JSON.stringify({ approved: true }), false);
  };

  return (
    <div
      className="rounded-lg px-3 py-2 max-w-[80%]"
      style={{
        background: 'var(--vscode-menu-background)',
        border: '1px solid var(--vscode-menu-border)',
      }}
    >
      <div className="text-xs font-medium mb-2" style={{ color: 'var(--vscode-foreground)' }}>
        {t('agent.toolCall')}
      </div>
      {toolCalls.map((tc) => (
        <div key={tc.id} className="flex items-start gap-2 mb-2 last:mb-0">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono" style={{ color: 'var(--vscode-textPreformat-foreground)' }}>
              {tc.name}
            </div>
            <pre className="text-xs mt-1 whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-32"
              style={{ color: 'var(--vscode-descriptionForeground)' }}
            >
              {tc.arguments}
            </pre>
          </div>
          <button
            onClick={() => handleApprove(tc)}
            className="shrink-0 px-2 py-1 rounded text-xs transition-colors"
            style={{
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
            }}
          >
            {t('agent.approveTool')}
          </button>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────
// Run State Indicator
// ────────────────────────────────────────────────

function RunStateBadge({ state }: { state: AgentRunState }) {
  const { t } = useI18n();

  if (state === 'idle' || state === 'done') return null;

  const labels: Record<string, string> = {
    thinking: t('agent.thinking'),
    streaming: t('agent.streaming'),
    tool_call: t('agent.toolCall'),
    compacting: t('agent.compacting'),
    retrying: t('agent.retrying'),
    error: t('agent.error'),
    cancelled: t('agent.cancelled'),
  };

  const isError = state === 'error';
  const isActive = state === 'thinking' || state === 'streaming' || state === 'tool_call';

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
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--vscode-terminal-ansiBlue)' }} />
      )}
      {labels[state] ?? state}
    </span>
  );
}

// ────────────────────────────────────────────────
// Main Panel
// ────────────────────────────────────────────────

export default function AgentPanel({ hidden }: { hidden?: boolean }) {
  const agentSessions = useStore((s) => s.agentSessions);
  const activeAgentSessionId = useStore((s) => s.activeAgentSessionId);
  const openAgentSession = useStore((s) => s.openAgentSession);
  const deleteAgentSession = useStore((s) => s.deleteAgentSession);
  const initAgentSessions = useStore((s) => s.initAgentSessions);
  const { t } = useI18n();

  // Init sessions on mount
  useEffect(() => {
    initAgentSessions();
  }, [initAgentSessions]);

  const activeSession = agentSessions.find((s) => s.id === activeAgentSessionId);

  return (
    <div
      className={`w-full h-full flex overflow-hidden ${hidden ? 'hidden' : ''}`}
      style={{ background: 'var(--vscode-editor-background)' }}
    >
      {/* Left sidebar — session list */}
      <div
        className="shrink-0 border-r flex flex-col"
        style={{ width: '220px', borderColor: 'var(--vscode-widget-border)' }}
      >
        <AgentSessionList
          onSelect={openAgentSession}
          activeId={activeAgentSessionId}
          onDelete={deleteAgentSession}
        />
      </div>

      {/* Right main — chat area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header bar */}
        <div
          className="shrink-0 flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: 'var(--vscode-widget-border)' }}
        >
          <div className="flex items-center gap-2">
            {activeSession?.workspace && activeSession.workspace !== 'default' && (
              <FolderOpen className="w-3 h-3" style={{ color: 'var(--vscode-descriptionForeground)' }} />
            )}
            <span className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>
              {activeSession?.title || (
                <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
                  {activeSession ? activeSession.messages[0]?.content.slice(0, 40) || 'New Session' : ''}
                </span>
              )}
            </span>
          </div>
          {activeSession && <RunStateBadge state={activeSession.runState} />}
        </div>

        {/* Chat or empty state */}
        <div className="flex-1 min-h-0">
          {activeSession ? (
            <ChatArea session={activeSession} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-sm" style={{ color: 'var(--vscode-descriptionForeground)' }}>
                {t('agent.noTasks')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}