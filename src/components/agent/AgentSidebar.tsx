/**
 * AgentSidebar - Agent 侧边栏组件
 *
 * 与 DocumentSidebar / BrowserSidebar 保持一致的架构：
 * - 独立于 AgentChatPanel，在 App 层级渲染
 * - 直接从 store 获取状态，不需要 props
 * - 支持 pin/unpin + hover-expand/collapse + overlay 模式
 * - 使用 sidebarWidth（与 DocumentSidebar 共享，互斥渲染）
 *
 * 结构：
 * - Header：pin 按钮
 * - 功能菜单：新建任务
 * - 工作目录栏：显示/切换当前工作目录
 * - 任务历史：按 workspace 分组的 session 列表（可折叠）
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useI18n } from '../../lib/core/i18n';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { useSidebarHover } from '../hooks/useSidebarHover';
import {
  Plus,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Pin,
} from 'lucide-react';
import {
  WorkspaceList,
  groupSessionsByWorkspace,
  type WorkspaceGroup,
} from './WorkspaceList';
import { AgentWorkspaceMenu, workspaceDisplayName } from './AgentWorkspaceMenu';
import { WorkspaceSelectModal } from './WorkspaceSelectModal';
import { WorkspaceExpandModal } from './WorkspaceExpandModal';

// ────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────

const MAX_SESSIONS_PER_GROUP = 5;

/** Width of the sidebar when collapsed (unpinned, not hovered). */
const COLLAPSED_WIDTH = 48;

// ────────────────────────────────────────────────
// Agent Sidebar
// ────────────────────────────────────────────────

/**
 * AgentSidebar - 独立的侧边栏组件
 *
 * 与 DocumentSidebar / BrowserSidebar 保持一致的架构：
 * - 直接从 store 获取状态
 * - 不需要任何 props
 * - 在 App 层级渲染
 * - 支持 pin/unpin + hover-expand/collapse + overlay 模式
 */
