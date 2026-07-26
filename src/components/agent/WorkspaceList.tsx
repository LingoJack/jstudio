import { useState, useCallback, useRef, useEffect } from 'react';
import { useI18n, type TranslationKey } from '../../lib/core/i18n';
import {
  FolderOpen,
  Folder,
  Plus,
  Trash2,
  ChevronRight,
  Bot,
  MessageSquare,
  Brain,
  Loader2,
  Wrench,
  ClipboardCheck,
  RefreshCw,
  AlertCircle,
  Ban,
  CheckCircle2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MenuList, MenuItem, MenuDivider } from '../ui/MenuList';
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
          className="flex items-center justify-center w-12 h-12 rounded-2xl"
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
          <div className="space-y-1 px-1.5">
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
          <div className="space-y-1 px-1.5">
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
      className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] rounded-md transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
      style={{ color: 'var(--vscode-descriptionForeground)' }}
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
      <button
        onClick={() => setExpanded(!expanded)}
        onContextMenu={handleContextMenu}
        className="group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all"
        style={{
          background: hasActiveSession
            ? 'var(--vscode-list-activeSelectionBackground)'
            : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!hasActiveSession) {
            e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
          }
        }}
        onMouseLeave={(e) => {
          if (!hasActiveSession) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {/* Folder icon in a rounded square */}
        <div
          className="shrink-0 flex items-center justify-center w-6 h-6 rounded-md transition-colors"
          style={{
            background: hasActiveSession
              ? 'rgba(255,255,255,0.12)'
              : 'var(--vscode-editor-inactiveSelectionBackground)',
          }}
        >
          <FolderOpen
            className="w-3.5 h-3.5"
            style={{
              color: hasActiveSession
                ? 'var(--vscode-list-activeSelectionForeground)'
                : 'var(--vscode-descriptionForeground)',
            }}
          />
        </div>

        {/* Folder name */}
        <span
          className="flex-1 text-left text-xs font-medium truncate"
          style={{
            color: hasActiveSession
              ? 'var(--vscode-list-activeSelectionForeground)'
              : 'var(--vscode-foreground)',
          }}
        >
          {group.displayName}
        </span>

        {/* Running indicator */}
        {runningCount > 0 && (
          <span
            className="shrink-0 w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: '#3794ff' }}
          />
        )}

        {/* Count badge */}
        <span
          className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
          style={{
            background: hasActiveSession
              ? 'rgba(255,255,255,0.15)'
              : 'var(--vscode-badge-background)',
            color: hasActiveSession
              ? 'var(--vscode-list-activeSelectionForeground)'
              : 'var(--vscode-badge-foreground)',
          }}
        >
          {group.sessions.length}
        </span>

        {/* Expand chevron */}
        <ChevronRight
          className="w-3 h-3 shrink-0 transition-transform duration-200"
          style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            color: hasActiveSession
              ? 'var(--vscode-list-activeSelectionForeground)'
              : 'var(--vscode-descriptionForeground)',
            opacity: 0.6,
          }}
        />
      </button>

      {/* Sessions */}
      {expanded && (
        <div className="mt-0.5 ml-[15px] pl-3 space-y-1" style={{ borderLeft: '1px solid var(--vscode-widget-border, rgba(128,128,128,0.12))' }}>
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
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <WorkspaceGroupMenu
          x={contextMenu.x}
          y={contextMenu.y}
          workspace={group.workspace}
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
// WorkspaceGroupMenu
// ──────────────────────────────────────────────────────────────────

interface WorkspaceGroupMenuProps {
  x: number;
  y: number;
  workspace: string;
  isActiveWorkspace: boolean;
  onCreateSession: () => void;
  onSetWorkspace: () => void;
  onClose: () => void;
}

function WorkspaceGroupMenu({
  isActiveWorkspace,
  onCreateSession,
  onSetWorkspace,
  onClose,
  x,
  y,
}: WorkspaceGroupMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList x={x} y={y} onClick={(e) => e.stopPropagation()}>
      <MenuItem
        icon={<Plus className="w-4 h-4" />}
        onClick={() => {
          onCreateSession();
          onClose();
        }}
      >
        {t('agent.newTask')}
      </MenuItem>
      <MenuDivider />
      <MenuItem
        icon={<FolderOpen className="w-4 h-4" />}
        disabled={isActiveWorkspace}
        onClick={() => {
          onSetWorkspace();
          onClose();
        }}
      >
        {t('agent.setAsCurrentWorkspace')}
      </MenuItem>
    </MenuList>
  );
}

// ──────────────────────────────────────────────────────────────────
// SessionItem - Card-style with rich status indicators
// ──────────────────────────────────────────────────────────────────

interface SessionItemProps {
  session: AgentSession;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function SessionItem({ session, active, onSelect, onDelete }: SessionItemProps) {
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
      className="group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150"
      style={{
        background: active
          ? 'var(--vscode-list-activeSelectionBackground)'
          : running
            ? 'rgba(55, 148, 255, 0.06)'
            : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = running
            ? 'rgba(55, 148, 255, 0.1)'
            : 'var(--vscode-list-hoverBackground)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = running
            ? 'rgba(55, 148, 255, 0.06)'
            : 'transparent';
        }
      }}
    >
      {/* Active left accent bar */}
      {active && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-3/5 rounded-r-full"
          style={{ background: 'var(--vscode-focusBorder)' }}
        />
      )}

      {/* Status icon */}
      <div className="shrink-0 relative flex items-center justify-center w-7 h-7 rounded-lg" style={{
        background: active ? 'rgba(255,255,255,0.1)' : 'var(--vscode-editor-inactiveSelectionBackground)',
      }}>
        <StateIcon
          className={`w-3.5 h-3.5 ${stateVisual.spin ? 'animate-spin' : ''}`}
          style={{ color: active ? 'var(--vscode-list-activeSelectionForeground)' : stateVisual.color }}
        />
        {/* Pulse ring for certain states */}
        {stateVisual.pulse && (
          <span
            className="absolute inset-0 rounded-lg animate-ping opacity-30"
            style={{ background: stateVisual.color }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span
          className="truncate text-xs font-medium leading-tight"
          style={{
            color: active
              ? 'var(--vscode-list-activeSelectionForeground)'
              : 'var(--vscode-foreground)',
          }}
        >
          {title}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Running dot */}
          {running && (
            <span
              className="shrink-0 w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: stateVisual.color }}
            />
          )}
          <span
            className="text-[10px] truncate"
            style={{
              color: active
                ? 'var(--vscode-list-activeSelectionForeground)'
                : 'var(--vscode-descriptionForeground)',
              opacity: active ? 0.8 : 0.6,
            }}
          >
            {stateLabelKey ? t(stateLabelKey) : relTime}
          </span>
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-md transition-all ${
          confirmDelete ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{
          background: confirmDelete ? 'rgba(244, 135, 113, 0.15)' : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!confirmDelete) {
            e.currentTarget.style.background = 'var(--vscode-toolbar-hoverBackground)';
          }
        }}
        onMouseLeave={(e) => {
          if (!confirmDelete) {
            e.currentTarget.style.background = 'transparent';
          }
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
// ExpandModal
// ──────────────────────────────────────────────────────────────────

interface ExpandModalProps {
  group: WorkspaceGroup;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function WorkspaceExpandModal({
  group,
  activeId,
  onSelect,
  onDelete,
  onClose,
}: ExpandModalProps) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl w-[420px] max-h-[80vh] overflow-hidden flex flex-col"
        style={{
          background: 'var(--vscode-menu-background)',
          border: '1px solid var(--vscode-menu-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--vscode-widget-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center w-7 h-7 rounded-lg"
              style={{ background: 'var(--vscode-editor-inactiveSelectionBackground)' }}
            >
              <FolderOpen className="w-4 h-4" style={{ color: 'var(--vscode-foreground)' }} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>
                {group.displayName}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--vscode-descriptionForeground)' }}>
                {group.sessions.length} {t('agent.moreSessions')}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            style={{ color: 'var(--vscode-foreground)' }}
          >
            <span className="opacity-60 text-sm">✕</span>
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {group.sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              active={session.id === activeId}
              onSelect={(id) => {
                onSelect(id);
                onClose();
              }}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
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
