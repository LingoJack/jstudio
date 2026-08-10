/**
 * useGraphKeyboard - 从 GraphCanvas 提取的键盘交互逻辑。
 *
 * 职责：
 *   - root keydown：Del 删除、Cmd+Z 撤销/重做、Cmd+C/X/V 复制粘贴、
 *     Cmd+D 克隆、方向键微移、ESC 退出待绘制、Tab/Enter 按 shape 类别分派
 *     （topic 生发思维导图节点 / 普通形状循环选中或编辑文字）
 *   - window 捕获阶段 keydown：确保 topic 节点的 Tab/Enter 一定生效
 *   - container mousedown：点击画布时聚焦 root，使快捷键生效
 *
 * Tab/Enter 的具体行为按 shape 类别分派到 shapeKeyHandlers，本 hook 只负责
 * DOM 接线和 preventDefault。
 *
 * 依赖项均为 ref 或原始值，不引入额外渲染周期。
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';
import { type Graph, type UndoManager, Clipboard } from '@maxgraph/core';

import { styleToNodeShape } from './graphModel';
import { handleShapeTabEnter } from './shapeKeyHandlers';
import { GRID_SIZE } from './graphConstants';
import type { GraphNodeShape } from './graphSnapshot';

export interface UseGraphKeyboardParams {
  editing: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  graphRef: RefObject<Graph | null>;
  undoManagerRef: RefObject<UndoManager | null>;
  pendingShapeRef: RefObject<GraphNodeShape | null>;
  darkModeRef: RefObject<boolean>;
  setPending: (shape: GraphNodeShape | null) => void;
}

export function useGraphKeyboard({
  editing,
  rootRef,
  containerRef,
  graphRef,
  undoManagerRef,
  pendingShapeRef,
  darkModeRef,
  setPending,
}: UseGraphKeyboardParams) {
  useEffect(() => {
    if (!editing) return;
    const root = rootRef.current;
    if (!root) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const graph = graphRef.current;
      const undo = undoManagerRef.current;
      if (!graph) return;
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Tab/Enter：按选中 shape 的类别分派。
      //   - topic（思维导图）：Tab 生发子节点 / Enter 生发兄弟节点（即便编辑中也支持）
      //   - 其它 vertex：Tab 循环选中 / Enter 编辑文字
      // topic 的编辑态处理必须在 graph.isEditing() 守卫之前，否则会被跳过；
      // 普通形状的 Enter 在编辑态由 CellEditor 原生处理，handleShapeTabEnter
      // 内部会返回 false 让其穿透。
      if (e.key === 'Tab' || e.key === 'Enter') {
        if (handleShapeTabEnter(graph, e.key, e.shiftKey, darkModeRef.current)) {
          e.preventDefault();
          return;
        }
      }

      // 正在内联编辑文本时，交给 CellEditor，不拦截。
      if (graph.isEditing()) return;

      // ESC：退出待绘制态。
      if (e.key === 'Escape') {
        if (pendingShapeRef.current) {
          e.preventDefault();
          setPending(null);
        }
        return;
      }

      if (meta && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) undo?.redo();
        else undo?.undo();
        return;
      }
      // 复制 / 剪切 / 粘贴（引擎内置剪贴板，跨画板实例可用）。
      if (meta && key === 'c') {
        if (graph.getSelectionCells().length > 0) {
          e.preventDefault();
          Clipboard.copy(graph);
        }
        return;
      }
      if (meta && key === 'x') {
        if (graph.getSelectionCells().length > 0) {
          e.preventDefault();
          Clipboard.cut(graph);
        }
        return;
      }
      if (meta && key === 'v') {
        if (!Clipboard.isEmpty()) {
          e.preventDefault();
          Clipboard.paste(graph);
        }
        return;
      }
      // Cmd/Ctrl + D：原地克隆当前选中并偏移一格。
      if (meta && key === 'd') {
        const cells = graph.getSelectionCells();
        if (cells.length > 0) {
          e.preventDefault();
          graph.batchUpdate(() => {
            const clones = graph.cloneCells(cells);
            const moved = graph.importCells(clones, GRID_SIZE, GRID_SIZE, graph.getDefaultParent());
            graph.setSelectionCells(moved);
          });
        }
        return;
      }
      // 方向键微移：默认 1 格网格，Shift 一次移 1px 精调。
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        const cells = graph.getSelectionCells();
        if (cells.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : GRID_SIZE;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        graph.moveCells(cells, dx, dy);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const cells = graph.getSelectionCells();
        if (cells.length > 0) {
          e.preventDefault();
          graph.removeCells(cells);
        }
      }
    };

    root.addEventListener('keydown', onKeyDown);

    // window 级捕获阶段 keydown：在所有其他监听器（maxGraph、TipTap 等）之前
    // 拦截 Tab/Enter，确保 topic 节点的 Tab/Shift+Tab（生发子节点 右/左）/ Enter（生发兄弟节点）一定生效。
    // 不依赖 root div 或 container 的焦点状态--只要事件目标在画布内就处理。
    //
    // Cmd/Ctrl+Enter 特殊处理：当正在内联编辑某个 shape 的文本时，Cmd+Enter
    // 确认该 shape 的文本编辑（graph.stopEditing(false)），而非退出整个块的编辑模式。
    // 本 handler 属于子组件 GraphCanvas 的 effect，注册早于父组件（DiagramBlockView /
    // DiagramWindowApp）的 useCmdEnterConfirm，因此先于后者执行；用
    // stopImmediatePropagation 阻止 useCmdEnterConfirm 触发 exitEditing / closeWindow。
    const onWindowKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+Enter：确认当前 shape 的内联文本编辑。
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key === 'Enter'
      ) {
        // IME 组合中忽略，避免中断中文/日文输入。
        if (e.isComposing || e.keyCode === 229) return;
        const g = graphRef.current;
        if (g?.isEditing()) {
          // 仅处理源自画布内部的 keydown（cell editor 的 textarea 在 root 内）。
          const r = rootRef.current;
          if (!r || !r.contains(e.target as Node)) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          g.stopEditing(false);
          // stopEditing 会销毁 cell editor 的 textarea，焦点掉到 body，
          // 导致后续 Tab/Enter 不再命中 root 的 keydown listener。
          // 主动把焦点拉回 root，保留选中态以便继续 Tab 循环 / Enter 编辑。
          r.focus({ preventScroll: true });
          return;
        }
      }

      if (e.key !== 'Tab' && e.key !== 'Enter') return;
      // 只处理源自画布内部的 keydown。
      const r = rootRef.current;
      if (!r || !r.contains(e.target as Node)) return;
      const g = graphRef.current;
      if (!g) return;
      const sel = g.getSelectionCells();
      if (sel.length !== 1 || !sel[0].isVertex()) return;
      // window 捕获阶段只负责 topic：确保不依赖焦点也能生发思维导图节点。
      // 非 topic 的 Tab/Enter（循环选中 / 编辑文字）交给 root keydown 处理，
      // 这里早返回让事件继续传播。
      const cellStyle = g.getCurrentCellStyle(sel[0]);
      if (styleToNodeShape(cellStyle) !== 'topic') return;
      // 命中 topic 节点：拦截并处理。
      e.preventDefault();
      e.stopPropagation();
      handleShapeTabEnter(g, e.key, e.shiftKey, darkModeRef.current);
    };
    window.addEventListener('keydown', onWindowKeyDown, true);

    // 点击画布时确保 root 获得焦点，使键盘快捷键（Del/Cmd+Z 等）生效。
    const container = containerRef.current;
    const onCanvasMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.isContentEditable) return;
      root.focus({ preventScroll: true });
    };
    container?.addEventListener('mousedown', onCanvasMouseDown);

    return () => {
      root.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keydown', onWindowKeyDown, true);
      container?.removeEventListener('mousedown', onCanvasMouseDown);
    };
  }, [editing]);
}
