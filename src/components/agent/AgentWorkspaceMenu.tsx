import { Check, Folder, FolderOpen, X } from 'lucide-react';
import { MenuList, MenuItem, MenuDivider } from '../ui/MenuList';
import { useI18n } from '../../lib/core/i18n';

export function workspaceDisplayName(ws: string): string {
  const parts = ws.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || ws;
}

export interface AgentWorkspaceMenuProps {
  x: number;
  y: number;
  existingWorkspaces: string[];
  activeAgentWorkspace: string | null;
  onSelectWorkspace: (ws: string) => void;
  onOpenDirectory: () => void;
  onClearWorkspace: () => void;
}

/**
 * Workspace dropdown menu for the Agent sidebar.
 * Extracted from AgentSidebar to reduce render complexity.
 */
export function AgentWorkspaceMenu({
  x,
  y,
  existingWorkspaces,
  activeAgentWorkspace,
  onSelectWorkspace,
  onOpenDirectory,
  onClearWorkspace,
}: AgentWorkspaceMenuProps) {
  const { t } = useI18n();

  return (
    <MenuList
      x={x}
      y={y}
      onClick={(e) => e.stopPropagation()}
      className="max-h-[300px] overflow-y-auto"
    >
      {existingWorkspaces.length > 0 && (
        <>
          {existingWorkspaces.map((ws) => {
            const isActive = ws === activeAgentWorkspace;
            return (
              <MenuItem
                key={ws}
                icon={isActive ? <Check className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                onClick={() => onSelectWorkspace(ws)}
              >
                {workspaceDisplayName(ws)}
              </MenuItem>
            );
          })}
          <MenuDivider />
        </>
      )}
      <MenuItem
        icon={<FolderOpen className="w-4 h-4" />}
        onClick={onOpenDirectory}
      >
        {t('agent.openDirectory')}
      </MenuItem>
      {activeAgentWorkspace && (
        <MenuItem
          icon={<X className="w-4 h-4" />}
          onClick={onClearWorkspace}
        >
          {t('agent.clearWorkspace')}
        </MenuItem>
      )}
    </MenuList>
  );
}
