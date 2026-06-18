/**
 * TableControls — floating toolbar for TipTap tables.
 *
 * When the editor selection (cursor) is inside a table, a toolbar appears
 * at the table's top-right corner with buttons for:
 *   • Add row above / below
 *   • Add column left / right
 *   • Delete row / column / table
 *
 * Right-clicking a cell also opens a context menu with the same actions
 * scoped to the row or column that was clicked.
 */

import { useEffect, useState, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Plus,
  Trash2,
  ChevronDown,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TableControlsProps {
  editor: Editor;
}

export default function TableControls({ editor }: TableControlsProps) {
  // Position of the floating toolbar
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null);
  // Context menu (right-click)
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    type: 'row' | 'column' | 'cell';
  } | null>(null);

  // -------------------------------------------------------------------------
  // Track selection: show toolbar when cursor is inside a table
  // -------------------------------------------------------------------------
  useEffect(() => {
    const updateToolbar = () => {
      // Check if current selection is inside a table node
      const isTable = editor.isActive('table');
      if (!isTable) {
        setToolbar(null);
        return;
      }

      // Find the actual <table> DOM element in the editor
      const editorDom = editor.view.dom as HTMLElement;
      const tableEl = editorDom.querySelector('table');
      if (!tableEl) {
        setToolbar(null);
        return;
      }

      const rect = tableEl.getBoundingClientRect();
      // Position at top-right of the table, slightly offset
      setToolbar({
        x: rect.right,
        y: rect.top - 4,
      });
    };

    editor.on('selectionUpdate', updateToolbar);
    editor.on('focus', updateToolbar);
    editor.on('blur', () => {
      // Small delay so clicking the toolbar buttons doesn't lose it
      setTimeout(updateToolbar, 150);
    });

    // Also update on scroll / resize so the toolbar stays anchored
    const scrollContainer = editor.view.dom.closest(
      '.editor-scroll-container',
    ) as HTMLElement | null;
    const handleScroll = () => updateToolbar();
    scrollContainer?.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);

    updateToolbar();

    return () => {
      editor.off('selectionUpdate', updateToolbar);
      editor.off('focus', updateToolbar);
      editor.off('blur', updateToolbar);
      scrollContainer?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [editor]);

  // -------------------------------------------------------------------------
  // Right-click context menu
  // -------------------------------------------------------------------------
  useEffect(() => {
    const editorDom = editor.view.dom as HTMLElement;

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest('th, td');
      if (!cell) return;

      const table = (cell as HTMLElement).closest('table');
      if (!table) return;

      e.preventDefault();

      const tableRect = table.getBoundingClientRect();
      const onLeftEdge = e.clientX - tableRect.left < 24;
      const onTopEdge = e.clientY - tableRect.top < 24;

      let type: 'row' | 'column' | 'cell' = 'cell';
      if (onLeftEdge) type = 'row';
      else if (onTopEdge) type = 'column';

      editor.commands.focus();
      setMenu({ x: e.clientX, y: e.clientY, type });
    };

    const handleClick = () => setMenu(null);

    editorDom.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleClick);
    return () => {
      editorDom.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleClick);
    };
  }, [editor]);

  // -------------------------------------------------------------------------
  // Command runner
  // -------------------------------------------------------------------------
  const run = useCallback(
    (fn: () => boolean) => {
      editor.chain().focus().run();
      fn();
      setMenu(null);
    },
    [editor],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <>
      {/* Floating toolbar at table's top-right corner */}
      {toolbar && (
        <div
          className="fixed z-40 flex items-center gap-0.5 rounded-md border border-[var(--vscode-widget-border)] bg-[var(--vscode-editorWidget-background)] p-0.5 shadow-lg"
          style={{
            left: `${toolbar.x}px`,
            top: `${toolbar.y}px`,
            transform: 'translate(100%, -100%)',
          }}
          // Prevent editor blur from hiding the toolbar when clicking buttons
          onMouseDown={(e) => e.preventDefault()}
        >
          <ToolbarBtn
            title="上方插入行"
            onClick={() => run(() => editor.commands.addRowBefore())}
          >
            <span className="text-[0.7rem] font-medium leading-none">行↑</span>
          </ToolbarBtn>
          <ToolbarBtn
            title="下方插入行"
            onClick={() => run(() => editor.commands.addRowAfter())}
          >
            <span className="text-[0.7rem] font-medium leading-none">行↓</span>
          </ToolbarBtn>
          <ToolbarDivider />
          <ToolbarBtn
            title="左侧插入列"
            onClick={() => run(() => editor.commands.addColumnBefore())}
          >
            <span className="text-[0.7rem] font-medium leading-none">列←</span>
          </ToolbarBtn>
          <ToolbarBtn
            title="右侧插入列"
            onClick={() => run(() => editor.commands.addColumnAfter())}
          >
            <span className="text-[0.7rem] font-medium leading-none">列→</span>
          </ToolbarBtn>
          <ToolbarDivider />
          <ToolbarBtn
            title="删除行"
            onClick={() => run(() => editor.commands.deleteRow())}
          >
            <span className="text-[0.7rem] font-medium leading-none text-[var(--vscode-errorForeground)]">删行</span>
          </ToolbarBtn>
          <ToolbarBtn
            title="删除列"
            onClick={() => run(() => editor.commands.deleteColumn())}
          >
            <span className="text-[0.7rem] font-medium leading-none text-[var(--vscode-errorForeground)]">删列</span>
          </ToolbarBtn>
          <ToolbarDivider />
          <ToolbarBtn
            title="删除表格"
            onClick={() => run(() => editor.commands.deleteTable())}
          >
            <Trash2 className="h-3.5 w-3.5 text-[var(--vscode-errorForeground)]" />
          </ToolbarBtn>
        </div>
      )}

      {/* Right-click context menu */}
      {menu && (
        <div
          className="fixed z-50 min-w-[150px] rounded-lg border border-[var(--vscode-widget-border)] bg-[var(--vscode-editorWidget-background)] py-1 shadow-xl"
          style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
        >
          {menu.type === 'row' && (
            <>
              <MenuItem label="上方插入行" onClick={() => run(() => editor.commands.addRowBefore())} />
              <MenuItem label="下方插入行" onClick={() => run(() => editor.commands.addRowAfter())} />
              <MenuSep />
              <MenuItem label="删除行" danger onClick={() => run(() => editor.commands.deleteRow())} />
            </>
          )}
          {menu.type === 'column' && (
            <>
              <MenuItem label="左侧插入列" onClick={() => run(() => editor.commands.addColumnBefore())} />
              <MenuItem label="右侧插入列" onClick={() => run(() => editor.commands.addColumnAfter())} />
              <MenuSep />
              <MenuItem label="删除列" danger onClick={() => run(() => editor.commands.deleteColumn())} />
            </>
          )}
          {menu.type === 'cell' && (
            <>
              <MenuItem label="上方插入行" onClick={() => run(() => editor.commands.addRowBefore())} />
              <MenuItem label="下方插入行" onClick={() => run(() => editor.commands.addRowAfter())} />
              <MenuItem label="左侧插入列" onClick={() => run(() => editor.commands.addColumnBefore())} />
              <MenuItem label="右侧插入列" onClick={() => run(() => editor.commands.addColumnAfter())} />
              <MenuSep />
              <MenuItem label="删除表格" danger onClick={() => run(() => editor.commands.deleteTable())} />
            </>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToolbarBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-[var(--vscode-editor-foreground)] transition-colors hover:bg-[var(--vscode-list-hoverBackground)]"
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return (
    <div className="mx-0.5 h-4 w-px bg-[var(--vscode-widget-border)]" />
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center px-3 py-1.5 text-left text-[0.8rem] transition-colors hover:bg-[var(--vscode-list-hoverBackground)] ${
        danger
          ? 'text-[var(--vscode-errorForeground)]'
          : 'text-[var(--vscode-editor-foreground)]'
      }`}
    >
      {label}
    </button>
  );
}

function MenuSep() {
  return <div className="my-1 h-px bg-[var(--vscode-widget-border)]" />;
}
