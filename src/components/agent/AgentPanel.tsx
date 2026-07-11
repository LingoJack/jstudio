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
import type { AgentSession, ChatMessage, ToolCallItem, AgentRunState, AgentAskRequest, AskQuestion } from '../../types/agent';

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

  // Only include sessions with workspace (GUI requires workspace)
  for (const session of sessions) {
    if (!session.workspace) continue; // Skip sessions without workspace
    const key = session.workspace;
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
  onCreateInWorkspace,
}: {
  group: WorkspaceGroup;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  activeId: string | null;
  onExpand: (group: WorkspaceGroup) => void;
  onCreateInWorkspace: (workspace: string) => void;
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
          className="text-xs mr-1"
          style={{ color: 'var(--vscode-descriptionForeground)' }}
        >
          {group.sessions.length}
        </span>
        {/* + button to create task in this workspace */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCreateInWorkspace(group.workspace);
          }}
          className="flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title={t('agent.newTask')}
        >
          <Plus className="w-3 h-3" style={{ color: 'var(--vscode-foreground)' }} />
        </button>
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
// New Task Modal (floating glass-style input)
// ────────────────────────────────────────────────

function NewTaskModal({
  onClose,
  onCreate,
  initialWorkspace,
  existingWorkspaces,
}: {
  onClose: () => void;
  onCreate: (title: string, workspace: string) => void;
  initialWorkspace?: string;
  existingWorkspaces?: string[];
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [workspace, setWorkspace] = useState<string | undefined>(initialWorkspace);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);

  // Get display name for workspace
  const workspaceDisplayName = workspace ? workspace.split('/').pop() || workspace : '';

  const handleSelectExisting = useCallback((ws: string) => {
    setWorkspace(ws);
    setShowWorkspacePicker(false);
  }, []);

  const handleSelectNewDir = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('agent.selectWorkspace'),
      });
      if (selected && typeof selected === 'string') {
        setWorkspace(selected);
        setShowWorkspacePicker(false);
      }
    } catch (e) {
      console.error('Failed to open directory picker:', e);
    }
  }, [t]);

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !workspace) return;
    onCreate(title.trim(), workspace);
    onClose();
  }, [title, workspace, onCreate, onClose]);

  // Can submit if title and workspace are set
  const canSubmit = title.trim() && workspace;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          background: 'rgba(60, 60, 60, 0.85)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          width: '400px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input area */}
        <form onSubmit={handleSubmit} className="p-4">
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('agent.taskPlaceholder')}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
            style={{
              background: 'rgba(255,255,255,0.08)',
              color: 'var(--vscode-input-foreground)',
              border: '1px solid rgba(255,255,255,0.1)',
              minHeight: '80px',
            }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSubmit) {
                  handleSubmit(e);
                }
              }
            }}
          />
        </form>

        {/* Bottom bar: workspace selector + submit */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}
        >
          {/* Workspace selector (left) */}
          <div className="relative">
            <button
              onClick={() => setShowWorkspacePicker(!showWorkspacePicker)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{
                background: workspace ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                color: workspace ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)',
              }}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="max-w-[150px] truncate">
                {workspace ? workspaceDisplayName : t('agent.selectWorkspace')}
              </span>
              <ChevronRight
                className={`w-3 h-3 transition-transform ${showWorkspacePicker ? 'rotate-90' : ''}`}
              />
            </button>

            {/* Dropdown picker */}
            {showWorkspacePicker && (
              <div
                className="absolute left-0 bottom-full mb-1 rounded-lg shadow-xl overflow-hidden"
                style={{
                  background: 'rgba(40, 40, 40, 0.95)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  minWidth: '200px',
                }}
              >
                {/* Existing workspaces */}
                {existingWorkspaces?.map((ws) => (
                  <button
                    key={ws}
                    onClick={() => handleSelectExisting(ws)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-[rgba(255,255,255,0.1)] transition-colors"
                    style={{
                      background: workspace === ws ? 'rgba(255,255,255,0.1)' : 'transparent',
                      color: 'var(--vscode-foreground)',
                    }}
                  >
                    <FolderOpen className="w-3.5 h-3.5" style={{ color: 'var(--vscode-descriptionForeground)' }} />
                    <span className="truncate flex-1">{ws.split('/').pop() || ws}</span>
                    {workspace === ws && (
                      <span style={{ color: 'var(--vscode-descriptionForeground)' }}>✓</span>
                    )}
                  </button>
                ))}
                
                {/* Divider */}
                {existingWorkspaces && existingWorkspaces.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }} />
                )}
                
                {/* Open new directory */}
                <button
                  onClick={handleSelectNewDir}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-[rgba(255,255,255,0.1)] transition-colors"
                  style={{ color: 'var(--vscode-foreground)' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('agent.openNewDirectory')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Submit button (right) */}
          <button
            type="submit"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
            style={{
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
            }}
          >
            <Send className="w-3 h-3" />
            <span>{t('agent.createTask')}</span>
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
  const [createWorkspace, setCreateWorkspace] = useState<string | undefined>(undefined);

  const handleCreateTask = useCallback(async (title: string, workspace: string) => {
    try {
      const id = await createAgentSession(title, workspace);
      onSelect(id);
      setShowNewTaskModal(false);
      setCreateWorkspace(undefined);
    } catch (e) {
      console.error('Failed to create task:', e);
    }
  }, [createAgentSession, onSelect]);

  const groups = groupSessionsByWorkspace(sessions);
  
  // Collect existing workspaces for the picker
  const existingWorkspaces = groups.map(g => g.workspace);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Workspace groups (no header bar) */}
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
              onCreateInWorkspace={setCreateWorkspace}
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
          onClose={() => {
            setShowNewTaskModal(false);
            setCreateWorkspace(undefined);
          }}
          onCreate={handleCreateTask}
          initialWorkspace={createWorkspace}
          existingWorkspaces={existingWorkspaces}
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
  const submitAgentPlanDecision = useStore((s) => s.submitAgentPlanDecision);
  const submitAgentAskAnswer = useStore((s) => s.submitAgentAskAnswer);

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

  const isRunning = session.runState !== 'idle' && session.runState !== 'error' && session.runState !== 'cancelled';

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
            onReject={submitAgentToolResult}
            pendingPlan={session.pendingPlan}
            onPlanDecision={submitAgentPlanDecision}
          />
        )}

        {/* Pending Ask request */}
        {session.pendingAsk && (
          <AskConfirm
            askRequest={session.pendingAsk}
            sessionId={session.id}
            onSubmit={submitAgentAskAnswer}
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

  // Tool result message (real output)
  if (isTool) {
    return <ToolResultBubble message={message} />;
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
              {t('agent.thinking')}
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
// Tool Result Bubble (NEW: shows real tool output)
// ────────────────────────────────────────────────

function ToolResultBubble({ message }: { message: ChatMessage }) {
  const { t } = useI18n();
  const isError = message.toolResult?.isError ?? false;
  const status = message.toolResult?.status ?? 'executed';

  // Get status display
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
        
        {/* Content - scrollable for long outputs */}
        <pre 
          className="whitespace-pre-wrap break-words font-mono text-xs overflow-x-auto max-h-48"
          style={{ 
            color: isError 
              ? 'var(--vscode-errorForeground)' 
              : 'var(--vscode-descriptionForeground)' 
          }}
        >
          {message.content}
        </pre>
        
        {/* Images if any */}
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
// Tool Call Confirmation (REWRITTEN: approve/reject + plan review)
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
  onApprove: (
    sessionId: string,
    toolCallId: string,
    result: string,
    isError: boolean,
  ) => void;
  onReject: (
    sessionId: string,
    toolCallId: string,
    result: string,
    isError: boolean,
  ) => void;
  pendingPlan?: { plan: string };
  onPlanDecision?: (
    sessionId: string,
    decision: 'approve' | 'reject' | 'approveAndClearContext',
  ) => void;
}) {
  const { t } = useI18n();
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  // Plan review mode
  if (pendingPlan && toolCalls.some(tc => tc.name === 'ExitPlanMode')) {
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
        <pre className="text-xs mb-3 whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-48"
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
              <span className="text-xs font-mono" style={{ color: 'var(--vscode-textPreformat-foreground)' }}>
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
            
            {/* Arguments (expandable) */}
            {expandedTool === tc.id && (
              <pre className="text-xs mt-1 ml-5 whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-32"
                style={{ color: 'var(--vscode-descriptionForeground)' }}
              >
                {tc.arguments}
              </pre>
            )}
            
            {/* Action buttons */}
            <div className="flex gap-2 mt-2 ml-5">
              <button
                onClick={() => onApprove(sessionId, tc.id, JSON.stringify({ approved: true }), false)}
                className="px-3 py-1 rounded text-xs transition-colors"
                style={{
                  background: 'var(--vscode-button-background)',
                  color: 'var(--vscode-button-foreground)',
                }}
              >
                {t('agent.approveTool')}
              </button>
              <button
                onClick={() => onReject(sessionId, tc.id, JSON.stringify({ approved: false, reason: 'user_rejected' }), true)}
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
// Ask Confirmation (NEW: Ask tool UI)
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
                  answers[idx.toString()] === opt.label ? 'ring-1 ring-[var(--vscode-focusBorder)]' : ''
                }`}
                style={{
                  background: answers[idx.toString()] === opt.label
                    ? 'var(--vscode-button-background)'
                    : 'var(--vscode-button-secondaryBackground)',
                  color: answers[idx.toString()] === opt.label
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
// Run State Indicator
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
  const isActive = state === 'thinking' || state === 'streaming' || state === 'tool_call' || state === 'plan_review';

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