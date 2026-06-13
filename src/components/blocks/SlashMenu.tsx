import type { BlockType } from '../../types';
import { SLASH_COMMANDS } from './shared';

interface SlashMenuProps {
  slashMenuIndex: number;
  slashMenuCoords: { top: number; left: number } | null;
  onExecute: (type: BlockType) => void;
}

/**
 * Floating slash-command popover.
 * Rendered by the block wrapper when the user types `/`.
 */
export default function SlashMenu({
  slashMenuIndex,
  slashMenuCoords,
  onExecute,
}: SlashMenuProps) {
  return (
    <div
      className="absolute z-50 mt-2 w-56 rounded-md bg-[var(--vscode-quickInput-background)] border border-[var(--vscode-widget-border)] shadow-xl overflow-hidden text-[var(--vscode-foreground)] p-1"
      style={{
        top: slashMenuCoords ? slashMenuCoords.top : '100%',
        left: slashMenuCoords ? Math.max(slashMenuCoords.left - 24, 0) : 16,
      }}
    >
      <div className="py-1 max-h-56 overflow-y-auto">
        {SLASH_COMMANDS.map((cmd, idx) => {
          const IconComp = cmd.icon;
          const isSelected = idx === slashMenuIndex;
          return (
            <button
              key={cmd.type}
              onClick={() => onExecute(cmd.type as BlockType)}
              className={`cursor-pointer w-full text-left px-3 py-1.5 flex items-center gap-2.5 transition-colors text-xs font-medium ${
                isSelected
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-white'
                  : 'hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
              id={`slash-cmd-${cmd.type}`}
            >
              <IconComp
                className={`w-3.5 h-3.5 ${
                  isSelected
                    ? 'text-white'
                    : 'text-[var(--vscode-descriptionForeground)]'
                }`}
              />
              <span>{cmd.label}</span>
              {isSelected && (
                <span className="ml-auto text-[9px] text-white opacity-70">
                  ↵
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
