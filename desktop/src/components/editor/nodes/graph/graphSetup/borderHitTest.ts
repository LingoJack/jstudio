import { InternalEvent, CellState } from '@maxgraph/core';
import { isOnBorder, BORDER_TOLERANCE_PX } from '../graphHelpers';
import type { GraphSetupFn } from './types';

export const setupBorderHitTest: GraphSetupFn = (ctx) => {
  const { graph } = ctx;

  // ── 边框命中检测：点击图形内部时穿透选中下层图形 ──────────────────
  // 覆写 updateMouseEvent，仅对 MOUSE_DOWN / MOUSE_UP 生效。
  // 当点击落在顶层 vertex 的内部（非边框）时，用 getCellAt 查找下层
  // 图形并更新 me.state，使选中/移动穿透到下层。若无下层图形则保持
  // 原选择（保证孤立图形仍可正常选中移动）。不影响双击编辑和连线。
  const originalUpdateMouseEvent = graph.updateMouseEvent.bind(graph);
  graph.updateMouseEvent = function (me, evtName) {
    const result = originalUpdateMouseEvent(me, evtName);
    if (evtName === InternalEvent.MOUSE_DOWN || evtName === InternalEvent.MOUSE_UP) {
      const originalCell = me.getCell();
      if (originalCell && originalCell.isVertex()) {
        const state = me.getState();
        if (state) {
          const tol = BORDER_TOLERANCE_PX / this.getView().scale;
          if (!isOnBorder(state, me.graphX, me.graphY, tol)) {
            // 点击在内部 -> 查找下层图形（跳过当前顶层图形）
            const cellBelow = this.getCellAt(
              me.graphX,
              me.graphY,
              null,
              true,
              true,
              (s: CellState) => s.cell === originalCell,
            );
            if (cellBelow) {
              me.state = this.getView().getState(cellBelow);
            }
            // 无下层图形 -> 保持原选择，不做修改
          }
        }
      }
    }
    return result;
  };
};
