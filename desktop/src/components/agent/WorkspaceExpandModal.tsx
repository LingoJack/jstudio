/**
 * WorkspaceExpandModal - 展开工作空间会话列表的弹窗。
 *
 * 从 WorkspaceList.tsx 抽取为独立组件。当某个工作空间的会话数超过
 * 侧边栏可显示上限时，点击"展开"按钮弹出此对话框，列出全部会话。
 *
 * z-index 统一为 `z-modal`（原为 `z-50`）。
 */

import { FolderOpen } from "lucide-react";
import { useI18n } from "../../lib/core/i18n";
import { SessionItem, type WorkspaceGroup } from "./WorkspaceList";

export interface WorkspaceExpandModalProps {
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
}: WorkspaceExpandModalProps) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl w-[420px] max-h-[80vh] overflow-hidden flex flex-col"
        style={{
          background: "var(--vscode-menu-background)",
          border: "1px solid var(--vscode-menu-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--vscode-widget-border)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center w-7 h-7 rounded-lg"
              style={{ background: "var(--vscode-editor-inactiveSelectionBackground)" }}
            >
              <FolderOpen className="w-4 h-4" style={{ color: "var(--vscode-foreground)" }} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium" style={{ color: "var(--vscode-foreground)" }}>
                {group.displayName}
              </span>
              <span className="text-[11px]" style={{ color: "var(--vscode-descriptionForeground)" }}>
                {group.sessions.length} {t("agent.moreSessions")}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            style={{ color: "var(--vscode-foreground)" }}
          >
            <span className="opacity-60 text-sm">✕</span>
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
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
