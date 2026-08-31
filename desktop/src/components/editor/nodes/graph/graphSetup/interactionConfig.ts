import type {
  RubberBandHandler as RubberBandHandlerType,
  PanningHandler,
  SelectionHandler,
} from '@maxgraph/core';
import { getSelectionColor } from '../graphTheme';
import { GRID_SIZE } from '../graphConstants';
import { logger } from '../../../../../lib/core/logger';
import type { GraphSetupFn } from './types';
import { EnhancedGuide } from './enhancedGuide';

export const setupInteractionConfig: GraphSetupFn = (ctx) => {
  const { graph } = ctx;
  const dark = ctx.darkModeRef.current;

  // Cmd/Ctrl + 拖动 = 复制拖动（让 Alt/Option 空出来给"平移画布"用）。
  graph.isCloneEvent = (evt: MouseEvent) => {
    const r = evt.metaKey || evt.ctrlKey;
    // 诊断日志：确认 isCloneEvent 是否被调用、返回什么。排查复制不生效问题。
    // eslint-disable-next-line no-console
    logger.debug('GraphCanvas', 'isCloneEvent -> metaKey|ctrlKey: ' + r);
    return r;
  };
  // 必须启用 cellsCloneable，否则 isCloneEvent 返回 true 也不会触发复制
  graph.setCellsCloneable(true);

  // 禁用 RubberBandHandler 的 Alt 强制框选行为（否则 Alt+拖动会变成框选而非平移画布）
  const rubberBandHandler = graph.getPlugin<RubberBandHandlerType>('RubberBandHandler');
  if (rubberBandHandler) {
    rubberBandHandler.isForceRubberbandEvent = () => false;
  }

  // Alt/Option + 拖动 = 平移画布（即使按在图形上也平移，而非移动图形）。
  const panningHandler = graph.getPlugin<PanningHandler>('PanningHandler');
  if (panningHandler) {
    panningHandler.isForcePanningEvent = (me) => {
      const evt = me.getEvent() as MouseEvent;
      return evt.altKey;
    };
  }

  // 网格 + 吸附（draw.io 同款：拖拽/缩放对齐到 10px 网格）。
  graph.setGridEnabled(false); // 默认不显示网格
  graph.setGridSize(GRID_SIZE);
  // 缩放以视口中心为锚点（而非左上角），更符合直觉。
  graph.centerZoom = true;

  // 拖动时显示与其他图形的对齐参考线（SelectionHandler 内置能力）。
  const selectionHandler = graph.getPlugin<SelectionHandler>('SelectionHandler');
  if (selectionHandler) {
    selectionHandler.guidesEnabled = true;
    // 拖动预览颜色：跟随主题 accent 色（--vscode-focusBorder）
    selectionHandler.previewColor = getSelectionColor(dark);
    // 启用 livePreview：移动图形时显示实际图形预览（而非矩形框）
    // maxLivePreview 默认为 0，需要设置一个较大值才能启用
    selectionHandler.maxLivePreview = 100;
    selectionHandler.allowLivePreview = true;
    // 使用增强版对齐引擎：提升灵敏度 + 水平/垂直等间距对齐
    selectionHandler.createGuide = () => {
      return new EnhancedGuide(graph, selectionHandler.getGuideStates(), dark);
    };
  }
};
