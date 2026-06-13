import { useState, useRef, useEffect } from 'react';
import {
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  ChevronRight,
  Type,
  Heading1,
  Heading2,
  Heading3,
} from 'lucide-react';
import type { BlockType } from '../../types';

interface BlockContextMenuProps {
  blockType: BlockType;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddBelow: () => void;
  onConvertTo: (type: BlockType) => void;
  onClose: () => void;
}

const CONVERTIBLE_TYPES: { type: BlockType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'text', label: '文本', icon: Type },
  { type: 'heading-1', label: '标题 1', icon: Heading1 },
  { type: 'heading-2', label: '标题 2', icon: Heading2 },
  { type: 'heading-3', label: '标题 3', icon: Heading3 },
];

/**
 * Context menu shown when clicking the ⋮⋮ drag handle.
 *
 * Provides quick block operations: delete, duplicate, insert below,
 * and convert-to (text / heading-1/2/3).
 *
 * The menu is positioned just to the right of the handle, below it.
 */
export default function BlockContextMenu({
  blockType: _blockType,
  onDelete,
  onDuplicate,
  onAddBelow,
  onConvertTo,
  onClose,
}: BlockContextMenuProps) {
  const [showConvertSubmenu, setShowConvertSubmenu] = useState(false);

  const menuItems = [
    {
      label: '删除',
      icon: Trash2,
      onClick: onDelete,
      danger: true,
    },
    {
      label: '复制副本',
      icon: Copy,
      onClick: onDuplicate,
    },
    {
      label: '在下方添加',
      icon: ArrowDown,
      onClick: onAddBelow,
    },
  ];

  return (
    <>
      {/* Invisible backdrop to catch outside clicks */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Menu panel */}
      <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] rounded-md shadow-xl py-1 select-none">
        {menuItems.map((item, idx) => (
          <button
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
            }}
            className={`w-full px-3 py-1.5 flex items-center gap-2.5 text-xs transition-colors ${
              item.danger
                ? 'text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                : 'text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
            }`}
          >
            <item.icon className="w-3.5 h-3.5 shrink-0" />
            <span>{item.label}</span>
          </button>
        ))}

        {/* Divider */}
        <div className="my-1 border-t border-[var(--vscode-menu-separatorBackground)]" />

        {/* Convert to submenu */}
        <div
          className="relative"
          onMouseEnter={() => setShowConvertSubmenu(true)}
          onMouseLeave={() => setShowConvertSubmenu(false)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowConvertSubmenu((p) => !p);
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between gap-2.5 text-xs text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span>转换为</span>
            </div>
            <ChevronRight className="w-3 h-3 shrink-0" />
          </button>

          {showConvertSubmenu && (
            <div className="absolute top-0 left-full ml-0.5 min-w-[140px] bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] rounded-md shadow-xl py-1">
              {CONVERTIBLE_TYPES.map((ct) => (
                <button
                  key={ct.type}
                  onClick={(e) => {
                    e.stopPropagation();
                    onConvertTo(ct.type);
                  }}
                  className="w-full px-3 py-1.5 flex items-center gap-2.5 text-xs text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                >
                  <ct.icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{ct.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
