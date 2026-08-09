import {
  UndoManager,
  InternalEvent,
  EventObject,
  styleUtils,
  eventUtils,
} from '@maxgraph/core';
import type {
  Cell,
  CellStyle,
  FitPlugin,
} from '@maxgraph/core';
import { owningLifeline } from '../sequenceInteraction';
import { DEFAULT_SIZE } from '../graphCanvasStyle';
import { SHAPE_FONT_SIZE } from '../graphTheme';
import type { GraphSetupFn } from './types';

export const setupEventListeners: GraphSetupFn = (ctx) => {
  const { graph } = ctx;

  // Undo / Redo。
  const undoManager = new UndoManager();
  ctx.undoManagerRef.current = undoManager;
  const undoListener = (_sender: unknown, evt: EventObject) => {
    undoManager.undoableEditHappened(evt.getProperty('edit'));
  };
  graph.getDataModel().addListener(InternalEvent.UNDO, undoListener);
  graph.getView().addListener(InternalEvent.UNDO, undoListener);

  // 模型变化 -> 防抖序列化回传。
  graph.getDataModel().addListener(InternalEvent.CHANGE, () => {
    ctx.scheduleEmit();
    ctx.updateFlowAnimationRef.current?.();
  });

  // 选中变化 -> 更新对齐按钮高亮状态 + 填充色状态 + 时序消息切换按钮。
  graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => {
    const cell = graph.getSelectionCell();
    if (cell) {
      const style = graph.getCurrentCellStyle(cell);
      const a = style.align;
      ctx.setSelectedLabelAlign(a === 'left' || a === 'right' ? a : 'center');
      // 仅 vertex 显示填充色按钮；边线不显示。
      const fc = style.fillColor;
      ctx.setSelectedFillColor(
        cell.isVertex()
          ? (typeof fc === 'string' && fc ? fc : 'none')
          : null,
      );
      // 两端都能解析到生命线（lifeline 或贴在 lifeline 上的 ac）的边
      // 才是时序图消息，显示"调用/返回"切换按钮。
      if (
        cell.isEdge() &&
        owningLifeline(graph, cell.getTerminal(true)) &&
        owningLifeline(graph, cell.getTerminal(false))
      ) {
        ctx.setSelectedSeqEdge(style.dashed === true ? 'return' : 'call');
      } else {
        ctx.setSelectedSeqEdge(null);
      }
    } else {
      ctx.setSelectedLabelAlign(null);
      ctx.setSelectedFillColor(null);
      ctx.setSelectedSeqEdge(null);
    }
    ctx.setFillPickerOpen(false);
  });

  // 视口变化（缩放/平移/自适应）-> 防抖序列化回传，确保 fitCenter、zoomIn/Out
  // 等操作后的视口比例能被持久化，下次打开文档时恢复正确比例。
  // 注：初始灌入快照时 applyingRef.current===true，scheduleEmit 会直接 return，无副作用。
  const view = graph.getView();
  view.addListener(InternalEvent.SCALE, () => ctx.scheduleEmit());
  view.addListener(InternalEvent.TRANSLATE, () => ctx.scheduleEmit());
  view.addListener(InternalEvent.SCALE_AND_TRANSLATE, () => ctx.scheduleEmit());

  // 文本框 resize -> 字号按比例缩放（仅 text 形状）。
  // resizeCells 在 batchUpdate 内执行，此处 setStyle 会被合并到同一个 undo batch，
  // undo 一步即可同时撤销尺寸和字号变化。
  graph.addListener(InternalEvent.CELLS_RESIZED, (_s: unknown, evt: EventObject) => {
    if (ctx.applyingRef.current) return;
    const cells = evt.getProperty('cells') as Cell[] | undefined;
    if (!cells || cells.length === 0) return;
    const model = graph.getDataModel();
    for (const cell of cells) {
      if (!cell.isVertex()) continue;
      const style = (cell.getStyle() as CellStyle) ?? {};
      if (style.shape !== 'text') continue;
      const geo = cell.getGeometry();
      if (!geo) continue;
      const def = DEFAULT_SIZE['text']; // 默认 { w: 60, h: 30 }
      const scale = Math.sqrt((geo.width / def.w) * (geo.height / def.h));
      const newFontSize = Math.max(6, Math.round(SHAPE_FONT_SIZE * scale));
      if (style.fontSize === newFontSize) continue;
      model.setStyle(cell, { ...style, fontSize: newFontSize });
    }
  });

  // 双击空白（未命中任何 cell）-> 自适应全图（draw.io 同款）。
  graph.addListener(InternalEvent.DOUBLE_CLICK, (_s: unknown, evt: EventObject) => {
    let cell = evt.getProperty('cell') as Cell | undefined;
    if (!cell) {
      const nativeEvt = evt.getProperty('event') as MouseEvent | null;
      if (nativeEvt) {
        const pt = styleUtils.convertPoint(
          graph.getContainer(),
          eventUtils.getClientX(nativeEvt),
          eventUtils.getClientY(nativeEvt),
        );
        cell = graph.getCellAt(pt.x, pt.y) ?? undefined;
      }
    }
    if (cell && graph.isCellEditable(cell)) {
      graph.startEditingAtCell(cell, evt.getProperty('event'));
      evt.consume();
    } else if (!cell) {
      const hasCells = graph.getChildVertices(graph.getDefaultParent()).length > 0;
      if (hasCells) graph.getPlugin<FitPlugin>('fit')?.fitCenter({ margin: 24 });
      evt.consume();
    }
  });
};
