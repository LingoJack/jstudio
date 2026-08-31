/**
 * WorkspaceSelectModal - 选择 / 新建 Agent 工作空间的弹窗。
 *
 * 从 AgentSidebar.tsx 抽取为独立组件。当用户在没有活动工作空间时
 * 新建任务，弹出此对话框让用户选择已有工作空间或打开新目录。
 *
 * z-index 统一为 `z-modal`（原为 `z-50`）。
 */

import { useState, useCallback } from "react";
import { Plus, FolderOpen } from "lucide-react";
import { useI18n } from "../../lib/core/i18n";
import { workspaceDisplayName } from "./AgentWorkspaceMenu";

export interface WorkspaceSelectModalProps {
  onClose: () => void;
  onCreate: (workspace: string) => void;
  initialWorkspace?: string;
  existingWorkspaces?: string[];
}

export function WorkspaceSelectModal({
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
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("agent.selectWorkspace"),
      });
      if (selected && typeof selected === "string") {
        setWorkspace(selected);
      }
    } catch (e) {
      console.error("Failed to open directory picker:", e);
    }
  }, [t]);

  const handleCreate = useCallback(() => {
    if (!workspace) return;
    onCreate(workspace);
    onClose();
  }, [workspace, onCreate, onClose]);

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl overflow-hidden"
        style={{
          background: "var(--vscode-menu-background)",
          border: "1px solid var(--vscode-menu-border)",
          width: "320px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-4 py-3 text-sm font-medium"
          style={{
            color: "var(--vscode-foreground)",
            borderBottom: "1px solid var(--vscode-widget-border)",
          }}
        >
          {t("agent.selectWorkspace")}
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
                  workspace === ws ? "var(--vscode-list-activeSelectionBackground)" : "transparent",
                color:
                  workspace === ws
                    ? "var(--vscode-list-activeSelectionForeground)"
                    : "var(--vscode-foreground)",
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
              style={{ borderTop: "1px solid var(--vscode-widget-border)", margin: "4px 0" }}
            />
          )}

          {/* Open new directory */}
          <button
            onClick={handleSelectNewDir}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
            style={{ color: "var(--vscode-foreground)" }}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>{t("agent.openNewDirectory")}</span>
          </button>
        </div>

        {/* Footer */}
        <div
          className="px-4 py-3 flex justify-end gap-2"
          style={{ borderTop: "1px solid var(--vscode-widget-border)" }}
        >
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs transition-colors"
            style={{
              background: "var(--vscode-button-secondaryBackground)",
              color: "var(--vscode-button-secondaryForeground)",
            }}
          >
            {t("agent.cancel")}
          </button>
          <button
            onClick={handleCreate}
            disabled={!workspace}
            className="px-3 py-1.5 rounded text-xs transition-colors disabled:opacity-40"
            style={{
              background: "var(--vscode-button-background)",
              color: "var(--vscode-button-foreground)",
            }}
          >
            {t("agent.createTask")}
          </button>
        </div>
      </div>
    </div>
  );
}
