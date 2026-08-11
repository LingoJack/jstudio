import { useEffect } from "react";
import { Clipboard } from "@maxgraph/core";
import { styleToNodeShape } from "./graphModel";
import { handleShapeTabEnter } from "./shapeKeyHandlers";
import { GRID_SIZE } from "./graphConstants";
function useGraphKeyboard({
  editing,
  rootRef,
  containerRef,
  graphRef,
  undoManagerRef,
  pendingShapeRef,
  darkModeRef,
  mindmapSchemeRef,
  setPending
}) {
  useEffect(() => {
    if (!editing) return;
    const root = rootRef.current;
    if (!root) return;
    const onKeyDown = (e) => {
      const graph = graphRef.current;
      const undo = undoManagerRef.current;
      if (!graph) return;
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (e.key === "Tab" || e.key === "Enter") {
        if (handleShapeTabEnter(
          graph,
          e.key,
          e.shiftKey,
          darkModeRef.current,
          mindmapSchemeRef.current
        )) {
          e.preventDefault();
          return;
        }
      }
      if (graph.isEditing()) return;
      if (e.key === "Escape") {
        if (pendingShapeRef.current) {
          e.preventDefault();
          setPending(null);
        }
        return;
      }
      if (meta && key === "z") {
        e.preventDefault();
        if (e.shiftKey) undo?.redo();
        else undo?.undo();
        return;
      }
      if (meta && key === "c") {
        if (graph.getSelectionCells().length > 0) {
          e.preventDefault();
          Clipboard.copy(graph);
        }
        return;
      }
      if (meta && key === "x") {
        if (graph.getSelectionCells().length > 0) {
          e.preventDefault();
          Clipboard.cut(graph);
        }
        return;
      }
      if (meta && key === "v") {
        if (!Clipboard.isEmpty()) {
          e.preventDefault();
          Clipboard.paste(graph);
        }
        return;
      }
      if (meta && key === "d") {
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
      if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        const cells = graph.getSelectionCells();
        if (cells.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : GRID_SIZE;
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        graph.moveCells(cells, dx, dy);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        const cells = graph.getSelectionCells();
        if (cells.length > 0) {
          e.preventDefault();
          graph.removeCells(cells);
        }
      }
    };
    root.addEventListener("keydown", onKeyDown);
    const onWindowKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === "Enter") {
        if (e.isComposing || e.keyCode === 229) return;
        const g2 = graphRef.current;
        if (g2?.isEditing()) {
          const r2 = rootRef.current;
          if (!r2 || !r2.contains(e.target)) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          g2.stopEditing(false);
          r2.focus({ preventScroll: true });
          return;
        }
      }
      if (e.key !== "Tab" && e.key !== "Enter") return;
      const r = rootRef.current;
      if (!r || !r.contains(e.target)) return;
      const g = graphRef.current;
      if (!g) return;
      const sel = g.getSelectionCells();
      if (sel.length !== 1 || !sel[0].isVertex()) return;
      const cellStyle = g.getCurrentCellStyle(sel[0]);
      if (styleToNodeShape(cellStyle) !== "topic") return;
      if (handleShapeTabEnter(
        g,
        e.key,
        e.shiftKey,
        darkModeRef.current,
        mindmapSchemeRef.current
      )) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onWindowKeyDown, true);
    const container = containerRef.current;
    const onCanvasMouseDown = (e) => {
      const target = e.target;
      if (target && target.isContentEditable) return;
      root.focus({ preventScroll: true });
    };
    container?.addEventListener("mousedown", onCanvasMouseDown);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keydown", onWindowKeyDown, true);
      container?.removeEventListener("mousedown", onCanvasMouseDown);
    };
  }, [editing]);
}
export {
  useGraphKeyboard
};
