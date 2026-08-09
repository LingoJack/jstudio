import { useState, useCallback, useRef, useEffect } from 'react';
import { useI18n, type TranslationKey } from '../../lib/core/i18n';
import {
  FolderOpen,
  Folder,
  Trash2,
  Bot,
  MessageSquare,
  Brain,
  Loader2,
  Wrench,
  ClipboardCheck,
  RefreshCw,
  AlertCircle,
  Ban,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavRow, NavBranch } from '../ui/NavTree';
import { WorkspaceGroupMenu } from './WorkspaceGroupMenu';
import type { AgentSession, AgentRunState } from '../../types/agent';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/** Format epoch-seconds timestamp to a relative time string. */
function formatRelativeTime(
  epochSec: number,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  const now = Date.now() / 1000;
  const diff = now - epochSec;
  if (diff < 60) return t('agent.justNow');
  if (diff < 3600) return t('agent.minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('agent.hoursAgo', { n: Math.floor(diff / 3600) });
  if (diff < 172800) return t('agent.yesterday');
  return t('agent.daysAgo', { n: Math.floor(diff / 86400) });
}

/** Check if a session is currently running. */
function isSessionRunning(session: AgentSession): boolean {
  return ['thinking', 'streaming', 'tool_call', 'plan_review', 'compacting', 'retrying'].includes(
    session.runState,
  );
}

// ──────────────────────────────────────────────────────────────────
// State Visual Config
// ──────────────────────────────────────────────────────────────────

interface StateVisual {
  color: string;
  icon: LucideIcon;
  spin?: boolean;
  pulse?: boolean;
}

const STATE_VISUALS: Record<AgentRunState, StateVisual> = {
  idle: { color: 'var(--vscode-descriptionForeground)', icon: MessageSquare },
  thinking: { color: '#3794ff', icon: Brain, pulse: true },
  streaming: { color: '#3794ff', icon: Loader2, spin: true },
  tool_call: { color: '#cca700', icon: Wrench, pulse: true },
  plan_review: { color: '#c586c0', icon: ClipboardCheck, pulse: true },
  compacting: { color: 'var(--vscode-descriptionForeground)', icon: Loader2, spin: true },
  retrying: { color: '#cca700', icon: RefreshCw, spin: true },
  error: { color: '#f48771', icon: AlertCircle },
  cancelled: { color: 'var(--vscode-descriptionForeground)', icon: Ban },
};

/** Get a short state label key for display */
function getStateLabelKey(state: AgentRunState): TranslationKey | null {
  switch (state) {
    case 'thinking':
      return 'agent.stateThinking';
    case 'streaming':
      return 'agent.stateStreaming';
    case 'tool_call':
      return 'agent.stateToolCall';
    case 'plan_review':
      return 'agent.statePlanReview';
    case 'compacting':
      return 'agent.stateCompacting';
    case 'retrying':
      return 'agent.stateRetrying';
    case 'error':
      return 'agent.stateError';
    case 'cancelled':
      return 'agent.stateCancelled';
    default:
      return null;
  }
}

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export interface WorkspaceGroup {
  workspace: string;
  displayName: string;
  sessions: AgentSession[];
}

// ──────────────────────────────────────────────────────────────────
// WorkspaceList Component
// ──────────────────────────────────────────────────────────────────

interface WorkspaceListProps {
  groups: WorkspaceGroup[];
  activeId: string | null;
  activeWorkspace: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onExpand: (group: WorkspaceGroup) => void;
  onCreateInWorkspace: (workspace: string) => void;
  onSetWorkspace: (workspace: string) => void;
  maxSessionsPerGroup?: number;
}

export function WorkspaceList({
  groups,
  activeId,
  activeWorkspace,
  onSelect,
  onDelete,
  onExpand,
  onCreateInWorkspace,
  onSetWorkspace,
  maxSessionsPerGroup = 5,
}: WorkspaceListProps) {
  const { t } = useI18n();

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-3 py-12">
        <div
          className="flex items-center justify-center w-12 h-12 rounded-xl"
          style={{
            background: 'var(--vscode-editor-inactiveSelectionBackground)',
          }}
        >
          <Bot
            className="w-6 h-6"
            style={{ color: 'var(--vscode-descriptionForeground)', opacity: 0.4 }}
          />
        </div>
        <span
          className="text-xs"
          style={{ color: 'var(--vscode-descriptionForeground)', opacity: 0.5 }}
        >
          {t('agent.noTasks')}
        </span>
      </div>
    );
  }

  // Split groups: current workspace group vs other groups
  const currentGroup = activeWorkspace
    ? groups.find((g) => g.workspace === activeWorkspace)
    : null;
  const otherGroups = activeWorkspace
    ? groups.filter((g) => g.workspace !== activeWorkspace)
    : groups;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Current workspace sessions - flat list */}
      {currentGroup && currentGroup.sessions.length > 0 && (
        <div className="mb-3">
          <SectionLabel>{t('agent.recentTasks')}</SectionLabel>
          <div className="space-y-0.5">
            {currentGroup.sessions.slice(0, maxSessionsPerGroup).map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                active={session.id === activeId}
                onSelect={onSelect}
                onDelete={onDelete}
              />
            ))}
            {currentGroup.sessions.length > maxSessionsPerGroup && (
              <MoreButton
                count={currentGroup.sessions.length - maxSessionsPerGroup}
                onClick={() => onExpand(currentGroup)}
              />
            )}
          </div>
        </div>
      )}

      {/* Other workspaces - collapsible groups */}
      {otherGroups.length > 0 && (
        <div className={currentGroup ? 'mt-3' : ''}>
          {currentGroup && <SectionLabel>{t('agent.otherWorkspaces')}</SectionLabel>}
          <div className="space-y-0.5">
            {otherGroups.map((group) => (
              <WorkspaceGroupItem
                key={group.workspace}
                group={group}
                activeId={activeId}
                isActiveWorkspace={false}
                onSelect={onSelect}
                onDelete={onDelete}
                onExpand={onExpand}
                onCreateInWorkspace={onCreateInWorkspace}
                onSetWorkspace={onSetWorkspace}
                maxSessions={maxSessionsPerGroup}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// SectionLabel
// ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 select-none">
      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--vscode-descriptionForeground)' }}
      >
        {children}
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: 'var(--vscode-widget-border, rgba(128,128,128,0.15))' }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// MoreButton
// ──────────────────────────────────────────────────────────────────

function MoreButton({ count, onClick }: { count: number; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] rounded-md transition-colors hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-descriptionForeground)]"
    >
      <span className="font-medium">+{count}</span>
      <span className="opacity-60">{t('agent.moreSessions')}</span>
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────
// WorkspaceGroupItem
// ──────────────────────────────────────────────────────────────────

interface WorkspaceGroupItemProps {
  group: WorkspaceGroup;
  activeId: string | null;
  isActiveWorkspace: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onExpand: (group: WorkspaceGroup) => void;
  onCreateInWorkspace: (workspace: string) => void;
  onSetWorkspace: (workspace: string) => void;
  maxSessions: number;
}

function WorkspaceGroupItem({
  group,
  activeId,
  isActiveWorkspace,
  onSelect,
  onDelete,
  onExpand,
  onCreateInWorkspace,
  onSetWorkspace,
  maxSessions,
}: WorkspaceGroupItemProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const hasActiveSession = group.sessions.some((s) => s.id === activeId);
  const visibleSessions = group.sessions.slice(0, maxSessions);
  const hasMore = group.sessions.length > maxSessions;
  const runningCount = group.sessions.filter(isSessionRunning).length;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div>
      {/* Group header */}
      <NavRow
        level="primary"
        active={hasActiveSession}
        noHover
        expandable
        expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onContextMenu={handleContextMenu}
        icon={expanded
          ? <FolderOpen className="w-5 h-5 opacity-70 shrink-0" />
          : <Folder className="w-5 h-5 opacity-70 shrink-0" />
        }
      >
        <span className="flex-1 truncate">{group.displayName}</span>
        {runningCount > 0 && (
          <span
            className="shrink-0 w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: '#3794ff' }}
          />
        )}
        <span
          className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
            hasActiveSession
              ? 'bg-[rgba(255,255,255,0.15)] text-[var(--vscode-list-activeSelectionForeground)]'
              : 'bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]'
          }`}
        >
          {group.sessions.length}
        </span>
      </NavRow>

      {/* Sessions – indentation only, no guide line */}
      {expanded && (
        <NavBranch plain className="mt-0.5 mb-1 ml-[18px]">
          {visibleSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              active={session.id === activeId}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
          {hasMore && (
            <MoreButton
              count={group.sessions.length - maxSessions}
              onClick={() => onExpand(group)}
            />
          )}
        </NavBranch>
      )}

      {/* Context menu */}
      {contextMenu && (
        <WorkspaceGroupMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isActiveWorkspace={isActiveWorkspace}
          onCreateSession={() => {
            onCreateInWorkspace(group.workspace);
            setContextMenu(null);
          }}
          onSetWorkspace={() => {
            onSetWorkspace(group.workspace);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// SessionItem - aligned with NavRow visual language
// ──────────────────────────────────────────────────────────────────

interface SessionItemProps {
  session: AgentSession;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SessionItem({ session, active, onSelect, onDelete }: SessionItemProps) {
  const { t } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const title = session.title || session.messages[0]?.content.slice(0, 30) || '...';
  const running = isSessionRunning(session);
  const relTime = formatRelativeTime(session.updatedAt, t);
  const stateVisual = STATE_VISUALS[session.runState] || STATE_VISUALS.idle;
  const StateIcon = stateVisual.icon;
  const stateLabelKey = getStateLabelKey(session.runState);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  const triggerConfirm = () => {
    setConfirmDelete(true);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDelete(false), 2500);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete(session.id);
    } else {
      triggerConfirm();
    }
  };

  return (
    <div
      onClick={() => onSelect(session.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerConfirm();
      }}
      className={`group relative flex items-center gap-3 px-3 py-1.5 rounded-md cursor-pointer transition-colors duration-150 ${
        active
          ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)] font-medium'
          : 'text-[var(--vscode-sideBar-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
    >
      {/* Status icon */}
      <span className="shrink-0 relative w-4 h-4 flex items-center justify-center">
        <StateIcon
          className={`w-4 h-4 ${stateVisual.spin ? 'animate-spin' : ''}`}
          style={{ color: active ? 'var(--vscode-list-activeSelectionForeground)' : stateVisual.color }}
        />
        {stateVisual.pulse && (
          <span
            className="absolute inset-0 rounded-md animate-ping opacity-30"
            style={{ background: stateVisual.color }}
          />
        )}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span
          className={`truncate text-xs font-medium leading-tight ${
            active
              ? 'text-[var(--vscode-list-activeSelectionForeground)]'
              : 'text-[var(--vscode-foreground)]'
          }`}
        >
          {title}
        </span>
        <div className="flex items-center gap-1.5">
          {running && (
            <span
              className="shrink-0 w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: stateVisual.color }}
            />
          )}
          <span
            className={`text-[10px] truncate ${
              active
                ? 'text-[var(--vscode-list-activeSelectionForeground)] opacity-80'
                : 'text-[var(--vscode-descriptionForeground)] opacity-60'
            }`}
          >
            {stateLabelKey ? t(stateLabelKey) : relTime}
          </span>
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        className={`shrink-0 flex items-center justify-center w-5 h-5 rounded transition-all hover:bg-[var(--vscode-toolbar-hoverBackground)] ${
          confirmDelete ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{
          background: confirmDelete ? 'rgba(244, 135, 113, 0.15)' : undefined,
        }}
        title={confirmDelete ? t('agent.confirmDelete') : t('agent.deleteSession')}
      >
        {confirmDelete ? (
          <AlertCircle className="w-3.5 h-3.5" style={{ color: 'var(--vscode-errorForeground)' }} />
        ) : (
          <Trash2
            className="w-3.5 h-3.5"
            style={{ color: active ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)' }}
          />
        )}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Helper: Group sessions by workspace
// ──────────────────────────────────────────────────────────────────

export function groupSessionsByWorkspace(sessions: AgentSession[]): WorkspaceGroup[] {
  const groups = new Map<string, AgentSession[]>();

  for (const session of sessions) {
    if (!session.workspace) continue;
    const key = session.workspace;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(session);
  }

  for (const [, groupSessions] of groups) {
    groupSessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

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
