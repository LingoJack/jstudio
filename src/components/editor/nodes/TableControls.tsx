/**
 * TableControls — compact floating toolbar for TipTap tables.
 *
 * When the cursor is inside a table, a minimal toolbar with 3 icons appears
 * at the table's top-right corner:
 *
 *   [ 行 ]  [ 列 ]  [ 对齐 ]
 *
 * Hovering each icon reveals a dropdown with the relevant actions:
 *   行 → 上方插入行 / 下方插入行 / 删除行
 *   列 → 左侧插入列 / 右侧插入列 / 删除列
 *   对齐 → 左对齐 / 居中 / 右对齐
 *
 * Plus a standalone trash icon to delete the entire table.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Trash2,
  Rows3,
  Columns3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TableControlsProps {
  editor: Editor;
}

/** Which dropdown is currently open (null = none). */
type DropdownKey = 'row' | 'column' | 'align' | null;

export default function TableControls({ editor }: TableControlsProps) {
  const [toolbar, setToolbar] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState<DropdownKey>(null);
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('left');
  const [vAlign, setVAlign] = useState<'top' | 'middle' | 'bottom'>('top');
  const interactingRef = useRef(false);
  /** rAF handle so the transaction listener coalesces to one update/frame. */
  const rafRef = useRef<number | null>(null);

  // -------------------------------------------------------------------------
  // Core: detect table + update toolbar position + alignment
  //
  // Cheap early-out FIRST: walking the selection's ancestors to see whether
  // we're inside a table is O(depth) and touches no DOM, so it runs on every
  // keystroke essentially for free.  Only when we ARE in a table do we hit
  // the DOM (querySelector + getBoundingClientRect + isActive).  This keeps
  // the common case (typing outside any table) from doing layout work.
  // -------------------------------------------------------------------------
  const updateAll = useCallback(() => {
    const { $from } = editor.state.selection;
    let tablePos: number | null = null;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'table') {
        tablePos = $from.before(d);
        break;
      }
    }

    if (tablePos === null) {
      // Avoid a pointless state update (which would re-render) when the
      // toolbar is already hidden — the overwhelmingly common case while
      // typing in a large doc full of non-table blocks.
      setToolbar((prev) => (prev === null ? prev : null));
      return;
    }

    // Resolve the DOM node for THIS specific table (the one the selection is
    // inside), not just the first `<table>` in the document — a document can
    // contain multiple tables.
    const tableEl = editor.view.nodeDOM(tablePos) as HTMLElement | null;
    if (!tableEl) {
      setToolbar((prev) => (prev === null ? prev : null));
      return;
    }

    const rect = tableEl.getBoundingClientRect();
    setToolbar({ x: rect.right, y: rect.top });

    if (editor.isActive({ textAlign: 'center' })) setAlign('center');
    else if (editor.isActive({ textAlign: 'right' })) setAlign('right');
    else setAlign('left');

    // Detect vertical alignment from the cell containing the cursor.
    // vAlign is a cell-level attribute (null = CSS default 'top').
    let cellVAlign: 'top' | 'middle' | 'bottom' = 'top';
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        const va = node.attrs.vAlign;
        if (va === 'top' || va === 'middle' || va === 'bottom') cellVAlign = va;
        break;
      }
    }
    setVAlign(cellVAlign);
  }, [editor]);

  /**
   * rAF-throttled wrapper for the `transaction` listener: ProseMirror can
   * fire many transactions per frame (e.g. composing IME, multi-step
   * commands).  Coalescing them to a single update per animation frame keeps
   * the per-keystroke cost flat regardless of transaction volume.
   */
  const scheduleUpdate = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      updateAll();
    });
  }, [updateAll]);

  // -------------------------------------------------------------------------
  // Listen to editor state changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    editor.on('transaction', scheduleUpdate);
    editor.on('focus', updateAll);

    const handleBlur = () => {
      setTimeout(() => {
        if (!interactingRef.current) {
          setToolbar(null);
          setOpen(null);
        }
      }, 200);
    };
    editor.on('blur', handleBlur);

    const handleScroll = () => scheduleUpdate();
    const scrollContainer = editor.view.dom.closest(
      '[class*="scroll"], [class*="overflow"]',
    ) as HTMLElement | null;
    scrollContainer?.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);

    updateAll();

    return () => {
      editor.off('transaction', scheduleUpdate);
      editor.off('focus', updateAll);
      editor.off('blur', handleBlur);
      scrollContainer?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [editor, updateAll, scheduleUpdate]);

  // -------------------------------------------------------------------------
  // Command runner
  // -------------------------------------------------------------------------
  const run = useCallback(
    (fn: () => boolean) => {
      editor.chain().focus().run();
      fn();
      setOpen(null);
      setTimeout(updateAll, 50);
    },
    [editor, updateAll],
  );

  const setAlignment = useCallback(
    (value: 'left' | 'center' | 'right') => {
      editor.chain().focus().setTextAlign(value).run();
      setAlign(value);
      setOpen(null);
    },
    [editor],
  );

  const setVAlignment = useCallback(
    (value: 'top' | 'middle' | 'bottom') => {
      editor.chain().focus().setCellAttribute('vAlign', value).run();
      setVAlign(value);
      setOpen(null);
    },
    [editor],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (!toolbar) return null;

  return (
    <div
      data-table-control
      className="editor-toolbar fixed"
      style={{
        left: `${toolbar.x}px`,
        top: `${toolbar.y}px`,
        transform: 'translate(-100%, calc(-100% - 6px))',
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        interactingRef.current = true;
      }}
      onMouseUp={() => {
        interactingRef.current = false;
      }}
      onMouseLeave={() => {
        interactingRef.current = false;
        setOpen(null);
      }}
    >
      {/* Row dropdown */}
      <Dropdown
        icon={<Rows3 className="h-4 w-4" />}
        isOpen={open === 'row'}
        onHover={() => setOpen('row')}
      >
        <DropdownItem label="上方插入行" onClick={() => run(() => editor.commands.addRowBefore())} />
        <DropdownItem label="下方插入行" onClick={() => run(() => editor.commands.addRowAfter())} />
        <DropdownSep />
        <DropdownItem label="删除行" danger onClick={() => run(() => editor.commands.deleteRow())} />
      </Dropdown>

      {/* Column dropdown */}
      <Dropdown
        icon={<Columns3 className="h-4 w-4" />}
        isOpen={open === 'column'}
        onHover={() => setOpen('column')}
      >
        <DropdownItem label="左侧插入列" onClick={() => run(() => editor.commands.addColumnBefore())} />
        <DropdownItem label="右侧插入列" onClick={() => run(() => editor.commands.addColumnAfter())} />
        <DropdownSep />
        <DropdownItem label="删除列" danger onClick={() => run(() => editor.commands.deleteColumn())} />
      </Dropdown>

      {/* Align dropdown */}
      <Dropdown
        icon={<AlignLeft className="h-4 w-4" />}
        isOpen={open === 'align'}
        onHover={() => setOpen('align')}
      >
        <DropdownItem
          label="左对齐"
          icon={<AlignLeft className="h-3.5 w-3.5" />}
          active={align === 'left'}
          onClick={() => setAlignment('left')}
        />
        <DropdownItem
          label="居中对齐"
          icon={<AlignCenter className="h-3.5 w-3.5" />}
          active={align === 'center'}
          onClick={() => setAlignment('center')}
        />
        <DropdownItem
          label="右对齐"
          icon={<AlignRight className="h-3.5 w-3.5" />}
          active={align === 'right'}
          onClick={() => setAlignment('right')}
        />
        <DropdownSep />
        <DropdownItem
          label="顶部对齐"
          icon={<AlignVerticalJustifyStart className="h-3.5 w-3.5" />}
          active={vAlign === 'top'}
          onClick={() => setVAlignment('top')}
        />
        <DropdownItem
          label="垂直居中"
          icon={<AlignVerticalJustifyCenter className="h-3.5 w-3.5" />}
          active={vAlign === 'middle'}
          onClick={() => setVAlignment('middle')}
        />
        <DropdownItem
          label="底部对齐"
          icon={<AlignVerticalJustifyEnd className="h-3.5 w-3.5" />}
          active={vAlign === 'bottom'}
          onClick={() => setVAlignment('bottom')}
        />
      </Dropdown>

      {/* Divider */}
      <div className="mx-0.5 h-5 w-px bg-[var(--vscode-menu-border)]" />

      {/* Delete table */}
      <button
        type="button"
        title="删除表格"
        onClick={() => run(() => editor.commands.deleteTable())}
        className="editor-toolbar-btn table-ctrl-btn flex h-7 items-center justify-center rounded px-1.5 text-[var(--vscode-errorForeground)]"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dropdown trigger + panel
// ---------------------------------------------------------------------------

interface DropdownProps {
  icon: React.ReactNode;
  isOpen: boolean;
  onHover: () => void;
  children: React.ReactNode;
}

function Dropdown({ icon, isOpen, onHover, children }: DropdownProps) {
  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onMouseEnter={onHover}
        className="editor-toolbar-btn table-ctrl-btn flex h-7 w-7 items-center justify-center rounded text-[var(--vscode-editor-foreground)]"
      >
        {icon}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className="editor-toolbar-menu absolute right-0 top-full z-[101] mt-1 min-w-[130px] py-1"
          onMouseEnter={onHover}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  label,
  icon,
  active,
  danger,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[0.78rem] transition-colors hover:bg-[var(--vscode-list-hoverBackground)] ${
        danger
          ? 'text-[var(--vscode-errorForeground)]'
          : active
            ? 'text-[var(--vscode-button-background)]'
            : 'text-[var(--vscode-editor-foreground)]'
      }`}
    >
      {icon && <span className="flex h-3.5 w-3.5 items-center justify-center">{icon}</span>}
      {label}
    </button>
  );
}

function DropdownSep() {
  return <div className="my-1 h-px bg-[var(--vscode-menu-border)]" />;
}
