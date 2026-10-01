/**
 * TableControls — compact floating toolbar for TipTap tables.
 *
 * When the pointer hovers a table (or the selection sits inside one — the
 * original trigger, kept as a keyboard/no-hover fallback), a minimal toolbar
 * appears at the table's top-right corner with dropdowns for row / column /
 * alignment / merge actions, a collapse/expand toggle (driven by the table
 * node's `collapsed` attribute), and a standalone trash icon to delete the
 * entire table. Same unified interaction as every other block view's
 * floating toolbar (hover / focus / selection).
 *
 * Hovering each dropdown icon reveals the relevant actions:
 *   行 → 上方插入行 / 下方插入行 / 设为(取消)表头行 / 删除行
 *   列 → 左侧插入列 / 右侧插入列 / 删除列
 *   对齐 → 左对齐 / 居中 / 右对齐 (水平) + 顶部/居中/底部 (垂直)
 *   合并 → 合并单元格 / 拆分单元格
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { CellSelection } from '@tiptap/pm/tables';
import { TextSelection } from '@tiptap/pm/state';
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
  Merge,
  Split,
  Heading,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { MenuList, MenuItem, MenuDivider } from '../../ui/MenuList';

const TABLE_MENU_TRIGGER_CLASS =
  'editor-toolbar-btn table-ctrl-btn flex h-7 w-7 items-center justify-center rounded text-[var(--vscode-editor-foreground)]';
const TABLE_MENU_PANEL_CLASS =
  'absolute right-0 top-full z-[101] mt-2 min-w-[130px]';
const TABLE_MENU_ACTIVE_CLASS = '!text-[var(--vscode-button-background)]';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TableControlsProps {
  editor: Editor;
}

/** Which dropdown is currently open (null = none). */
type DropdownKey = 'row' | 'column' | 'align' | 'merge' | null;

