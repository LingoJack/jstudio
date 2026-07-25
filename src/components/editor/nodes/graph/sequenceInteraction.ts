/**
 * sequenceInteraction - 时序图手绘体验增强
 *
 * 解决的问题：
 *  1. 消息线强制水平：从 lifeline/activation 拖出的消息，预览和目标端点 Y 都锁定为起点 Y
 *  2. 自动 activation：从 lifelineA 拖消息到 lifelineB 松开后，自动在 B 上生成 activation
 *  3. 悬停跟随圆点：鼠标悬停 lifeline 段时，显示一个跟随鼠标的圆点提示"这里可以起线"
 *
 * 实现方式：通过 hook maxGraph 的 ConnectionHandler 的公开方法/事件，不改内核。
 */

import {
  InternalEvent,
  Point,
  ConnectionConstraint,
  type AbstractGraph,
  type Cell,
  type CellState,
} from '@maxgraph/core';
import type ConnectionHandler from '@maxgraph/core/lib/esm/view/plugin/ConnectionHandler.js';
import { HEAD_HEIGHT } from './customShapes';

/* ------------------------------------------------------------------ */
/* 类型判定                                                            */
/* ------------------------------------------------------------------ */

function getShapeName(cell: Cell | null): string | undefined {
  if (!cell || cell.isEdge()) return undefined;
  const style = cell.getStyle() as { shape?: string } | null;
  return style?.shape;
}

export function isLifeline(cell: Cell | null): boolean {
  return getShapeName(cell) === 'lifeline';
}

export function isActivation(cell: Cell | null): boolean {
  return getShapeName(cell) === 'umlActivation';
}

export function isSequenceNode(cell: Cell | null): boolean {
  return isLifeline(cell) || isActivation(cell);
}

/* ------------------------------------------------------------------ */
/* 1. 水平消息约束                                                      */
/* ------------------------------------------------------------------ */

/**
 * Hook ConnectionHandler 的 updateCurrentState：
 * 当源节点是 lifeline/activation 时，把预览的目标点 Y 强制改为起点 Y。
 *
 * 在 maxGraph 源码中，mouseMove 构造 point 后调用 updateCurrentState(me, point)。
 * 我们在 updateCurrentState 里修改传入的 point.y 即可实现水平锁定。
 * 这样预览线、最终边、以及 Y 位置会全部对齐为起点的 Y。
 */
export function attachHorizontalMessageConstraint(handler: ConnectionHandler): () => void {
  const origUpdateCurrentState = handler.updateCurrentState.bind(handler);
  const origUpdateEdgeState = handler.updateEdgeState.bind(handler);

  // updateCurrentState: 处理目标识别 + 预览更新
  handler.updateCurrentState = (me: InternalEvent, point: Point) => {
    if (handler.first && handler.previous) {
      const sourceCell = handler.previous.cell;
      if (sourceCell && isSequenceNode(sourceCell)) {
        // 锁定 Y 为起点 Y
        point.y = handler.first.y;
      }
    }
    origUpdateCurrentState(me, point);
  };

  // updateEdgeState: 处理 edgeState 几何（preview 时绘制的那条线）
  // 在 maxGraph 中，updateEdgeState(current, constraint) 的 current 就是目标点
  handler.updateEdgeState = (current: Point | null, constraint: ConnectionConstraint | null) => {
    if (handler.first && handler.previous) {
      const sourceCell = handler.previous.cell;
      if (sourceCell && isSequenceNode(sourceCell) && current) {
        current.y = handler.first.y;
      }
    }
    origUpdateEdgeState(current, constraint);
  };

  return () => {
    handler.updateCurrentState = origUpdateCurrentState;
    handler.updateEdgeState = origUpdateEdgeState;
  };
}

/* ------------------------------------------------------------------ */
/* 2. 自动生成 activation                                                */
/* ------------------------------------------------------------------ */

const ACTIVATION_W = 16;
const ACTIVATION_H = 40;

let activationIdCounter = 0;
function genActivationId(): string {
  activationIdCounter += 1;
  return `auto-act-${Date.now()}-${activationIdCounter}`;
}

/**
 * 监听 ConnectionHandler 的 CONNECT 事件，自动生成 activation。
 *
 * 逻辑：
 *  - source=lifeline, target=lifeline：在 target lifeline 的消息 Y 位置生成
 *    一个 activation（w=16, h=40），并把这条 edge 的 target 改为新生成的 activation
 *  - source=lifeline, target=activation：不生成（用户拖到了一个已存在的 activation 上）
 *  - source=activation, target=lifeline：回消息，同样生成一个新 activation 在 target 上
 *  - source=activation, target=activation：不生成
 *
 * 所有修改包在 batchUpdate 里，undo 一次回滚消息 + activation。
 */
