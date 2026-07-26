import { useState, useCallback } from 'react';
import { useI18n, type TranslationKey } from '../../lib/core/i18n';
import { FolderOpen, MessageSquare, Plus, Trash2, ChevronRight, Bot } from 'lucide-react';
import { NavBranch, NavRow } from '../ui/NavTree';
import { MenuList, MenuItem, MenuDivider } from '../ui/MenuList';
import type { AgentSession } from '../../types/agent';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

/** Format epoch-seconds timestamp to a relative time string. */
function formatRelativeTime(epochSec: number, t: (key: TranslationKey, vars?: Record<string, string | number>) => string): string {
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
  return ['thinking', 'streaming', 'tool_call', 'plan_review', 'compacting', 'retrying'].includes(session.runState);
}

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export interface WorkspaceGroup {
  workspace: string; // path or 'default' for no workspace
  displayName: string; // folder name
  sessions: AgentSession[];
}

// ──────────────────────────────────────────────────────────────────
// WorkspaceList Component
// ──────────────────────────────────────────────────────────────────

interface WorkspaceListProps {
  groups: WorkspaceGroup[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onExpand: (group: WorkspaceGroup) => void;
  onCreateInWorkspace: (workspace: string) => void;
  maxSessionsPerGroup?: number;
}

export function WorkspaceList({
  groups,
  activeId,
  onSelect,
  onDelete,
  onExpand,
  onCreateInWorkspace,
  maxSessionsPerGroup = 5,
}: WorkspaceListProps) {
  const { t } = useI18n();

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center gap-3 py-8">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-full"
          style={{ background: 'var(--vscode-editor-inactiveSelectionBackground)' }}
        >
          <Bot className="w-5 h-5 text-[var(--vscode-descriptionForeground)] opacity-50" />
        </div>
        <span className="text-xs text-[var(--vscode-descriptionForeground)] opacity-60">
          {t('agent.noTasks')}
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-0.5">
      {groups.map((group) => (
        <WorkspaceGroupItem
          key={group.workspace}
          group={group}
          activeId={activeId}
          onSelect={onSelect}
          onDelete={onDelete}
          onExpand={onExpand}
          onCreateInWorkspace={onCreateInWorkspace}
          maxSessions={maxSessionsPerGroup}
        />
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// WorkspaceGroupItem
// ──────────────────────────────────────────────────────────────────

interface WorkspaceGroupItemProps {
  group: WorkspaceGroup;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onExpand: (group: WorkspaceGroup) => void;
  onCreateInWorkspace: (workspace: string) => void;
  maxSessions: number;
}

function WorkspaceGroupItem({
  group,
  activeId,
  onSelect,
  onDelete,
  onExpand,
  onCreateInWorkspace,
  maxSessions,
}: WorkspaceGroupItemProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const visibleSessions = group.sessions.slice(0, maxSessions);
  const hasMore = group.sessions.length > maxSessions;

  // Check if any session in this group is active
  const hasActiveSession = group.sessions.some((s) => s.id === activeId);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="mb-1">
      {/* Group header — use NavRow primary level */}
      <NavRow
        level="primary"
        active={hasActiveSession}
        icon={<FolderOpen className="w-4 h-4 opacity-70 shrink-0" />}
        expandable
        expanded={expanded}
        onClick={(e) => {
          // If context menu is open, don't toggle
          if (contextMenu) return;
          setExpanded(!expanded);
        }}
        onContextMenu={handleContextMenu}
      >
        <span className="flex-1 truncate">{group.displayName}</span>
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 mr-2"
          style={{
            background: 'var(--vscode-badge-background)',
            color: 'var(--vscode-badge-foreground)',
          }}
        >
          {group.sessions.length}
        </span>
      </NavRow>

      {/* Sessions — wrapped in NavBranch for guide line */}
      {expanded && (
        <NavBranch className="mt-0.5 mb-1 ml-[18px]">
          {visibleSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              active={session.id === activeId}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}

          {/* Expand button for more sessions */}
          {hasMore && (
            <NavRow
              level="secondary"
              onClick={() => onExpand(group)}
              icon={<span className="text-xs text-[var(--vscode-descriptionForeground)]">+{group.sessions.length - maxSessions}</span>}
            >
              {t('agent.moreSessions')}
            </NavRow>
          )}
        </NavBranch>
      )}

      {/* Context menu for workspace group */}
      {contextMenu && (
        <WorkspaceGroupMenu
          x={contextMenu.x}
          y={contextMenu.y}
          workspace={group.workspace}
          onCreateSession={() => {
            onCreateInWorkspace(group.workspace);
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
  onCreateSession: () => void;
  onClose: () => void;
}

function WorkspaceGroupMenu({ x, y, workspace, onCreateSession, onClose }: WorkspaceGroupMenuProps) {
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
    </MenuList>
  );
}

// ──────────────────────────────────────────────────────────────────
// SessionItem
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

  const title = session.title || session.messages[0]?.content.slice(0, 30) || '...';
  const running = isSessionRunning(session);
  const relTime = formatRelativeTime(session.updatedAt, t);

  return (
    <NavRow
      level="primary"
      active={active}
      icon={
        <div className="relative shrink-0">
          <MessageSquare className="w-4 h-4" style={{ color: 'var(--vscode-descriptionForeground)' }} />
          {running && (
            <span
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
              style={{
                background: 'var(--vscode-charts-blue, #3794ff)',
                boxShadow: '0 0 0 2px var(--vscode-sideBar-background)',
              }}
            />
          )}
        </div>
      }
      onClick={() => onSelect(session.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setConfirmDelete(true);
        setTimeout(() => setConfirmDelete(false), 2000);
      }}
      className={`group ${active ? 'relative before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-3/5 before:w-[2px] before:rounded-full before:bg-[var(--vscode-focusBorder)] before:content-[""]' : ''}`}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-0.5">
        <span className="truncate text-sm">{title}</span>
        <span className="text-[11px] text-[var(--vscode-descriptionForeground)] opacity-70 truncate">
          {running ? t('agent.running') : relTime}
        </span>
      </div>
      {/* Delete button — visible on hover */}
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
        className="shrink-0 opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-opacity"
        title={t('agent.deleteSession')}
      >
        <Trash2
          className="w-3.5 h-3.5"
          style={{
            color: confirmDelete
              ? 'var(--vscode-errorForeground)'
              : 'var(--vscode-foreground)',
          }}
        />
      </button>
    </NavRow>
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
            <span className="text-[var(--vscode-foreground)] opacity-70">✕</span>
          </button>
        </div>

        {/* Session list — use NavRow for consistent styling */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
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