export default function AgentSidebar() {
  const { t } = useI18n();

  // ── Agent store state ──
  const sessions = useStore((s) => s.agentSessions);
  const activeAgentSessionId = useStore((s) => s.activeAgentSessionId);
  const activeAgentWorkspace = useStore((s) => s.activeAgentWorkspace);
  const setActiveAgentWorkspace = useStore((s) => s.setActiveAgentWorkspace);
  const createAgentSession = useStore((s) => s.createAgentSession);
  const openAgentSession = useStore((s) => s.openAgentSession);
  const deleteAgentSession = useStore((s) => s.deleteAgentSession);
  const initAgentSessions = useStore((s) => s.initAgentSessions);
  const showWorkspaceModal = useStore((s) => s.showAgentWorkspaceModal);
  const setShowWorkspaceModal = useStore((s) => s.setShowAgentWorkspaceModal);

  // ── Sidebar UI store state (shared with DocumentSidebar) ──
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const sidebarPinned = useStore((s) => s.sidebarPinned);
  const toggleSidebarPinned = useStore((s) => s.toggleSidebarPinned);
  const leftPanelHovered = useStore((s) => s.leftPanelHovered);

  const { onResizeStart } = useSidebarResize();

  // ── UI state ──
  const [expandGroup, setExpandGroup] = useState<WorkspaceGroup | null>(null);
  const [createWorkspace, setCreateWorkspace] = useState<string | undefined>(undefined);
  const [workspaceMenuPos, setWorkspaceMenuPos] = useState<{ x: number; y: number } | null>(null);
  const workspaceBtnRef = useRef<HTMLButtonElement>(null);

  // ── Suppress collapse while a floating menu / modal is active ──
  const anyFloatingMenuOpen = !!workspaceMenuPos || !!expandGroup;
  const suppressCollapse = anyFloatingMenuOpen || showWorkspaceModal;

  // Init sessions on mount
  useEffect(() => {
    initAgentSessions();
  }, [initAgentSessions]);

  const groups = groupSessionsByWorkspace(sessions);
  const existingWorkspaces = useMemo(() => groups.map((g) => g.workspace), [groups]);

  // ── Hover expand / collapse (shared hook) ──
  const {
    hoverExpanded,
    handleHoverEnter,
    handleHoverLeave,
    handleTogglePin,
  } = useSidebarHover({
    sidebarPinned,
    leftPanelHovered,
    toggleSidebarPinned,
    suppressCollapse,
  });

  const isCollapsed = !sidebarPinned && !hoverExpanded;
  const effectiveWidth = isCollapsed ? COLLAPSED_WIDTH : sidebarWidth;

  // ── Overlay mode (hover-expand without pinning) ──
  const isOverlay = !sidebarPinned && !isCollapsed;
  const overlayShift = isOverlay ? effectiveWidth - COLLAPSED_WIDTH : 0;

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

  const toggleWorkspaceMenu = useCallback(() => {
    if (workspaceMenuPos) {
      setWorkspaceMenuPos(null);
      return;
    }
    if (workspaceBtnRef.current) {
      const rect = workspaceBtnRef.current.getBoundingClientRect();
      setWorkspaceMenuPos({ x: rect.left, y: rect.bottom + 4 });
    }
  }, [workspaceMenuPos]);

  // Close workspace menu on outside click / Escape
  useEffect(() => {
    if (!workspaceMenuPos) return;
    const onDown = () => setWorkspaceMenuPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWorkspaceMenuPos(null);
    };
    const id = requestAnimationFrame(() => {
      window.addEventListener('mousedown', onDown);
      window.addEventListener('keydown', onKey);
    });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [workspaceMenuPos]);

  // ── Render ──

  return (
    <div
      data-sidebar-root
      className="shrink-0 h-full flex flex-col select-none z-30 relative overflow-hidden bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-sideBar-border)]"
      style={{
        width: effectiveWidth,
        marginRight: -overlayShift,
        transition: 'width 180ms ease-out, margin-right 180ms ease-out, box-shadow 180ms ease-out',
        boxShadow: isOverlay ? '4px 0 12px rgba(0,0,0,0.3)' : '4px 0 12px rgba(0,0,0,0)',
      }}
      onMouseEnter={handleHoverEnter}
      onMouseLeave={handleHoverLeave}
    >
      {/* ── Collapsed mode: just a pin button ── */}
      {isCollapsed ? (
        <div className="h-9 shrink-0 flex items-center justify-center">
          <button
            onClick={handleTogglePin}
            className="p-1.5 rounded-md text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer"
            title={t('doclist.pin')}
          >
            <Pin className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
      {/* Header - aligned with the tab bar height (h-9) */}
      <div className="h-9 shrink-0 flex items-center justify-end px-3">
        <button
          onClick={handleTogglePin}
          className={`p-1 rounded-md transition-colors duration-150 cursor-pointer ${
            sidebarPinned
              ? 'text-[var(--vscode-foreground)] bg-[var(--vscode-list-activeSelectionBackground)] hover:bg-[var(--vscode-list-hoverBackground)]'
              : 'text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
          }`}
          title={sidebarPinned ? t('doclist.unpin') : t('doclist.pin')}
        >
          <Pin className="w-4 h-4" />
        </button>
      </div>

      {/* 新建任务按钮 */}
      <div className="shrink-0 px-2 pb-1.5">
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
      <div className="shrink-0 px-2 pb-1.5">
        <button
          ref={workspaceBtnRef}
          onClick={toggleWorkspaceMenu}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors"
          style={{
            background: workspaceMenuPos
              ? 'var(--vscode-list-activeSelectionBackground)'
              : 'var(--vscode-textBlockQuote-background, rgba(128,128,128,0.08))',
            color: 'var(--vscode-foreground)',
          }}
          onMouseEnter={(e) => {
            if (!workspaceMenuPos) {
              e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
            }
          }}
          onMouseLeave={(e) => {
            if (!workspaceMenuPos) {
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
            style={{ transform: workspaceMenuPos ? 'rotate(180deg)' : 'none' }}
          />
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

      {/* Resize handle - only when pinned */}
      {sidebarPinned && (
        <div
          onMouseDown={onResizeStart}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-20 hover:bg-[var(--vscode-focusBorder)] active:bg-[var(--vscode-focusBorder)] transition-colors"
          style={{ marginRight: '-1px' }}
        />
      )}
        </>
      )}

      {/* ── Workspace dropdown menu ── */}
      {workspaceMenuPos && (
        <AgentWorkspaceMenu
          x={workspaceMenuPos.x}
          y={workspaceMenuPos.y}
          existingWorkspaces={existingWorkspaces}
          activeAgentWorkspace={activeAgentWorkspace}
          onSelectWorkspace={(ws) => {
            setActiveAgentWorkspace(ws);
            setWorkspaceMenuPos(null);
          }}
          onOpenDirectory={() => {
            handleOpenDirectory();
            setWorkspaceMenuPos(null);
          }}
          onClearWorkspace={() => {
            handleClearWorkspace();
            setWorkspaceMenuPos(null);
          }}
        />
      )}

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
