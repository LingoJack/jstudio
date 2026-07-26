/**
 * AgentSidebar — Agent 侧边栏组件
 * 
 * 与 DocumentSidebar 保持一致的架构：
 * - 独立于 AgentChatPanel，在 App 层级渲染
 * - 直接从 store 获取状态，不需要 props
 * 
 * 结构：
 * - 功能菜单：新建任务
 * - 任务历史：按 workspace 分组的 session 列表（可折叠）
 */

import { useState, useCallback, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { Plus, FolderOpen, ChevronRight } from 'lucide-react';
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
// Agent Sidebar
// ────────────────────────────────────────────────

/**
 * AgentSidebar — 独立的侧边栏组件
 * 
 * 与 DocumentSidebar 保持一致的架构：
 * - 直接从 store 获取状态
 * - 不需要任何 props
 * - 在 App 层级渲染
 */
export default function AgentSidebar() {
  const { t } = useI18n();
  
  // 直接从 store 获取状态
  const sessions = useStore((s) => s.agentSessions);
  const activeAgentSessionId = useStore((s) => s.activeAgentSessionId);
  const createAgentSession = useStore((s) => s.createAgentSession);
  const openAgentSession = useStore((s) => s.openAgentSession);
  const deleteAgentSession = useStore((s) => s.deleteAgentSession);
  const initAgentSessions = useStore((s) => s.initAgentSessions);

  const [expandGroup, setExpandGroup] = useState<WorkspaceGroup | null>(null);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [createWorkspace, setCreateWorkspace] = useState<string | undefined>(undefined);

  // Init sessions on mount
  useEffect(() => {
    initAgentSessions();
  }, [initAgentSessions]);

  const groups = groupSessionsByWorkspace(sessions);
  const existingWorkspaces = groups.map((g) => g.workspace);

  const handleCreateTask = useCallback(
    async (workspace: string) => {
      try {
        await createAgentSession(workspace);
        setShowWorkspaceModal(false);
        setCreateWorkspace(undefined);
      } catch (e) {
        console.error('Failed to create task:', e);
      }
    },
    [createAgentSession],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      openAgentSession(sessionId);
    },
    [openAgentSession],
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      deleteAgentSession(sessionId);
    },
    [deleteAgentSession],
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
      <div className="shrink-0 px-2 pt-2 pb-1.5">
        <button
          onClick={() => setShowWorkspaceModal(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md cursor-pointer transition-all hover:brightness-110"
          style={{
            background: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
          }}
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">{t('agent.newTask')}</span>
          <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-50" />
        </button>
      </div>

      {/* 分隔线 */}
      <div
        className="shrink-0 mx-2 h-px"
        style={{ background: 'var(--vscode-widget-border)' }}
      />

      {/* 任务历史列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1">
        <WorkspaceList
          groups={groups}
          activeId={activeAgentSessionId}
          onSelect={handleSelectSession}
          onDelete={handleDeleteSession}
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
          activeId={activeAgentSessionId}
          onSelect={handleSelectSession}
          onDelete={handleDeleteSession}
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
