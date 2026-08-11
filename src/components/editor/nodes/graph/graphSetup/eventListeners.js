import {
  UndoManager,
  InternalEvent,
  styleUtils,
  eventUtils
} from "@maxgraph/core";
import { owningLifeline } from "../sequenceInteraction";
import { DEFAULT_SIZE } from "../graphConstants";
import { SHAPE_FONT_SIZE } from "../graphTheme";
import { styleToNodeShape } from "../graphModel";
const setupEventListeners = (ctx) => {
  const { graph } = ctx;
  const undoManager = new UndoManager();
  ctx.undoManagerRef.current = undoManager;
  const undoListener = (_sender, evt) => {
    undoManager.undoableEditHappened(evt.getProperty("edit"));
  };
  graph.getDataModel().addListener(InternalEvent.UNDO, undoListener);
  graph.getView().addListener(InternalEvent.UNDO, undoListener);
  graph.getDataModel().addListener(InternalEvent.CHANGE, () => {
    ctx.scheduleEmit();
    ctx.updateFlowAnimationRef.current?.();
  });
  graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => {
    const cell = graph.getSelectionCell();
    if (cell) {
      const style = graph.getCurrentCellStyle(cell);
      const a = style.align;
      ctx.setSelectedLabelAlign(a === "left" || a === "right" ? a : "center");
      const fc = style.fillColor;
      ctx.setSelectedFillColor(
        cell.isVertex() ? typeof fc === "string" && fc ? fc : "none" : null
      );
      if (cell.isEdge() && owningLifeline(graph, cell.getTerminal(true)) && owningLifeline(graph, cell.getTerminal(false))) {
        ctx.setSelectedSeqEdge(style.dashed === true ? "return" : "call");
      } else {
        ctx.setSelectedSeqEdge(null);
      }
      ctx.setSelectedMindmapTopic(
        cell.isVertex() && styleToNodeShape(style) === "topic"
      );
    } else {
      ctx.setSelectedLabelAlign(null);
      ctx.setSelectedFillColor(null);
      ctx.setSelectedSeqEdge(null);
      ctx.setSelectedMindmapTopic(false);
    }
    ctx.setFillPickerOpen(false);
  });
  const view = graph.getView();
  view.addListener(InternalEvent.SCALE, () => ctx.scheduleEmit());
  view.addListener(InternalEvent.TRANSLATE, () => ctx.scheduleEmit());
  view.addListener(InternalEvent.SCALE_AND_TRANSLATE, () => ctx.scheduleEmit());
  graph.addListener(InternalEvent.CELLS_RESIZED, (_s, evt) => {
    if (ctx.applyingRef.current) return;
    const cells = evt.getProperty("cells");
    if (!cells || cells.length === 0) return;
    const model = graph.getDataModel();
    for (const cell of cells) {
      if (!cell.isVertex()) continue;
      const style = cell.getStyle() ?? {};
      if (style.shape !== "text") continue;
      const geo = cell.getGeometry();
      if (!geo) continue;
      const def = DEFAULT_SIZE["text"];
      const scale = Math.sqrt(geo.width / def.w * (geo.height / def.h));
      const newFontSize = Math.max(6, Math.round(SHAPE_FONT_SIZE * scale));
      if (style.fontSize === newFontSize) continue;
      model.setStyle(cell, { ...style, fontSize: newFontSize });
    }
  });
  const cellEditor = graph.getPlugin("CellEditorHandler");
  if (cellEditor) cellEditor.selectText = false;
  graph.addListener(InternalEvent.DOUBLE_CLICK, (_s, evt) => {
    let cell = evt.getProperty("cell");
    if (!cell) {
      const nativeEvt = evt.getProperty("event");
      if (nativeEvt) {
        const pt = styleUtils.convertPoint(
          graph.getContainer(),
          eventUtils.getClientX(nativeEvt),
          eventUtils.getClientY(nativeEvt)
        );
        cell = graph.getCellAt(pt.x, pt.y) ?? void 0;
      }
    }
    if (cell && graph.isCellEditable(cell)) {
      graph.startEditingAtCell(cell, evt.getProperty("event"));
      const textarea = cellEditor?.textarea;
      if (textarea && textarea.innerHTML.length > 0) {
        const range = document.createRange();
        range.selectNodeContents(textarea);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      evt.consume();
    } else if (!cell) {
      const hasCells = graph.getChildVertices(graph.getDefaultParent()).length > 0;
      if (hasCells) graph.getPlugin("fit")?.fitCenter({ margin: 24 });
      evt.consume();
    }
  });
};
export {
  setupEventListeners
};