export default function TableControls({ editor }: TableControlsProps) {
  // 工具条常驻挂载（显隐交给 CSS 过渡，与各 blockView 的胶囊/工具条同一
  // 套淡入落下动画）：pos 保留最后一次测量值，隐藏时元素原地淡出。
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [open, setOpen] = useState<DropdownKey>(null);
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('left');
  const [vAlign, setVAlign] = useState<'top' | 'middle' | 'bottom'>('top');
  // Whether merge / split are currently available given the selection.
  // mergeCells needs a CellSelection spanning ≥ 2 cells; splitCell needs the
  // cursor inside a cell with colspan > 1 or rowspan > 1.
  const [canMerge, setCanMerge] = useState(false);
  const [canSplit, setCanSplit] = useState(false);
  /** Whether the row containing the cursor is a header row. */
  const [hasHeaderRow, setHasHeaderRow] = useState(false);
  /** Whether the table containing the cursor is collapsed (only first row). */
  const [collapsed, setCollapsed] = useState(false);
  const interactingRef = useRef(false);
  /** rAF handle so the transaction listener coalesces to one update/frame. */
  const rafRef = useRef<number | null>(null);
  // ── Hover 追踪（统一交互：hover / 选区任一满足即显示）──
  /** 当前悬停的表格元素；null = 指针不在任何表格上。 */
  const hoveredTableRef = useRef<HTMLElement | null>(null);
  /** 指针是否在工具条上 —— 工具条不在表格 DOM 内，靠它避免"从表格移向
      工具条"的途中被 mouseout 收走。 */
  const toolbarHoverRef = useRef(false);
  /** 延迟收起定时器（表格 → 工具条 / 工具条 → 表格的宽限期）。 */
  const hideTimerRef = useRef<number | null>(null);

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
    // ── 定位基准：悬停的表格优先，其次选区所在的表格 ──
    let tableEl: HTMLElement | null = hoveredTableRef.current;
    if (tableEl && !tableEl.isConnected) tableEl = null;

    const { $from } = editor.state.selection;
    let tablePos: number | null = null;
    let tableCollapsed = false;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'table') {
        tablePos = $from.before(d);
        tableCollapsed = !!node.attrs.collapsed;
        break;
      }
    }
    if (!tableEl && tablePos !== null) {
      // Resolve the DOM node for THIS specific table (the one the selection is
      // inside), not just the first `<table>` in the document — a document can
      // contain multiple tables.
      tableEl = editor.view.nodeDOM(tablePos) as HTMLElement | null;
    }

    if (!tableEl) {
      // Avoid a pointless state update (which would re-render) when the
      // toolbar is already hidden — the overwhelmingly common case while
      // typing in a large doc full of non-table blocks.
      setToolbarVisible(false);
      return;
    }

    const rect = tableEl.getBoundingClientRect();
    setToolbarPos((prev) =>
      prev && prev.x === rect.right && prev.y === rect.top
        ? prev
        : { x: rect.right, y: rect.top },
    );
    setToolbarVisible(true);

    // collapsed：选区在本表格内时直接用节点属性；纯悬停（选区在别处）
    // 时从 DOM 反查该表格的节点。
    if (tablePos !== null) {
      setCollapsed(tableCollapsed);
    } else {
      try {
        const $inside = editor.state.doc.resolve(editor.view.posAtDOM(tableEl, 0));
        for (let d = $inside.depth; d > 0; d--) {
          const node = $inside.node(d);
          if (node.type.name === 'table') {
            setCollapsed(!!node.attrs.collapsed);
            break;
          }
        }
      } catch {
        // 元素可能刚脱离文档；下一次 mouseover 会重新校正
      }
    }

    if (editor.isActive({ textAlign: 'center' })) setAlign('center');
    else if (editor.isActive({ textAlign: 'right' })) setAlign('right');
    else setAlign('left');

    // Detect vertical alignment from the cell containing the cursor.
    // vAlign is a cell-level attribute (null = CSS default 'top').
    let cellVAlign: 'top' | 'middle' | 'bottom' = 'top';
    let cellColspan = 1;
    let cellRowspan = 1;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        const va = node.attrs.vAlign;
        if (va === 'top' || va === 'middle' || va === 'bottom') cellVAlign = va;
        cellColspan = Number(node.attrs.colspan) || 1;
        cellRowspan = Number(node.attrs.rowspan) || 1;
        break;
      }
    }
    setVAlign(cellVAlign);

    // Detect whether the row containing the cursor is a header row.
    // 选区所在行优先（toggleHeaderRow 作用于选区所在行）；纯悬停（选区
    // 不在任何表格里）时退化为看 DOM 第一行是否含 th。
    let currentRowIsHeader = false;
    if (tablePos !== null) {
      for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d);
        if (node.type.name === 'tableRow') {
          currentRowIsHeader = node.child(0)?.type.name === 'tableHeader';
          break;
        }
      }
    } else {
      currentRowIsHeader = !!tableEl.querySelector('tr')?.querySelector('th');
    }
    setHasHeaderRow(currentRowIsHeader);

    // Merge is available when a CellSelection spans more than one cell.
    // (CellSelection with anchor === head is a single-cell selection.)
    const sel = editor.state.selection;
    let merge = false;
    if (sel instanceof CellSelection) {
      merge = sel.$anchorCell.pos !== sel.$headCell.pos;
    }
    setCanMerge(merge);

    // Split is available when the cursor sits in a merged cell.
    setCanSplit(cellColspan > 1 || cellRowspan > 1);
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
        // 编辑器失焦不必然收起 —— 指针还悬停在表格/工具条上时保持显示
        //（hover 触发路径），否则按原逻辑收起。
        if (!interactingRef.current && !hoveredTableRef.current && !toolbarHoverRef.current) {
          setToolbarVisible(false);
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

  // ── Hover 触发：指针进入表格 → 显示；离开（且未移向工具条）→ 延迟收起。
  //    收起时若选区仍在某张表格内，scheduleUpdate 会按原选中路径把工具条
  //    重新锚定到那张表 —— 两条触发路径互不干扰。 ──
  useEffect(() => {
    const dom = editor.view.dom;

    const cancelHide = () => {
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const scheduleHide = () => {
      if (hideTimerRef.current !== null) return;
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        if (toolbarHoverRef.current) return; // 已移到工具条上，保持显示
        hoveredTableRef.current = null;
        scheduleUpdate();
      }, 140);
    };

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const table = target?.closest?.('table');
      if (!table || table === hoveredTableRef.current) return;
      cancelHide();
      hoveredTableRef.current = table;
      updateAll();
    };

    const onMouseOut = (e: MouseEvent) => {
      const from = (e.target as HTMLElement | null)?.closest?.('table');
      if (!from) return;
      const to = (e.relatedTarget as HTMLElement | null)?.closest?.('table');
      if (to === from) return; // 表格内部移动（含进入子菜单/单元格）
      scheduleHide();
    };

    dom.addEventListener('mouseover', onMouseOver);
    dom.addEventListener('mouseout', onMouseOut);
    return () => {
      dom.removeEventListener('mouseover', onMouseOver);
      dom.removeEventListener('mouseout', onMouseOut);
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [editor, updateAll, scheduleUpdate]);

  // -------------------------------------------------------------------------
  // Command runner
  // -------------------------------------------------------------------------
  // ── 命令执行前把选区放进悬停的表格 ──
  // hover 展示时编辑器选区可能不在任何表格里，而表格命令都作用于选区
  // 所在的表格：点击工具条时先把选区落到该表格的第一个单元格，命令才
  // 会作用于用户看到的这张表。选区已在本表格内（含 CellSelection）时
  // 不做任何事，避免破坏用户已选好的单元格范围。
  const ensureSelectionInTable = useCallback(() => {
    const tableEl = hoveredTableRef.current;
    if (!tableEl || !tableEl.isConnected) return;
    try {
      const insidePos = editor.view.posAtDOM(tableEl, 0);
      const $inside = editor.state.doc.resolve(insidePos);
      for (let d = $inside.depth; d > 0; d--) {
        if ($inside.node(d).type.name !== 'table') continue;
        const before = $inside.before(d);
        const after = $inside.after(d);
        const { from, to } = editor.state.selection;
        if (from >= before && to <= after) return;
        const $start = editor.state.doc.resolve(before + 1);
        editor.view.dispatch(
          editor.state.tr.setSelection(TextSelection.near($start)),
        );
        return;
      }
    } catch {
      // 元素脱离文档等异常 —— 让原命令自行空跑
    }
  }, [editor]);

  const run = useCallback(
    (fn: () => boolean) => {
      ensureSelectionInTable();
      editor.chain().focus().run();
      fn();
      setOpen(null);
      setTimeout(updateAll, 50);
    },
    [editor, updateAll, ensureSelectionInTable],
  );

  const setAlignment = useCallback(
    (value: 'left' | 'center' | 'right') => {
      ensureSelectionInTable();
      editor.chain().focus().setTextAlign(value).run();
      setAlign(value);
      setOpen(null);
    },
    [editor, ensureSelectionInTable],
  );

  const setVAlignment = useCallback(
    (value: 'top' | 'middle' | 'bottom') => {
      ensureSelectionInTable();
      editor.chain().focus().setCellAttribute('vAlign', value).run();
      setVAlign(value);
      setOpen(null);
    },
    [editor, ensureSelectionInTable],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      data-table-control
      className={`editor-toolbar fixed ${toolbarVisible ? 'is-visible' : ''}`}
      style={{
        left: `${toolbarPos?.x ?? 0}px`,
        top: `${toolbarPos?.y ?? 0}px`,
      }}
      onMouseEnter={() => {
        toolbarHoverRef.current = true;
        // 从表格移向工具条：取消延迟收起
        if (hideTimerRef.current !== null) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
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
        toolbarHoverRef.current = false;
        setOpen(null);
        // 离开工具条 → 延迟收起；期间回到表格/工具条会被取消
        if (hideTimerRef.current === null) {
          hideTimerRef.current = window.setTimeout(() => {
            hideTimerRef.current = null;
            if (toolbarHoverRef.current) return;
            hoveredTableRef.current = null;
            scheduleUpdate();
          }, 140);
        }
      }}
    >
      {/* Row dropdown */}
      <div
        className="relative flex items-center"
        onMouseEnter={() => setOpen('row')}
      >
        <button type="button" className={TABLE_MENU_TRIGGER_CLASS}>
          <Rows3 className="h-4 w-4" />
        </button>
        {open === 'row' && (
          <MenuList className={TABLE_MENU_PANEL_CLASS}>
            <MenuItem onClick={() => run(() => editor.commands.addRowBefore())}>
              上方插入行
            </MenuItem>
            <MenuItem onClick={() => run(() => editor.commands.addRowAfter())}>
              下方插入行
            </MenuItem>
            <MenuDivider />
            <MenuItem
              icon={<Heading className="h-3.5 w-3.5" />}
              onClick={() => run(() => editor.commands.toggleHeaderRow())}
              className={hasHeaderRow ? TABLE_MENU_ACTIVE_CLASS : ''}
            >
              {hasHeaderRow ? '取消表头行' : '设为表头行'}
            </MenuItem>
            <MenuDivider />
            <MenuItem
              variant="danger"
              onClick={() => run(() => editor.commands.deleteRow())}
            >
              删除行
            </MenuItem>
          </MenuList>
        )}
      </div>

      {/* Column dropdown */}
      <div
        className="relative flex items-center"
        onMouseEnter={() => setOpen('column')}
      >
        <button type="button" className={TABLE_MENU_TRIGGER_CLASS}>
          <Columns3 className="h-4 w-4" />
        </button>
        {open === 'column' && (
          <MenuList className={TABLE_MENU_PANEL_CLASS}>
            <MenuItem
              onClick={() => run(() => editor.commands.addColumnBefore())}
            >
              左侧插入列
            </MenuItem>
            <MenuItem
              onClick={() => run(() => editor.commands.addColumnAfter())}
            >
              右侧插入列
            </MenuItem>
            <MenuDivider />
            <MenuItem
              variant="danger"
              onClick={() => run(() => editor.commands.deleteColumn())}
            >
              删除列
            </MenuItem>
          </MenuList>
        )}
      </div>

      {/* Align dropdown */}
      <div
        className="relative flex items-center"
        onMouseEnter={() => setOpen('align')}
      >
        <button type="button" className={TABLE_MENU_TRIGGER_CLASS}>
          <AlignLeft className="h-4 w-4" />
        </button>
        {open === 'align' && (
          <MenuList className={TABLE_MENU_PANEL_CLASS}>
            <MenuItem
              icon={<AlignLeft className="h-3.5 w-3.5" />}
              onClick={() => setAlignment('left')}
              className={align === 'left' ? TABLE_MENU_ACTIVE_CLASS : ''}
            >
              左对齐
            </MenuItem>
            <MenuItem
              icon={<AlignCenter className="h-3.5 w-3.5" />}
              onClick={() => setAlignment('center')}
              className={align === 'center' ? TABLE_MENU_ACTIVE_CLASS : ''}
            >
              居中对齐
            </MenuItem>
            <MenuItem
              icon={<AlignRight className="h-3.5 w-3.5" />}
              onClick={() => setAlignment('right')}
              className={align === 'right' ? TABLE_MENU_ACTIVE_CLASS : ''}
            >
              右对齐
            </MenuItem>
            <MenuDivider />
            <MenuItem
              icon={<AlignVerticalJustifyStart className="h-3.5 w-3.5" />}
              onClick={() => setVAlignment('top')}
              className={vAlign === 'top' ? TABLE_MENU_ACTIVE_CLASS : ''}
            >
              顶部对齐
            </MenuItem>
            <MenuItem
              icon={<AlignVerticalJustifyCenter className="h-3.5 w-3.5" />}
              onClick={() => setVAlignment('middle')}
              className={vAlign === 'middle' ? TABLE_MENU_ACTIVE_CLASS : ''}
            >
              垂直居中
            </MenuItem>
            <MenuItem
              icon={<AlignVerticalJustifyEnd className="h-3.5 w-3.5" />}
              onClick={() => setVAlignment('bottom')}
              className={vAlign === 'bottom' ? TABLE_MENU_ACTIVE_CLASS : ''}
            >
              底部对齐
            </MenuItem>
          </MenuList>
        )}
      </div>

      {/* Merge / split dropdown */}
      <div
        className="relative flex items-center"
        onMouseEnter={() => setOpen('merge')}
      >
        <button type="button" className={TABLE_MENU_TRIGGER_CLASS}>
          <Merge className="h-4 w-4" />
        </button>
        {open === 'merge' && (
          <MenuList className={TABLE_MENU_PANEL_CLASS}>
            <MenuItem
              icon={<Merge className="h-3.5 w-3.5" />}
              disabled={!canMerge}
              onClick={() => {
                if (!canMerge) return;
                run(() => editor.commands.mergeCells());
              }}
            >
              合并单元格
            </MenuItem>
            <MenuItem
              icon={<Split className="h-3.5 w-3.5" />}
              disabled={!canSplit}
              onClick={() => {
                if (!canSplit) return;
                run(() => editor.commands.splitCell());
              }}
            >
              拆分单元格
            </MenuItem>
          </MenuList>
        )}
      </div>

      {/* Collapse / expand table */}
      <button
        type="button"
        title={collapsed ? '展开表格' : '折叠表格'}
        onClick={() => run(() => editor.commands.toggleTableCollapsed())}
        className="editor-toolbar-btn table-ctrl-btn flex h-7 w-7 items-center justify-center rounded text-[var(--vscode-editor-foreground)]"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

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
