/**
 * AgentSidebar — 左侧边栏组件
 * 
 * 结构（参考 WorkBuddy 设计）：
 * - 功能菜单：新建任务、助理、技能等
 * - 空间管理：workspace 列表（可折叠）
 * - 任务历史：按 workspace 分组的 session 列表
 */

import { useState, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import {
  Plus,
  Sparkles,
  Puzzle,
  Zap,
  MoreHorizontal,
  FolderOpen,
} from 'lucide-react';
import {
  WorkspaceList,
  WorkspaceExpandModal,
  groupSessionsByWorkspace,
  type WorkspaceGroup,
} from './WorkspaceList';

// ────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────

const MAX_SESSIONS_PER_GROUP = 5;

// ────────────────────────────────────────────────
// Workspace Select Modal (简化版：只选择 workspace)
// ────────────────────────────────────────────────

interface WorkspaceSelectModalProps {
  onClose: () => void;
  onCreate: (workspace: string) => void;
  initialWorkspace?: string;
  existingWorkspaces?: string[];
}

function WorkspaceSelectModal({
  onClose,
  onCreate,
  initialWorkspace,
  existingWorkspaces,
}: WorkspaceSelectModalProps) {
  const { t } = useI18n();
  const [workspace, setWorkspace] = useState<string | undefined>(initialWorkspace);

  const handleSelectExisting = useCallback((ws: string) => {
    setWorkspace(ws);
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
      }
    } catch (e) {
      console.error('Failed to open directory picker:', e);
    }
  }, [t]);

  const handleCreate = useCallback(() => {
    if (!workspace) return;
    onCreate(workspace);
    onClose();
  }, [workspace, onCreate, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--vscode-menu-background)',
          border: '1px solid var(--vscode-menu-border)',
          width: '320px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-4 py-3 text-sm font-medium"
          style={{
            color: 'var(--vscode-foreground)',
            borderBottom: '1px solid var(--vscode-widget-border)',
          }}
        >
          {t('agent.selectWorkspace')}
        </div>

        {/* Workspace list */}
        <div className="p-2 space-y-1">
          {existingWorkspaces?.map((ws) => (
            <button
              key={ws}
              onClick={() => handleSelectExisting(ws)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors"
              style={{
                background:
                  workspace === ws ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                color:
                  workspace === ws
                    ? 'var(--vscode-list-activeSelectionForeground)'
                    : 'var(--vscode-foreground)',
              }}
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1">{ws.split('/').pop() || ws}</span>
              {workspace === ws && <span className="opacity-60">✓</span>}
            </button>
          ))}

          {/* Divider */}
          {existingWorkspaces && existingWorkspaces.length > 0 && (
            <div
              style={{ borderTop: '1px solid var(--vscode-widget-border)', margin: '4px 0' }}
            />
          )}

          {/* Open new directory */}
          <button
            onClick={handleSelectNewDir}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
            style={{ color: 'var(--vscode-foreground)' }}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>{t('agent.openNewDirectory')}</span>
          </button>
        </div>

        {/* Footer */}
        <div
          className="px-4 py-3 flex justify-end gap-2"
          style={{ borderTop: '1px solid var(--vscode-widget-border)' }}
        >
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs transition-colors"
            style={{
              background: 'var(--vscode-button-secondaryBackground)',
              color: 'var(--vscode-button-secondaryForeground)',
            }}
          >
            {t('agent.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={!workspace}
            className="px-3 py-1.5 rounded text-xs transition-colors disabled:opacity-40"
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
// Sidebar Menu Item
// ────────────────────────────────────────────────

interface SidebarMenuItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function SidebarMenuItem({ icon, label, active, onClick }: SidebarMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors rounded-md ${
        active
          ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
          : 'hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
      style={{
        color: active
          ? 'var(--vscode-list-activeSelectionForeground)'
          : 'var(--vscode-foreground)',
      }}
    >
      <span className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

// ────────────────────────────────────────────────
// Agent Sidebar
// ────────────────────────────────────────────────

interface AgentSidebarProps {
  onSelectSession: (id: string) => void;
  activeSessionId: string | null;
  onDeleteSession: (id: string) => void;
}

export function AgentSidebar({
  onSelectSession,
  activeSessionId,
  onDeleteSession,
}: AgentSidebarProps) {
  const { t } = useI18n();
  const sessions = useStore((s) => s.agentSessions);
  const createAgentSession = useStore((s) => s.createAgentSession);

  const [activeView, setActiveView] = useState<'tasks' | 'assistant' | 'skills' | 'automation'>(
    'tasks',
  );
  const [expandGroup, setExpandGroup] = useState<WorkspaceGroup | null>(null);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [createWorkspace, setCreateWorkspace] = useState<string | undefined>(undefined);

  const groups = groupSessionsByWorkspace(sessions);
  const existingWorkspaces = groups.map((g) => g.workspace);

  const handleCreateTask = useCallback(
    async (workspace: string) => {
      try {
        const id = await createAgentSession(workspace);
        onSelectSession(id);
        setShowWorkspaceModal(false);
        setCreateWorkspace(undefined);
      } catch (e) {
        console.error('Failed to create task:', e);
      }
    },
    [createAgentSession, onSelectSession],
  );

  return (
    <div
      className="h-full flex flex-col"
      style={{
        width: '240px',
        background: 'var(--vscode-sideBar-background)',
        borderRight: '1px solid var(--vscode-sideBar-border)',
      }}
    >
      {/* 功能菜单 */}
      <div className="shrink-0 px-2 py-2 space-y-1">
        <SidebarMenuItem
          icon={<Plus className="w-4 h-4" />}
          label={t('agent.newTask')}
          onClick={() => setShowWorkspaceModal(true)}
        />
        <SidebarMenuItem
          icon={<Sparkles className="w-4 h-4" />}
          label={t('agent.assistant')}
          active={activeView === 'assistant'}
          onClick={() => setActiveView('assistant')}
        />
        <SidebarMenuItem
          icon={<Puzzle className="w-4 h-4" />}
          label={t('agent.skills')}
          active={activeView === 'skills'}
          onClick={() => setActiveView('skills')}
        />
        <SidebarMenuItem
          icon={<Zap className="w-4 h-4" />}
          label={t('agent.automation')}
          active={activeView === 'automation'}
          onClick={() => setActiveView('automation')}
        />
        <SidebarMenuItem icon={<MoreHorizontal className="w-4 h-4" />} label={t('agent.more')} />
      </div>

      {/* 分隔线 */}
      <div
        className="shrink-0 mx-3 h-px"
        style={{ background: 'var(--vscode-widget-border)' }}
      />

      {/* 任务历史列表（合并了空间管理） */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1">
        <WorkspaceList
          groups={groups}
          activeId={activeSessionId}
          onSelect={onSelectSession}
          onDelete={onDeleteSession}
          onExpand={setExpandGroup}
          onCreateInWorkspace={(ws) => {
            setCreateWorkspace(ws);
            setShowWorkspaceModal(true);
          }}
          maxSessionsPerGroup={MAX_SESSIONS_PER_GROUP}
        />
      </div>

      {/* Expand modal */}
      {expandGroup && (
        <WorkspaceExpandModal
          group={expandGroup}
          activeId={activeSessionId}
          onSelect={onSelectSession}
          onDelete={onDeleteSession}
          onClose={() => setExpandGroup(null)}
        />
      )}

      {/* Workspace select modal */}
      {showWorkspaceModal && (
        <WorkspaceSelectModal
          onClose={() => {
            setShowWorkspaceModal(false);
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
