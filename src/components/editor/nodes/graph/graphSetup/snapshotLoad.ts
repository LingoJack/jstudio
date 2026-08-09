import { parseGraphSnapshot } from '../graphSnapshot';
import { applySnapshotToGraph } from '../graphModel';
import type { GraphSetupFn } from './types';

export const setupSnapshotLoad: GraphSetupFn = (ctx) => {
  const { graph } = ctx;

  // 灌入初始快照。
  const parsedInit = parseGraphSnapshot(ctx.initialSnapshotRef.current);
  ctx.applyingRef.current = true;
  try {
    graph.batchUpdate(() => {
      applySnapshotToGraph(graph, parsedInit, ctx.darkModeRef.current);
    });
  } finally {
    ctx.applyingRef.current = false;
  }
  // 同步组件 showGrid 态（applySnapshotToGraph 已设引擎 gridEnabled，
  // 但组件 state 仍是默认 true，需对齐，否则下次 emit 会把 showGrid 写回 true）。
  if (typeof parsedInit.showGrid === 'boolean') {
    ctx.setShowGrid(parsedInit.showGrid);
    ctx.showGridRef.current = parsedInit.showGrid;
  }
  // 同步组件 autoActivation 态（缺省保持默认 true）。
  if (typeof parsedInit.autoActivation === 'boolean') {
    ctx.setAutoActivation(parsedInit.autoActivation);
    ctx.autoActivationRef.current = parsedInit.autoActivation;
  }
  // 初始灌入产生的 edit 不应进 undo 历史。
  ctx.undoManagerRef.current!.clear();
  // 根据边数决定是否开启动画。
  ctx.updateFlowAnimationRef.current!();
};