export function attachAutoActivation(graph: AbstractGraph, handler: ConnectionHandler): () => void {
  const listener = (_sender: unknown, evt: { getProperty: (key: string) => unknown }) => {
    const edge = evt.getProperty('cell') as Cell | null;
    if (!edge || !edge.isEdge()) return;

    const model = graph.getDataModel();
    const source = model.getTerminal(edge, true);
    const target = model.getTerminal(edge, false);
    if (!source || !target) return;

    // 只处理"目标端需要生成 activation"的场景
    const shouldGenerate = isLifeline(target);
    if (!shouldGenerate) return;

    const targetGeo = target.getGeometry();
    if (!targetGeo) return;

    // 消息 Y：优先取 edge 的 waypoints[0].y，否则取 first.y（拖线起点）
    let msgY = 0;
    const edgeGeo = edge.getGeometry();
    if (edgeGeo?.points && edgeGeo.points.length > 0) {
      msgY = edgeGeo.points[0].y;
    } else if (handler.first) {
      // handler.first 是视图坐标（scaled），需要转换为模型坐标
      const view = graph.getView();
      const scale = view.scale;
      const tr = view.translate;
      msgY = handler.first.y / scale - tr.y;
    } else {
      msgY = targetGeo.y + HEAD_HEIGHT + 30; // 默认放头部下方一点
    }

    const targetCenterX = targetGeo.x + targetGeo.width / 2;
    const actGeo = {
      x: targetCenterX - ACTIVATION_W / 2,
      y: msgY,
      w: ACTIVATION_W,
      h: ACTIVATION_H,
    };

    // 在同一个 batch 里：创建 activation + 修改 edge 的 target 指向 activation
    model.beginUpdate();
    try {
      const parent = graph.getDefaultParent();
      const actCell = graph.insertVertex({
        parent,
        id: genActivationId(),
        value: '',
        position: [actGeo.x, actGeo.y],
        size: [actGeo.w, actGeo.h],
        style: { shape: 'umlActivation' },
      });

      // 把 edge 的 target 改为 activation
      model.setTerminal(edge, actCell, false);

      // 修改 edge 的 style：强制 straight + 结束箭头
      // 同时把 target perimeter 留给 umlActivation 的默认 RectanglePerimeter
      const style = edge.getStyle() ?? {};
      edge.setStyle({ ...style, edgeStyle: undefined, endArrow: 'classic' });
    } finally {
      model.endUpdate();
    }
  };

  handler.addListener(InternalEvent.CONNECT, listener);

  return () => {
    handler.removeListener(listener);
  };
}

/* ------------------------------------------------------------------ */
/* 3. 悬停跟随圆点                                                       */
/* ------------------------------------------------------------------ */

const HOVER_DOT_CLASS = 'jgraph-lifeline-hover-dot';

/**
 * 悬停 lifeline 时显示跟随鼠标的圆点。
 *
 * 实现：在 graph 容器上监听 mousemove，判断鼠标下方 cell 是不是 lifeline，
 * 是的话把圆点定位到 (lifeline 中心 X, 鼠标 Y)，否则隐藏。
 */
export function attachLifelineHoverDot(graph: AbstractGraph, container: HTMLElement): () => void {
  // 创建 SVG 圆点
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', HOVER_DOT_CLASS);
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '10';
  svg.style.overflow = 'visible';

  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('r', '5');
  dot.setAttribute('fill', '#4A90E2');
  dot.setAttribute('stroke', '#fff');
  dot.setAttribute('stroke-width', '2');
  dot.style.display = 'none';

  svg.appendChild(dot);

  // graph 容器需要 position:relative 才能定位子元素
  const prevPosition = container.style.position;
  if (!prevPosition || prevPosition === 'static') {
    container.style.position = 'relative';
  }
  container.appendChild(svg);

  function hide() {
    dot.style.display = 'none';
  }

  function onMouseMove(e: MouseEvent) {
    const view = graph.getView();
    const scale = view.scale;
    const tr = view.translate;

    const rect = container.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // 转为图坐标（模型坐标）
    const graphX = (clientX - (rect.width * 0)) / scale - tr.x;
    const graphY = (clientY - (rect.height * 0)) / scale - tr.y;

    // 找到鼠标下方的 cell
    const cell = graph.getCellAt(graphX, graphY);

    if (isLifeline(cell)) {
      const geo = (cell as Cell).getGeometry();
      if (geo) {
        // 只在生命线段（Y > headHeight）显示
        if (graphY > geo.y + HEAD_HEIGHT && graphY < geo.y + geo.height) {
          const centerX = geo.x + geo.width / 2;
          // 转回视图坐标（SVG 在容器上用像素定位）
          const viewX = (centerX + tr.x) * scale;
          const viewY = (graphY + tr.y) * scale;
          dot.setAttribute('cx', String(viewX));
          dot.setAttribute('cy', String(viewY));
          dot.style.display = '';
          return;
        }
      }
    }

    hide();
  }

  function onMouseDown() {
    hide();
  }

  container.addEventListener('mousemove', onMouseMove, { passive: true });
  container.addEventListener('mousedown', onMouseDown, { passive: true });
  container.addEventListener('mouseleave', hide, { passive: true });

  return () => {
    container.removeEventListener('mousemove', onMouseMove);
    container.removeEventListener('mousedown', onMouseDown);
    container.removeEventListener('mouseleave', hide);
    svg.remove();
    if (!prevPosition || prevPosition === 'static') {
      container.style.position = prevPosition || '';
    }
  };
}

/* ------------------------------------------------------------------ */
/* 组合入口                                                            */
/* ------------------------------------------------------------------ */

/**
 * 一次性启用所有时序图交互增强。
 * 返回一个清理函数，组件 unmount 时调用。
 */
export function attachSequenceInteraction(
  graph: AbstractGraph,
  handler: ConnectionHandler,
  container: HTMLElement,
): () => void {
  const cleanup1 = attachHorizontalMessageConstraint(handler);
  const cleanup2 = attachAutoActivation(graph, handler);
  const cleanup3 = attachLifelineHoverDot(graph, container);

  return () => {
    cleanup1();
    cleanup2();
    cleanup3();
  };
}
