import type { FitPlugin } from '@maxgraph/core';
import { ZOOM_MIN, ZOOM_MAX } from '../graphConstants';
import type { GraphSetupFn } from './types';

export const setupWheelZoom: GraphSetupFn = (ctx) => {
  const { graph, container } = ctx;

  // 滚轮交互（draw.io / 飞书手感）：
  //   - Ctrl/Cmd + 滚轮 -> 缩放
  //   - 普通滚轮 -> 平移视图（垂直滚 -> 上下平移；水平滚轮 / Shift+滚轮 -> 左右平移）
  // view.setTranslate 会触发 TRANSLATE 事件，上方已注册 listener 持久化视口。
  // 方向约定：滚轮向下 (deltaY > 0) -> 看下方内容 -> translate.y 减小
  //          （translate.y 是视口左上角对应的图坐标的相反数）
  const onWheel = (e: WheelEvent) => {
    const g = ctx.graphRef.current;
    if (!g) return;

    // 缩放分支（macOS 双指捏合 / Ctrl+滚轮）
    // 使用指数缩放 + 以光标为锚点，步进细腻连续，手感与 draw.io 一致。
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const view = g.getView();
      const oldScale = view.scale;
      // 指数缩放：deltaY 越大缩放越多，但每步变化小且连续。
      // macOS 双指捏合每帧 deltaY 约 ±2~±20，0.005 系数使每步仅 ~1%~5% 变化。
      const factor = Math.exp(-e.deltaY * 0.005);
      const newScale = Math.min(Math.max(oldScale * factor, ZOOM_MIN), ZOOM_MAX);
      if (newScale === oldScale) return;
      // 以光标位置为锚点缩放：保持光标下的图坐标点不变，缩放手感更自然。
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const ratio = 1 / newScale - 1 / oldScale;
      view.scaleAndTranslate(
        newScale,
        view.translate.x + cx * ratio,
        view.translate.y + cy * ratio,
      );
      return;
    }

    // 平移分支
    e.preventDefault();
    const view = g.getView();
    const scale = view.scale;
    // macOS 约定：Shift + 垂直滚轮 -> 水平平移（仅在设备无原生水平滚轮时生效）
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.shiftKey && dx === 0) {
      dx = e.deltaY;
      dy = 0;
    }
    // 像素增量需换算为图坐标增量（除以 scale）。
    view.setTranslate(
      view.translate.x - dx / scale,
      view.translate.y - dy / scale,
    );
  };
  container.addEventListener('wheel', onWheel, { passive: false, capture: true });

  // 容器尺寸变化（窗口缩放、拖拽改大小等）时重新自适应内容。
  // sizeDidChange 只更新内部尺寸追踪，不会调整视口；若不重新 fitCenter，
  // 图形仍停留在旧视口比例，而容器已变小/变大，导致内容偏离最佳贴合位置。
  let firstResize = true;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  const resizeObs = new ResizeObserver(() => {
    graph.sizeDidChange();
    // 跳过首次回调（observe 初始触发），保留快照恢复的视口；
    // 仅在容器真正尺寸变化时重新 fitCenter。
    if (firstResize) {
      firstResize = false;
      return;
    }
    // 防抖：连续缩放窗口时避免频繁 fitCenter。
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      const hasCells = graph.getChildVertices(graph.getDefaultParent()).length > 0;
      if (hasCells) {
        graph.getPlugin<FitPlugin>('fit')?.fitCenter({ margin: 24 });
      }
    }, 150);
  });
  resizeObs.observe(container);

  return () => {
    resizeObs.disconnect();
    if (resizeTimer) clearTimeout(resizeTimer);
    container.removeEventListener('wheel', onWheel, true);
  };
};
