import { InternalEvent } from "@maxgraph/core";
import { isOnBorder, BORDER_TOLERANCE_PX } from "../graphHelpers";
const setupBorderHitTest = (ctx) => {
  const { graph } = ctx;
  const originalUpdateMouseEvent = graph.updateMouseEvent.bind(graph);
  graph.updateMouseEvent = function(me, evtName) {
    const result = originalUpdateMouseEvent(me, evtName);
    if (evtName === InternalEvent.MOUSE_DOWN || evtName === InternalEvent.MOUSE_UP) {
      const originalCell = me.getCell();
      if (originalCell && originalCell.isVertex()) {
        const state = me.getState();
        if (state) {
          const tol = BORDER_TOLERANCE_PX / this.getView().scale;
          if (!isOnBorder(state, me.graphX, me.graphY, tol)) {
            const cellBelow = this.getCellAt(
              me.graphX,
              me.graphY,
              null,
              true,
              true,
              (s) => s.cell === originalCell
            );
            if (cellBelow) {
              me.state = this.getView().getState(cellBelow);
            }
          }
        }
      }
    }
    return result;
  };
};
export {
  setupBorderHitTest
};
