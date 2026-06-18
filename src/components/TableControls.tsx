/**
 * TableControls — hover controls + context menu for TipTap tables.
 *
 * Features:
 *   • Hovering the row area on the left edge shows a [+] button to insert a row below.
 *   • Hovering the column area on the top edge shows a [+] button to insert a column to the right.
 *   • Right-click on a row header → context menu: Insert row above/below, Delete row.
 *   • Right-click on a column header → context menu: Insert col left/right, Delete column.
 *   • Right-click on a cell → context menu: Delete table.
 *
 * This component is rendered once per editor and uses event delegation on the
 * editor DOM (`.ProseMirror`) to detect which table is being hovered.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { Plus, Trash2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContextMenuType = 'row' | 'column' | 'cell';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  type: ContextMenuType;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TableControlsProps {
  editor: Editor;
}

export default function TableControls({ editor }: TableControlsProps) {
  const [addBtn, setAddBtn] = useState<{
    visible: boolean;
    x: number;
    y: number;
    kind: 'row' | 'column';
  }>({ visible: false, x: 0, y: 0, kind: 'row' });

  const [menu, setMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    type: 'cell',
  });

  const containerRef = useRef<HTMLDivElement | null>(null);

  // -------------------------------------------------------------------------
  // Helper: find the closest <table> inside the editor for a given cell
  // -------------------------------------------------------------------------
  const getTableFromCell = useCallback((cell: HTMLElement): HTMLTableElement | null => {
    return cell.closest('table');
  }, []);

  // -------------------------------------------------------------------------
  // Mouse move: detect row/column hover edges to show [+] buttons
  // -------------------------------------------------------------------------
  useEffect(() => {
    const editorEl = editor.view.dom as HTMLElement;

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const table = target.closest('table');
      if (!table) {
        setAddBtn((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      // Only react when hovering over a cell (th/td)
      const cell = target.closest('th, td');
      if (!cell) {
        setAddBtn((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }

      const tableRect = table.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();

      // --- Row + button ---
      // Show on the left edge, vertically aligned with the hovered row.
      // The + appears just below the hovered row.
      if (e.clientX - tableRect.left < 28) {
        setAddBtn({
          visible: true,
          x: tableRect.left - 14,
          y: cellRect.bottom - 11,
          kind: 'row',
        });
        return;
      }

      // --- Column + button ---
      // Show on the top edge, horizontally aligned with the hovered column.
      // The + appears just to the right of the hovered column.
      if (e.clientY - tableRect.top < 28) {
        setAddBtn({
          visible: true,
          x: cellRect.right - 11,
          y: tableRect.top - 14,
          kind: 'column',
        });
        return;
      }

      setAddBtn((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    const handleMouseLeave = () => {
      setAddBtn((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    editorEl.addEventListener('mousemove', handleMouseMove);
    editorEl.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      editorEl.removeEventListener('mousemove', handleMouseMove);
      editorEl.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [editor]);

  // -------------------------------------------------------------------------
  // Context menu (right-click)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const editorEl = editor.view.dom as HTMLElement;

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest('th, td');
      if (!cell) return;

      const table = getTableFromCell(cell as HTMLElement);
      if (!table) return;

      e.preventDefault();

      const isHeaderRow = target.closest('th') !== null;
      const isFirstCol = (cell as HTMLElement).cellIndex === 0;

      // Determine menu type: row header area (left edge) → row menu,
      // column header area (top row) → column menu, otherwise cell menu.
      const tableRect = table.getBoundingClientRect();
      const onLeftEdge = e.clientX - tableRect.left < 28;
      const onTopEdge = e.clientY - tableRect.top < 28;

      let type: ContextMenuType = 'cell';
      if (onLeftEdge) type = 'row';
      else if (onTopEdge) type = 'column';

      // Focus the cell so editor commands know the context position
      editor.commands.focus();

      setMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        type,
      });
    };

    const handleClick = () => {
      setMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    editorEl.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleClick);
    return () => {
      editorEl.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleClick);
    };
  }, [editor, getTableFromCell]);

  // -------------------------------------------------------------------------
  // Command handlers
  // -------------------------------------------------------------------------
  const runCmd = useCallback(
    (fn: () => boolean) => {
      editor.chain().focus().run();
      fn();
      setMenu((prev) => ({ ...prev, visible: false }));
    },
    [editor],
  );

  // -------------------------------------------------------------------------
  // [+] button click — insert row/column
  // -------------------------------------------------------------------------
  const handleAddClick = useCallback(() => {
    if (addBtn.kind === 'row') {
      runCmd(() => editor.commands.addRowAfter());
    } else {
      runCmd(() => editor.commands.addColumnAfter());
    }
  }, [addBtn.kind, editor, runCmd]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div ref={containerRef}>
      {/* Floating [+] button */}
      {addBtn.visible && (
        <button
          type="button"
          onClick={handleAddClick}
          className="fixed z-50 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--vscode-widget-border)] bg-[var(--vscode-editorWidget-background)] text-[var(--vscode-editor-foreground)] shadow-md transition-opacity hover:bg-[var(--vscode-list-hoverBackground)]"
          style={{
            left: `${addBtn.x}px`,
            top: `${addBtn.y}px`,
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Context menu */}
      {menu.visible && (
        <div
          className="fixed z-50 min-w-[160px] rounded-lg border border-[var(--vscode-widget-border)] bg-[var(--vscode-editorWidget-background)] py-1 shadow-lg"
          style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.type === 'row' && (
            <>
              <MenuItem
                icon={<ArrowUp className="h-3.5 w-3.5" />}
                label="上方插入行"
                onClick={() => runCmd(() => editor.commands.addRowBefore())}
              />
              <MenuItem
                icon={<ArrowDown className="h-3.5 w-3.5" />}
                label="下方插入行"
                onClick={() => runCmd(() => editor.commands.addRowAfter())}
              />
              <MenuDivider />
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label="删除行"
                danger
                onClick={() => runCmd(() => editor.commands.deleteRow())}
              />
            </>
          )}

          {menu.type === 'column' && (
            <>
              <MenuItem
                icon={<ArrowLeft className="h-3.5 w-3.5" />}
                label="左侧插入列"
                onClick={() => runCmd(() => editor.commands.addColumnBefore())}
              />
              <MenuItem
                icon={<ArrowRight className="h-3.5 w-3.5" />}
                label="右侧插入列"
                onClick={() => runCmd(() => editor.commands.addColumnAfter())}
              />
              <MenuDivider />
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label="删除列"
                danger
                onClick={() => runCmd(() => editor.commands.deleteColumn())}
              />
            </>
          )}

          {menu.type === 'cell' && (
            <>
              <MenuItem
                icon={<ArrowUp className="h-3.5 w-3.5" />}
                label="上方插入行"
                onClick={() => runCmd(() => editor.commands.addRowBefore())}
              />
              <MenuItem
                icon={<ArrowDown className="h-3.5 w-3.5" />}
                label="下方插入行"
                onClick={() => runCmd(() => editor.commands.addRowAfter())}
              />
              <MenuItem
                icon={<ArrowLeft className="h-3.5 w-3.5" />}
                label="左侧插入列"
                onClick={() => runCmd(() => editor.commands.addColumnBefore())}
              />
              <MenuItem
                icon={<ArrowRight className="h-3.5 w-3.5" />}
                label="右侧插入列"
                onClick={() => runCmd(() => editor.commands.addColumnAfter())}
              />
              <MenuDivider />
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label="删除表格"
                danger
                onClick={() => runCmd(() => editor.commands.deleteTable())}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[0.8rem] transition-colors hover:bg-[var(--vscode-list-hoverBackground)] ${
        danger
          ? 'text-[var(--vscode-errorForeground)]'
          : 'text-[var(--vscode-editor-foreground)]'
      }`}
    >
      <span className="flex h-3.5 w-3.5 items-center justify-center">{icon}</span>
      {label}
    </button>
  );
}

function MenuDivider() {
  return (
    <div className="my-1 h-px bg-[var(--vscode-widget-border)]" />
  );
}
