import type { Cell } from "@maxgraph/core";
import type { GraphSetupFn } from "./types";

/**
 * 图形标签文字的鼠标拖选（原生选区高亮）。
 *
 * maxGraph 对落在 cell 上的 pointerdown 会经 SelectionHandler.mouseDown ->
 * me.consume()，consume 对鼠标事件调用 preventDefault，浏览器因此不启动
 * 原生文字选择，在标签文字上拖动只会变成移动图形（或什么都不发生）。
 *
 * 这里在容器捕获阶段拦下"按在标签 DOM 上"的 pointerdown：
 *   - stopPropagation 挡在 maxGraph 之前（其容器级监听收不到该事件，
 *     也就无从 consume），原生拖选得以启动；
 *   - 手动 setSelectionCell，保证纯单击仍选中图形；
 *   - 不 preventDefault（那会杀死选区起点）。
 *
 * 行为变化：从标签文字上拖动 = 选择文字；移动图形改从图形主体（标签
 * 以外的空白区）或八向手柄发起。双击编辑、Shift 多选、Cmd 复制拖动、
 * Alt 平移、待绘制态拖框均不受影响，各自走原有路径。
 */
export const setupLabelTextSelection: GraphSetupFn = (ctx) => {
  const { graph, container } = ctx;

  /** pointerdown 目标若落在某个已渲染 cell 的标签 DOM 内，返回该 cell。 */
  const findCellByLabelTarget = (target: EventTarget | null): Cell | null => {
    if (!(target instanceof Element)) return null;
    // 标签的渲染形态随 dialect 不同（foreignObject 内 div / 纯 HTML div /
    // SVG text），但根节点统一挂在 state.text.node 上，contains 全覆盖。
    for (const state of graph.view.states.values()) {
      const labelNode = state.text?.node;
      if (labelNode && labelNode.contains(target)) return state.cell;
    }
    return null;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    // 双击交给双击编辑流程（DiagramBlockView 的 detail>=2 盾 + graph dblclick）。
    if (e.detail >= 2) return;
    // 修饰键手势（Shift 多选 / Cmd 复制拖动 / Alt 平移）仍走引擎。
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    // 待绘制态：dragDraw 已在捕获阶段接管（划出新图形）。
    if (ctx.pendingShapeRef.current) return;
    // 只读态不拦截（覆盖层已挡事件，防御性兜底）。
    if (!graph.isEnabled()) return;

    const cell = findCellByLabelTarget(e.target);
    if (!cell) return;

    e.stopPropagation();
    graph.setSelectionCell(cell);
  };

  container.addEventListener("pointerdown", onPointerDown, true);
  return () => {
    container.removeEventListener("pointerdown", onPointerDown, true);
  };
};
