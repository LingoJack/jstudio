import { useState, useRef, useEffect } from 'react';
import { Plus, GripVertical } from 'lucide-react';
import type { BlockType } from '../../types';
import BlockContextMenu from './BlockContextMenu';

interface BlockHandleProps {
  blockType: BlockType;
  onAddBelow: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onConvertTo: (type: BlockType) => void;
}

/**
 * Notion-style block hover controls.
 *
 * Appears on the left side of every block when the user hovers:
 *   [+] — click to add a new empty text block below
 *   [⋮⋮] — click to open a context menu (delete, duplicate, convert, etc.)
 *
 * Both icons are absolutely positioned to the left of the block content,
 * invisible by default, and fade in on group-hover/block.
 */
export default function BlockHandle({
  blockType,
  onAddBelow,
  onDelete,
  onDuplicate,
  onConvertTo,
}: BlockHandleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <>
      {/* Hover controls — absolutely positioned on the left */}
      <div
        className="absolute right-full top-0 flex items-center gap-0.5 pr-1 opacity-0 group-hover/block:opacity-100 transition-opacity duration-100 select-none"
        contentEditable={false}
      >
        {/* Add button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddBelow();
          }}
          className="cursor-pointer w-6 h-6 flex items-center justify-center rounded-sm text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:text-[var(--vscode-foreground)] transition-colors"
          title="点击添加"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Drag handle / context menu trigger */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((p) => !p);
            }}
            className="cursor-pointer w-5 h-6 flex items-center justify-center rounded-sm text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] hover:text-[var(--vscode-foreground)] transition-colors"
            title="点击打开菜单"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <BlockContextMenu
              blockType={blockType}
              onDelete={() => {
                onDelete();
                setMenuOpen(false);
              }}
              onDuplicate={() => {
                onDuplicate();
                setMenuOpen(false);
              }}
              onAddBelow={() => {
                onAddBelow();
                setMenuOpen(false);
              }}
              onConvertTo={(type) => {
                onConvertTo(type);
                setMenuOpen(false);
              }}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>
    </>
  );
}
