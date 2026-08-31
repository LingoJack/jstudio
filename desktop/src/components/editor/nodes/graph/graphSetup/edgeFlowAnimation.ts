import type { CellState } from '@maxgraph/core';
import { FLOW_ANIMATION_THRESHOLD } from '../graphHelpers';
import type { GraphSetupFn } from './types';

export const setupEdgeFlowAnimation: GraphSetupFn = (ctx) => {
  const { graph } = ctx;

  // 连线流动效果：在 cellRenderer.initializeShape（shape 创建唯一入口）处打标记，
  // 给每条 edge 的 SVG <g> 加 .jgraph-edge 类，并创建圆点流动 <path>。
  // 关键：Shape.redraw() 内部调用 clear() 移除所有子节点再重建 path，
  // 所以圆点元素会被清除。解决：重写 shape.redraw()，在原逻辑执行完毕后
  // 重新追加圆点 path 并同步 d 属性。圆点元素本身只创建一次，重复 append 即可。
  // CSS 控制圆点样式与动画（stroke-dasharray + round linecap + animation）。
  {
    const cellRenderer = graph.cellRenderer;
    const origInitializeShape = cellRenderer.initializeShape.bind(cellRenderer);
    cellRenderer.initializeShape = (state: CellState) => {
      origInitializeShape(state);
      const cell = state.cell;
      const shape = state.shape;
      if (
        cell &&
        cell.isEdge() &&
        shape?.node &&
        !(shape as { _jgraphDotInit?: boolean })._jgraphDotInit
      ) {
        (shape as { _jgraphDotInit?: boolean })._jgraphDotInit = true;
        shape.node.classList.add('jgraph-edge');

        // 圆点 <path>：仅创建一次，每次 redraw() 后重新追加并同步 d。
        const dotPath = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path',
        );
        dotPath.classList.add('jgraph-edge-dot');

        const origRedraw = shape.redraw.bind(shape);
        shape.redraw = () => {
          origRedraw();
          const pathEl = shape.node.querySelector('path');
          if (pathEl) {
            dotPath.setAttribute('d', pathEl.getAttribute('d') ?? '');
            shape.node.appendChild(dotPath);
          }
        };
      }
    };
  }

  // 流动动画阈值控制：边数超过阈值时给容器加 .jgraph-flow-off 类，
  // CSS 自动关闭 stroke-dashoffset 动画，保证大图流畅。
  ctx.updateFlowAnimationRef.current = () => {
    const g = ctx.graphRef.current;
    const container = ctx.containerRef.current;
    if (!g || !container) return;
    const edgeCount = g.getChildEdges(g.getDefaultParent()).length;
    container.classList.toggle('jgraph-flow-off', edgeCount > FLOW_ANIMATION_THRESHOLD);
  };
};
