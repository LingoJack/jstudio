/**
 * AgentSidebar - Agent 侧边栏组件
 * 
 * 与 DocumentSidebar 保持一致的架构：
 * - 独立于 AgentChatPanel，在 App 层级渲染
 * - 直接从 store 获取状态，不需要 props
 * 
 * 结构：
 * - 功能菜单：新建任务
 * - 工作目录栏：显示/切换当前工作目录
 * - 任务历史：按 workspace 分组的 session 列表（可折叠）
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import {
  Plus,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Check,
  Folder,
  X,
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
// Helpers
// ────────────────────────────────────────────────

/** Extract a short display name from a workspace path */
function workspaceDisplayName(ws: string): string {
  return ws.split('/').pop() || ws;
}

// ────────────────────────────────────────────────
// Workspace Dropdown
// ────────────────────────────────────────────────

interface WorkspaceDropdownProps {
  activeWorkspace: string | null;
  workspaces: string[];
  onSwitch: (ws: string) => void;
  onOpenDirectory: () => void;
  onClear: () => void;
  onClose: () => void;
}

function WorkspaceDropdown({
  activeWorkspace,
  workspaces,
  onSwitch,
  onOpenDirectory,
  onClear,
  onClose,
}: WorkspaceDropdownProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use setTimeout to avoid the opening click immediately closing it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-2 right-2 top-full mt-1 z-40 rounded-lg overflow-hidden shadow-xl"
      style={{
        background: 'var(--vscode-menu-background)',
        border: '1px solid var(--vscode-menu-border)',
      }}
    >
      {/* Workspace list */}
      {workspaces.length > 0 && (
        <div className="p-1.5 max-h-[200px] overflow-y-auto">
          <div
            className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--vscode-descriptionForeground)' }}
          >
            {t('agent.workspaces')}
          </div>
          {workspaces.map((ws) => {
            const isActive = ws === activeWorkspace;
            return (
              <button
                key={ws}
                onClick={() => {
                  onSwitch(ws);
                  onClose();
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors"
                style={{
                  background: isActive
                    ? 'var(--vscode-list-activeSelectionBackground)'
                    : 'transparent',
                  color: isActive
                    ? 'var(--vscode-list-activeSelectionForeground)'
                    : 'var(--vscode-foreground)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background =
                      'var(--vscode-list-hoverBackground)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
                title={ws}
              >
                <Folder
                  className="w-3.5 h-3.5 shrink-0"
                  style={{
                    color: isActive
                      ? 'var(--vscode-list-activeSelectionForeground)'
                      : 'var(--vscode-descriptionForeground)',
                  }}
                />
                <span className="truncate flex-1">{workspaceDisplayName(ws)}</span>
                {isActive && <Check className="w-3.5 h-3.5 shrink-0 opacity-80" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Divider */}
      {workspaces.length > 0 && (
        <div
          className="h-px mx-1.5"
          style={{ background: 'var(--vscode-widget-border)' }}
        />
      )}

      {/* Actions */}
      <div className="p-1.5">
        <button
          onClick={() => {
            onOpenDirectory();
            onClose();
          }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
          style={{ color: 'var(--vscode-foreground)' }}
        >
          <FolderOpen className="w-3.5 h-3.5 shrink-0" />
          <span>{t('agent.openDirectory')}</span>
        </button>

        {activeWorkspace && (
          <button
            onClick={() => {
              onClear();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
            style={{ color: 'var(--vscode-foreground)' }}
          >
            <X className="w-3.5 h-3.5 shrink-0" />
            <span>{t('agent.clearWorkspace')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────
// Workspace Select Modal (for creating task without active workspace)
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
              <span className="truncate flex-1">{workspaceDisplayName(ws)}</span>
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
 * AgentSidebar - 独立的侧边栏组件
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
  const activeAgentWorkspace = useStore((s) => s.activeAgentWorkspace);
  const setActiveAgentWorkspace = useStore((s) => s.setActiveAgentWorkspace);
  const createAgentSession = useStore((s) => s.createAgentSession);
  const openAgentSession = useStore((s) => s.openAgentSession);
  const deleteAgentSession = useStore((s) => s.deleteAgentSession);
  const initAgentSessions = useStore((s) => s.initAgentSessions);

  const [expandGroup, setExpandGroup] = useState<WorkspaceGroup | null>(null);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [createWorkspace, setCreateWorkspace] = useState<string | undefined>(undefined);
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);

  // Init sessions on mount
  useEffect(() => {
    initAgentSessions();
  }, [initAgentSessions]);

  const groups = groupSessionsByWorkspace(sessions);
  const existingWorkspaces = useMemo(() => groups.map((g) => g.workspace), [groups]);

  // ── Handlers ──

  const handleOpenDirectory = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('agent.selectWorkspace'),
      });
      if (selected && typeof selected === 'string') {
        setActiveAgentWorkspace(selected);
      }
    } catch (e) {
      console.error('Failed to open directory picker:', e);
    }
  }, [t, setActiveAgentWorkspace]);

  const handleClearWorkspace = useCallback(() => {
    setActiveAgentWorkspace('');
  }, [setActiveAgentWorkspace]);

  const handleCreateTask = useCallback(
    async (workspace: string) => {
      try {
        await createAgentSession(workspace);
        // Also set as active workspace
        setActiveAgentWorkspace(workspace);
        setShowWorkspaceModal(false);
        setCreateWorkspace(undefined);
      } catch (e) {
        console.error('Failed to create task:', e);
      }
    },
    [createAgentSession, setActiveAgentWorkspace],
  );

  /** Click "new task" button: if workspace is set, create directly; otherwise show modal */
  const handleNewTaskClick = useCallback(async () => {
    if (activeAgentWorkspace) {
      try {
        await createAgentSession(activeAgentWorkspace);
      } catch (e) {
        console.error('Failed to create task:', e);
      }
    } else {
      setShowWorkspaceModal(true);
    }
  }, [activeAgentWorkspace, createAgentSession]);

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
      {/* 新建任务按钮 */}
      <div className="shrink-0 px-2 pt-2 pb-1.5">
        <button
          onClick={handleNewTaskClick}
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

      {/* 工作目录栏 */}
      <div className="shrink-0 px-2 pb-1.5 relative">
        <button
          onClick={() => setShowWorkspaceDropdown((v) => !v)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors"
          style={{
            background: showWorkspaceDropdown
              ? 'var(--vscode-list-activeSelectionBackground)'
              : 'var(--vscode-textBlockQuote-background, rgba(128,128,128,0.08))',
            color: 'var(--vscode-foreground)',
          }}
          onMouseEnter={(e) => {
            if (!showWorkspaceDropdown) {
              e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
            }
          }}
          onMouseLeave={(e) => {
            if (!showWorkspaceDropdown) {
              e.currentTarget.style.background =
                'var(--vscode-textBlockQuote-background, rgba(128,128,128,0.08))';
            }
          }}
          title={activeAgentWorkspace || t('agent.noWorkspaceSelected')}
        >
          <FolderOpen
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: 'var(--vscode-descriptionForeground)' }}
          />
          <span
            className="flex-1 text-left truncate"
            style={{
              color: activeAgentWorkspace
                ? 'var(--vscode-foreground)'
                : 'var(--vscode-descriptionForeground)',
            }}
          >
            {activeAgentWorkspace
              ? workspaceDisplayName(activeAgentWorkspace)
              : t('agent.noWorkspaceSelected')}
          </span>
          <ChevronDown
            className="w-3 h-3 shrink-0 opacity-60 transition-transform"
            style={{ transform: showWorkspaceDropdown ? 'rotate(180deg)' : 'none' }}
          />
        </button>

        {/* Dropdown */}
        {showWorkspaceDropdown && (
          <WorkspaceDropdown
            activeWorkspace={activeAgentWorkspace}
            workspaces={existingWorkspaces}
            onSwitch={setActiveAgentWorkspace}
            onOpenDirectory={handleOpenDirectory}
            onClear={handleClearWorkspace}
            onClose={() => setShowWorkspaceDropdown(false)}
          />
        )}
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
          activeWorkspace={activeAgentWorkspace}
          onSetWorkspace={setActiveAgentWorkspace}
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
