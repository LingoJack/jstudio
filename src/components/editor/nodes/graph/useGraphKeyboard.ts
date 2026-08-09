/**
 * useGraphKeyboard - 从 GraphCanvas 提取的键盘交互逻辑。
 *
 * 职责：
 *   - root keydown：Del 删除、Cmd+Z 撤销/重做、Cmd+C/X/V 复制粘贴、
 *     Cmd+D 克隆、方向键微移、ESC 退出待绘制、Tab/Enter 思维导图生发
 *   - window 捕获阶段 keydown：确保 topic 节点的 Tab/Enter 一定生效
 *   - container mousedown：点击画布时聚焦 root，使快捷键生效
 *
 * 依赖项均为 ref 或原始值，不引入额外渲染周期。
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';
import { type Graph, type UndoManager, Clipboard } from '@maxgraph/core';

import { styleToNodeShape } from './graphModel';
import { spawnMindmapChild, spawnMindmapSibling } from './mindmapSpawn';
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

      // 思维导图 topic 节点：Tab/Shift+Tab 生发子节点（右/左），Enter 生发同级兄弟节点。
      // 即使正在内联编辑文本也支持（先提交编辑再生发），符合思维导图标准交互：
      // 双击 topic 编辑文字 -> 按 Tab/Enter -> 提交文字 -> 生发子/兄弟节点。
      // 必须放在 graph.isEditing() 守卫之前，否则编辑态下 Tab/Enter 会被直接跳过。
      if (e.key === 'Tab' || e.key === 'Enter') {
        const sel = graph.getSelectionCells();
        if (sel.length === 1 && sel[0].isVertex()) {
          const cellStyle = graph.getCurrentCellStyle(sel[0]);
          const shape = styleToNodeShape(cellStyle);
          if (shape === 'topic') {
            e.preventDefault();
            // 正在编辑文本时先提交，再生发子/兄弟节点。
            if (graph.isEditing()) {
              graph.stopEditing(false);
            }
            if (e.key === 'Tab') {
              spawnMindmapChild(graph, sel[0], darkModeRef.current, e.shiftKey ? 'left' : 'right');
            } else {
              spawnMindmapSibling(graph, sel[0], darkModeRef.current);
            }
            return;
          }
        }
      }

      // 正在内联编辑文本时，交给 CellEditor，不拦截（Tab/Enter 对 topic 的处理已在上方完成）。
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
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' && e.key !== 'Enter') return;
      // 只处理源自画布内部的 keydown。
      const r = rootRef.current;
      if (!r || !r.contains(e.target as Node)) return;
      const g = graphRef.current;
      if (!g) return;
      const sel = g.getSelectionCells();
      if (sel.length !== 1 || !sel[0].isVertex()) return;
      const cellStyle = g.getCurrentCellStyle(sel[0]);
      if (styleToNodeShape(cellStyle) !== 'topic') return;
      // 命中 topic 节点：拦截并处理。
      e.preventDefault();
      e.stopPropagation();
      if (g.isEditing()) {
        g.stopEditing(false);
      }
      if (e.key === 'Tab') {
        spawnMindmapChild(g, sel[0], darkModeRef.current, e.shiftKey ? 'left' : 'right');
      } else {
        spawnMindmapSibling(g, sel[0], darkModeRef.current);
      }
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
