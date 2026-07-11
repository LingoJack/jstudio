/**
 * AgentSidebar — 左侧边栏组件
 * 
 * 结构（参考 WorkBuddy 设计）：
 * - 顶部：产品名称
 * - 功能菜单：新建任务、助理、技能等
 * - 空间管理：workspace 列表（可折叠）
 * - 任务历史：按 workspace 分组的 session 列表
 * - 底部：用户信息 / 设置入口
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
  ChevronRight,
  Settings,
  User,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import { NavBranch, NavRow } from '../ui/NavTree';
import { MenuList, MenuItem, MenuDivider } from '../ui/MenuList';
import {
  WorkspaceList,
  WorkspaceExpandModal,
  groupSessionsByWorkspace,
  type WorkspaceGroup,
} from './WorkspaceList';
import type { AgentSession } from '../../types/agent';

// ────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────

const MAX_SESSIONS_PER_GROUP = 5;

// ────────────────────────────────────────────────
// New Task Modal
// ────────────────────────────────────────────────

interface NewTaskModalProps {
  onClose: () => void;
  onCreate: (title: string, workspace: string) => void;
  initialWorkspace?: string;
  existingWorkspaces?: string[];
}

export function NewTaskModal({
  onClose,
  onCreate,
  initialWorkspace,
  existingWorkspaces,
}: NewTaskModalProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [workspace, setWorkspace] = useState<string | undefined>(initialWorkspace);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);

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

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim() || !workspace) return;
      onCreate(title.trim(), workspace);
      onClose();
    },
    [title, workspace, onCreate, onClose],
  );

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
                if (canSubmit) handleSubmit(e);
              }
            }}
          />
        </form>

        {/* Bottom bar */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}
        >
          {/* Workspace selector */}
          <div className="relative">
            <button
              onClick={() => setShowWorkspacePicker(!showWorkspacePicker)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors"
              style={{
                background: workspace ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                color: workspace
                  ? 'var(--vscode-foreground)'
                  : 'var(--vscode-descriptionForeground)',
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

            {/* Dropdown */}
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
                    <FolderOpen
                      className="w-3.5 h-3.5"
                      style={{ color: 'var(--vscode-descriptionForeground)' }}
                    />
                    <span className="truncate flex-1">{ws.split('/').pop() || ws}</span>
                    {workspace === ws && (
                      <span style={{ color: 'var(--vscode-descriptionForeground)' }}>✓</span>
                    )}
                  </button>
                ))}
                {existingWorkspaces && existingWorkspaces.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }} />
                )}
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

          {/* Submit */}
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
            <Plus className="w-3 h-3" />
            <span>{t('agent.createTask')}</span>
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
  badge?: string | number;
}

function SidebarMenuItem({ icon, label, active, onClick, badge }: SidebarMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors rounded-lg ${
        active ? 'bg-[var(--vscode-list-activeSelectionBackground)]' : 'hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
      style={{
        color: active
          ? 'var(--vscode-list-activeSelectionForeground)'
          : 'var(--vscode-foreground)',
      }}
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            background: 'var(--vscode-badge-background)',
            color: 'var(--vscode-badge-foreground)',
          }}
        >
          {badge}
        </span>
      )}
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

  const [activeView, setActiveView] = useState<'tasks' | 'assistant' | 'skills' | 'automation'>('tasks');
  const [spacesExpanded, setSpacesExpanded] = useState(true);
  const [expandGroup, setExpandGroup] = useState<WorkspaceGroup | null>(null);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [createWorkspace, setCreateWorkspace] = useState<string | undefined>(undefined);

  const groups = groupSessionsByWorkspace(sessions);
  const existingWorkspaces = groups.map((g) => g.workspace);

  const handleCreateTask = useCallback(
    async (title: string, workspace: string) => {
      try {
        const id = await createAgentSession(title, workspace);
        onSelectSession(id);
        setShowNewTaskModal(false);
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
      {/* 顶部：产品名称 */}
      <div
        className="shrink-0 px-4 py-3"
        style={{
          borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)',
        }}
      >
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--vscode-sideBarTitle-foreground)' }}
        >
          JStudio Agent
        </span>
      </div>

      {/* 功能菜单 */}
      <div className="shrink-0 px-2 py-2 space-y-1">
        <SidebarMenuItem
          icon={<Plus className="w-4 h-4" />}
          label={t('agent.newTask')}
          onClick={() => setShowNewTaskModal(true)}
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
        <SidebarMenuItem
          icon={<MoreHorizontal className="w-4 h-4" />}
          label={t('agent.more')}
        />
      </div>

      {/* 分隔线 */}
      <div
        className="shrink-0 mx-3 h-px"
        style={{ background: 'var(--vscode-widget-border)' }}
      />

      {/* 空间管理（Workspace 列表） */}
      <div className="shrink-0 px-2 py-1">
        <button
          onClick={() => setSpacesExpanded(!spacesExpanded)}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs transition-colors hover:bg-[var(--vscode-list-hoverBackground)] rounded"
          style={{ color: 'var(--vscode-sideBarSectionHeader-foreground)' }}
        >
          <ChevronRight
            className={`w-3 h-3 transition-transform ${spacesExpanded ? 'rotate-90' : ''}`}
          />
          <span className="flex-1">
            {t('agent.spaces')} ({groups.length})
          </span>
        </button>

        {spacesExpanded && (
          <div className="ml-4 mt-1 space-y-0.5">
            {groups.map((group) => (
              <NavRow
                key={group.workspace}
                level="primary"
                icon={<FolderOpen className="w-4 h-4 opacity-70 shrink-0" />}
                onClick={() => setCreateWorkspace(group.workspace)}
              >
                <span className="flex-1 truncate text-xs">{group.displayName}</span>
                <span className="text-xs text-[var(--vscode-descriptionForeground)] mr-2">
                  {group.sessions.length}
                </span>
              </NavRow>
            ))}
          </div>
        )}
      </div>

      {/* 任务历史列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1">
        <WorkspaceList
          groups={groups}
          activeId={activeSessionId}
          onSelect={onSelectSession}
          onDelete={onDeleteSession}
          onExpand={setExpandGroup}
          onCreateInWorkspace={setCreateWorkspace}
          maxSessionsPerGroup={MAX_SESSIONS_PER_GROUP}
        />
      </div>

      {/* 底部：用户信息 */}
      <div
        className="shrink-0 px-3 py-2 flex items-center gap-2"
        style={{
          borderTop: '1px solid var(--vscode-widget-border)',
        }}
      >
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: 'var(--vscode-badge-background)' }}
        >
          <User className="w-3.5 h-3.5" style={{ color: 'var(--vscode-badge-foreground)' }} />
        </div>
        <span className="text-xs flex-1 truncate" style={{ color: 'var(--vscode-foreground)' }}>
          {t('agent.user')}
        </span>
        <button
          className="flex items-center justify-center w-6 h-6 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title={t('agent.settings')}
        >
          <Settings className="w-3.5 h-3.5" style={{ color: 'var(--vscode-foreground)' }} />
        </button>
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