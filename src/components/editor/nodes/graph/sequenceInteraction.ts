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
  type ConnectionHandler,
  type InternalMouseEvent,
} from '@maxgraph/core';
import { invoke } from '@tauri-apps/api/core';
import { HEAD_HEIGHT } from './customShapes';

/* ------------------------------------------------------------------ */
/* 调试日志：写到 ~/Library/Application Support/jstudio/ai_graph.log    */
/* ------------------------------------------------------------------ */

/**
 * 把一行调试日志写入文件（通过 Tauri command）。
 * fire-and-forget：不等待结果，避免阻塞交互。
 * 同时保留 console.log 方便开发者工具直接看。
 */
function graphLog(msg: string): void {
  console.log(`[autoActivation] ${msg}`);
  invoke('write_graph_log', { msg }).catch(() => {
    // 忽略写日志失败（比如非 Tauri 环境下测试）
  });
}

// 模块级日志：确认这个文件被加载了
graphLog('sequenceInteraction module loaded');

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

export function isActor(cell: Cell | null): boolean {
  return getShapeName(cell) === 'umlActor';
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
  handler.updateCurrentState = (me: InternalMouseEvent, point: Point) => {
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
 *    一个 activation（w=16, h=40，顶部对齐消息线），并把这条 edge 的 target 改为新生成的 activation
 *  - source=lifeline, target=activation：不生成（用户拖到了一个已存在的 activation 上）
 *  - source=activation, target=lifeline：回消息，不生成 activation，
 *    设置虚线 + openThin 箭头样式（UML 返回消息惯例）
 *  - source=activation, target=activation：不生成
 *
 * 所有修改包在 batchUpdate 里，undo 一次回滚消息 + activation。
 */
export function attachAutoActivation(
  graph: AbstractGraph,
  handler: ConnectionHandler,
  activationStyleProvider?: () => Record<string, unknown>,
): () => void {
  const listener = (_sender: unknown, evt: { getProperty: (key: string) => unknown }) => {
    const edge = evt.getProperty('cell') as Cell | null;
    graphLog(`CONNECT fired, edge=${edge?.getId()}, isEdge=${edge?.isEdge()}`);
    if (!edge || !edge.isEdge()) return;

    const model = graph.getDataModel();
    const source = edge.getTerminal(true);
    const target = edge.getTerminal(false);
    const srcShape = source?.getStyle()?.shape;
    const tgtShape = target?.getStyle()?.shape;
    graphLog(`source=${source?.getId()}(shape=${srcShape}), target=${target?.getId()}(shape=${tgtShape})`);
    if (!source || !target) return;

    // lifeline -> lifeline：生成 activation（含 actor -> lifeline 场景）。
    // activation -> lifeline：回消息，不生成 activation，设置虚线返回样式。
    // activation -> activation：不生成（用户拖到了已存在的 activation 上）。
    const isReturnMessage = isActivation(source);
    const shouldGenerate = isLifeline(target) && !isReturnMessage;
    graphLog(`shouldGenerate=${shouldGenerate}, isReturn=${isReturnMessage}, isLifeline(src)=${isLifeline(source)}, isLifeline(tgt)=${isLifeline(target)}`);
    if (!shouldGenerate) {
      if (isReturnMessage) {
        // 回消息：清除约束 + 虚线 + openThin
        model.beginUpdate();
        try {
          const style = edge.getStyle() ?? {};
          const cleaned: Record<string, unknown> = { ...style };
          delete cleaned.entryX;
          delete cleaned.entryY;
          delete cleaned.entryPerimeter;
          delete cleaned.entryDx;
          delete cleaned.entryDy;
          delete cleaned.exitX;
          delete cleaned.exitY;
          delete cleaned.exitPerimeter;
          delete cleaned.exitDx;
          delete cleaned.exitDy;
          model.setStyle(edge, { ...cleaned, edgeStyle: undefined, endArrow: 'openThin', dashed: true });

          const retGeo = edge.getGeometry()?.clone();
          if (retGeo) {
            retGeo.sourcePoint = null;
            retGeo.targetPoint = null;
            model.setGeometry(edge, retGeo);
          }
        } finally {
          model.endUpdate();
        }
      }
      return;
    }

    const targetGeo = target.getGeometry();
    if (!targetGeo) return;

    // 消息 Y：优先用 handler.first（起点 Y，是用户按下鼠标时的位置，最准确、最直观）。
    // 之前用 edge.targetPoint 会导致 msgY 变成鼠标松开位置的 Y，如果用户拖动过程中鼠标
    // 上下移动了（虽然水平预览锁定了，但 targetPoint 可能仍是鼠标原始位置），会导致
    // activation 和消息线的 Y 不一致，视觉上线是斜的。
    // 用 handler.first.y 保证消息 Y = 起点 Y = 水平线 Y = activation Y，四者对齐。
    let msgY: number;
    if (handler.first) {
      msgY = handler.first.y;
      graphLog(`msgY=${msgY} from handler.first (${handler.first.x}, ${handler.first.y})`);
    } else {
      const edgeGeo0 = edge.getGeometry();
      if (edgeGeo0?.sourcePoint) {
        msgY = edgeGeo0.sourcePoint.y;
        graphLog(`msgY=${msgY} fallback to edge.sourcePoint (${edgeGeo0.sourcePoint.x}, ${edgeGeo0.sourcePoint.y})`);
      } else {
        msgY = targetGeo.y + HEAD_HEIGHT + 30;
        graphLog(`msgY=${msgY} fallback to targetGeo.y + HEAD_HEIGHT + 30`);
      }
    }

    const targetCenterX = targetGeo.x + targetGeo.width / 2;
    // activation 居中在 lifeline 上：
    //   - X 方向：中心 X = lifeline 中心 X，左右各延伸 8px
    //   - Y 方向：activation 的中心 Y = msgY，即顶部 Y = msgY - h/2
    const actGeo = {
      x: targetCenterX - ACTIVATION_W / 2,
      y: msgY - ACTIVATION_H / 2,
      w: ACTIVATION_W,
      h: ACTIVATION_H,
    };

    // 在同一个 batch 里：创建 activation + 修改 edge 的 target 指向 activation
    model.beginUpdate();
    try {
      const parent = graph.getDefaultParent();
      const actStyle = activationStyleProvider
        ? activationStyleProvider()
        : { shape: 'umlActivation' };
      const actCell = graph.insertVertex({
        parent,
        id: genActivationId(),
        value: '',
        position: [actGeo.x, actGeo.y],
        size: [actGeo.w, actGeo.h],
        style: actStyle,
      });

      // 把 edge 的 target 改为 activation
      model.setTerminal(edge, actCell, false);

      // 清除 target 侧的 entry 约束（原 lifeline 的约束不适用于 activation），
      // 保留 source 侧的 exit 约束（exitY 记录了正确的消息 Y）。
      // maxGraph 回退到 ActivationPerimeter 投影端点到边缘。
      const style = edge.getStyle() ?? {};
      const cleaned: Record<string, unknown> = { ...style };
      delete cleaned.entryX;
      delete cleaned.entryY;
      delete cleaned.entryPerimeter;
      delete cleaned.entryDx;
      delete cleaned.entryDy;
      model.setStyle(edge, { ...cleaned, edgeStyle: undefined, endArrow: 'classic' });

      const finalGeo = edge.getGeometry()?.clone();
      if (finalGeo) {
        finalGeo.sourcePoint = null;
        finalGeo.targetPoint = null;
        model.setGeometry(edge, finalGeo);
      }
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
 * 悬停 lifeline 时整条中心虚线高亮（粗蓝线覆盖）。
 *
 * 实现：在 graph 容器上监听 mousemove，判断鼠标下方 cell 是不是 lifeline，
 * 是的话在 lifeline 中心虚线位置画一条 3px 粗的半透明蓝线（从头部底部到 lifeline 底部），
 * 否则隐藏。
 *
 * 视觉反馈：让用户明确知道"这一整条线都可以拉"，配合密集的 constraint（每 10px 一个，
 * 图片透明）实现"任意位置都能拉"的体验。
 */
export function attachLifelineHoverDot(graph: AbstractGraph, container: HTMLElement): () => void {
  // 创建 SVG 高亮线
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

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('stroke', '#4A90E2');
  line.setAttribute('stroke-width', '3');
  line.setAttribute('stroke-opacity', '0.6');
  line.setAttribute('stroke-linecap', 'round');
  line.style.display = 'none';

  svg.appendChild(line);

  // graph 容器需要 position:relative 才能定位子元素
  const prevPosition = container.style.position;
  if (!prevPosition || prevPosition === 'static') {
    container.style.position = 'relative';
  }
  container.appendChild(svg);

  function hide() {
    line.style.display = 'none';
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
          const startY = geo.y + HEAD_HEIGHT;
          const endY = geo.y + geo.height;
          // 转回视图坐标（SVG 在容器上用像素定位）
          const viewX = (centerX + tr.x) * scale;
          const viewStartY = (startY + tr.y) * scale;
          const viewEndY = (endY + tr.y) * scale;
          line.setAttribute('x1', String(viewX));
          line.setAttribute('y1', String(viewStartY));
          line.setAttribute('x2', String(viewX));
          line.setAttribute('y2', String(viewEndY));
          line.style.display = '';
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
/* 4. 禁止 actor 作为消息 source                                        */
/* ------------------------------------------------------------------ */

/**
 * 在 UML 时序图语义中，actor（外部参与者）只能作为消息的**目标**（系统被外部调用），
 * 不能作为消息的**源**（外部参与者通常不主动向系统发起消息，除非它是系统边界）。
 *
 * 更重要的是：actor 是"没有生命线"的实体，从 actor 拖出的消息在几何上无法水平约束
 * 到 lifeline 的时间轴上，会破坏时序图的整体一致性。
 *
 * 实现：通过 hook graph.isValidSource，禁止 actor 作为拉线起点。
 * 用户想从 actor 起线时，maxGraph 会直接忽略这次操作（不进入 ConnectionHandler）。
 */
export function attachActorSourceBlock(graph: AbstractGraph): () => void {
  const origIsValidSource = graph.isValidSource.bind(graph);
  graph.isValidSource = (cell: Cell | null) => {
    if (isActor(cell)) return false;
    return origIsValidSource(cell);
  };
  return () => {
    graph.isValidSource = origIsValidSource;
  };
}

/* ------------------------------------------------------------------ */
/* 5. 活动块不可移动（绑定生命线，仅支持调节大小）                        */
/* ------------------------------------------------------------------ */

/**
 * 活动块（activation）在 UML 时序图中贴在生命线上，用户不应能把它拖走。
 * 禁止移动后，用户仍可从活动块拉出消息线（通过连接点），也可拖拽手柄调节大小。
 */
export function attachActivationImmovable(graph: AbstractGraph): () => void {
  const orig = graph.isCellMovable.bind(graph);
  graph.isCellMovable = (cell: Cell | null) => {
    if (!cell) return false;
    if (isActivation(cell)) return false;
    return orig(cell);
  };
  return () => {
    graph.isCellMovable = orig;
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
  activationStyleProvider?: () => Record<string, unknown>,
): () => void {
  graphLog(`attachSequenceInteraction called, handler=${handler ? 'ok' : 'null'}, container=${container ? 'ok' : 'null'}`);
  const cleanup1 = attachHorizontalMessageConstraint(handler);
  const cleanup2 = attachAutoActivation(graph, handler, activationStyleProvider);
  const cleanup3 = attachLifelineHoverDot(graph, container);
  const cleanup4 = attachActorSourceBlock(graph);
  const cleanup5 = attachActivationImmovable(graph);
  graphLog('attachSequenceInteraction done, 5 hooks installed');

  return () => {
    cleanup1();
    cleanup2();
    cleanup3();
    cleanup4();
    cleanup5();
  };
}
