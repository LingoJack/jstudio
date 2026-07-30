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
        // 自环（ac 拖回自身）时不锁定 Y，允许用户从不同高度起/止
        const isSelfLoop = handler.currentState?.cell === sourceCell;
        if (!isSelfLoop) {
          point.y = handler.first.y;
        }
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
        // 自环时不锁定 Y
        const isSelfLoop = handler.currentState?.cell === sourceCell;
        if (!isSelfLoop) {
          current.y = handler.first.y;
        }
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
 * 监听 ConnectionHandler 的 CONNECT 事件，处理时序图五种连线场景：
 *
 *  A. 自环（ac → 同一 ac）：实线 + classic，添加航点形成矩形环
 *  B. ac → ll（返回消息）：虚线 + openThin，保留 exit 约束、清除 entry 约束
 *  C. ac → 不同 ac（普通消息）：实线 + classic，保留双方约束
 *  D. ll → ll（创建 ac）：在 target lifeline 上生成 activation，
 *     msgY 位于 ac 顶部 25% 处（中上部分），entry 约束设为 (0|1, 0.25)
 *  E. ll → ac / 其他：不特殊处理
 *
 * 端点不同保证：ll→ac 的 entryY 固定为 0.25，而 ac 上的 exit/entry 约束
 * 在 8px 间距点(0/0.2/0.4/0.6/0.8/1.0)上，0.25 不与任何间距点重合。
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

    const sourceIsLL = isLifeline(source);
    const targetIsLL = isLifeline(target);
    const sourceIsAct = isActivation(source);
    const targetIsAct = isActivation(target);

    // --- 场景 A：自环（ac → 同一 ac）---
    const isSelfLoop = source === target && sourceIsAct;
    // --- 场景 B：ac → ll（返回消息）---
    const isReturnMessage = sourceIsAct && targetIsLL && !isSelfLoop;
    // --- 场景 C：ac → 不同 ac（普通消息）---
    const bothActivation = sourceIsAct && targetIsAct && !isSelfLoop;
    // --- 场景 D：ll/actor -> ll（创建 ac）---
    const shouldGenerate = targetIsLL && !sourceIsAct;

    graphLog(`isSelfLoop=${isSelfLoop}, isReturn=${isReturnMessage}, bothAct=${bothActivation}, shouldGenerate=${shouldGenerate}`);

    /* ---------- 场景 A：自环 ---------- */
    if (isSelfLoop) {
      model.beginUpdate();
      try {
        const style = edge.getStyle() ?? {};
        model.setStyle(edge, { ...style, edgeStyle: undefined, endArrow: 'classic' });

        // 读取 exit/entry 约束，添加航点形成矩形环
        const s = edge.getStyle() as Record<string, number | undefined>;
        const exitX = s?.exitX ?? 0.5;
        const exitY = s?.exitY ?? 0.5;
        const entryX = s?.entryX ?? 0.5;
        const entryY = s?.entryY ?? 0.5;
        const acGeo = source.getGeometry();

        const geo = edge.getGeometry()?.clone();
        if (geo && acGeo) {
          geo.sourcePoint = null;
          geo.targetPoint = null;

          const exitAbsY = acGeo.y + exitY * acGeo.height;
          const entryAbsY = acGeo.y + entryY * acGeo.height;
          const loopOffset = 30;

          // exit 和 entry 在同侧时，添加航点形成矩形环
          if (exitX >= 0.5 && entryX >= 0.5) {
            // 都在右侧
            const wpX = acGeo.x + acGeo.width + loopOffset;
            geo.points = [new Point(wpX, exitAbsY), new Point(wpX, entryAbsY)];
          } else if (exitX < 0.5 && entryX < 0.5) {
            // 都在左侧
            const wpX = acGeo.x - loopOffset;
            geo.points = [new Point(wpX, exitAbsY), new Point(wpX, entryAbsY)];
          }
          // 分布在两侧时不加航点（直线穿过 ac）

          model.setGeometry(edge, geo);
        }
      } finally {
        model.endUpdate();
      }
      return;
    }

    /* ---------- 场景 C：ac → 不同 ac（普通消息）---------- */
    if (bothActivation) {
      model.beginUpdate();
      try {
        const style = edge.getStyle() ?? {};
        model.setStyle(edge, { ...style, edgeStyle: undefined, endArrow: 'classic' });
        const geo = edge.getGeometry()?.clone();
        if (geo) {
          geo.sourcePoint = null;
          geo.targetPoint = null;
          model.setGeometry(edge, geo);
        }
      } finally {
        model.endUpdate();
      }
      return;
    }

    /* ---------- 场景 B：ac → ll（返回消息）---------- */
    if (isReturnMessage) {
      model.beginUpdate();
      try {
        const style = edge.getStyle() ?? {};
        const cleaned: Record<string, unknown> = { ...style };
        // 保留 exit 约束（用户在 ac 上的点击位置），清除 entry 约束（让 ll perimeter 处理）
        delete cleaned.entryX;
        delete cleaned.entryY;
        delete cleaned.entryPerimeter;
        delete cleaned.entryDx;
        delete cleaned.entryDy;
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
      return;
    }

    /* ---------- 场景 E：ll → ac / 其他 ---------- */
    if (!shouldGenerate) return;

    /* ---------- 场景 D：ll → ll（创建 ac）---------- */
    const targetGeo = target.getGeometry();
    if (!targetGeo) return;

    // 消息 Y：优先从 edge 的 exit 约束计算（确保与实际连线 Y 完全一致），
    // 其次从 sourcePoint（actor 等无约束节点会使用），
    // 最后回退到 handler.first（鼠标按下时的 Y）。
    const sourceGeo = source.getGeometry();
    const edgeStyle0 = edge.getStyle() as Record<string, number | undefined> | null;
    const exitYRel = edgeStyle0?.exitY;
    const edgeGeo0 = edge.getGeometry();
    let msgY: number;
    if (exitYRel != null && sourceGeo) {
      // exitY 是相对于源节点的相对坐标 (0-1)
      msgY = sourceGeo.y + exitYRel * sourceGeo.height;
      graphLog(`msgY=${msgY} from exit constraint (exitY=${exitYRel}, srcY=${sourceGeo.y}, srcH=${sourceGeo.height})`);
    } else if (edgeGeo0?.sourcePoint) {
      msgY = edgeGeo0.sourcePoint.y;
      graphLog(`msgY=${msgY} from edge.sourcePoint (${edgeGeo0.sourcePoint.x}, ${edgeGeo0.sourcePoint.y})`);
    } else if (handler.first) {
      msgY = handler.first.y;
      graphLog(`msgY=${msgY} from handler.first (${handler.first.x}, ${handler.first.y})`);
    } else {
      msgY = targetGeo.y + HEAD_HEIGHT + 30;
      graphLog(`msgY=${msgY} fallback to targetGeo.y + HEAD_HEIGHT + 30`);
    }

    const targetCenterX = targetGeo.x + targetGeo.width / 2;
    // activation 居中在 lifeline 上：
    //   - X 方向：中心 X = lifeline 中心 X，左右各延伸 8px
    //   - Y 方向：msgY 位于 ac 顶部 25% 处（中上部分），即 ac.y = msgY - h * 0.25
    //     这样 ll 的消息线端点自然落在 ac 的中上部分
    const actGeo = {
      x: targetCenterX - ACTIVATION_W / 2,
      y: msgY - ACTIVATION_H * 0.25,
      w: ACTIVATION_W,
      h: ACTIVATION_H,
    };

    // 判断源 ll 在目标 ll 的左侧还是右侧，决定 entry 在 ac 的左/右边缘
    const sourceCenterX = sourceGeo ? sourceGeo.x + sourceGeo.width / 2 : 0;
    const sourceIsLeft = sourceCenterX < targetCenterX;
    const entryX = sourceIsLeft ? 0 : 1;
    const entryY = 0.25; // 中上部分

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
      // 然后设置新的 entry 约束到 ac 的中上部分。
      // 保留 source 侧的 exit 约束（exitY 记录了正确的消息 Y）。
      const style = edge.getStyle() ?? {};
      const cleaned: Record<string, unknown> = { ...style };
      delete cleaned.entryPerimeter;
      delete cleaned.entryDx;
      delete cleaned.entryDy;
      model.setStyle(edge, { ...cleaned, entryX, entryY, edgeStyle: undefined, endArrow: 'classic' });

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

  // 第二条线（用于活动块的双边高亮）
  const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('stroke', '#4A90E2');
  line2.setAttribute('stroke-width', '3');
  line2.setAttribute('stroke-opacity', '0.6');
  line2.setAttribute('stroke-linecap', 'round');
  line2.style.display = 'none';

  svg.appendChild(line);
  svg.appendChild(line2);

  // graph 容器需要 position:relative 才能定位子元素
  const prevPosition = container.style.position;
  if (!prevPosition || prevPosition === 'static') {
    container.style.position = 'relative';
  }
  container.appendChild(svg);

  function hide() {
    line.style.display = 'none';
    line2.style.display = 'none';
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
          const viewX = (centerX + tr.x) * scale;
          const viewStartY = (startY + tr.y) * scale;
          const viewEndY = (endY + tr.y) * scale;
          line.setAttribute('x1', String(viewX));
          line.setAttribute('y1', String(viewStartY));
          line.setAttribute('x2', String(viewX));
          line.setAttribute('y2', String(viewEndY));
          line.style.display = '';
          line2.style.display = 'none';
          return;
        }
      }
    }

    // 活动块：高亮左右两边（参考 lifeline 的拉线逻辑）
    if (isActivation(cell)) {
      const geo = (cell as Cell).getGeometry();
      if (geo) {
        const leftX = geo.x;
        const rightX = geo.x + geo.width;
        const startY = geo.y;
        const endY = geo.y + geo.height;
        const viewLeftX = (leftX + tr.x) * scale;
        const viewRightX = (rightX + tr.x) * scale;
        const viewStartY = (startY + tr.y) * scale;
        const viewEndY = (endY + tr.y) * scale;
        line.setAttribute('x1', String(viewLeftX));
        line.setAttribute('y1', String(viewStartY));
        line.setAttribute('x2', String(viewLeftX));
        line.setAttribute('y2', String(viewEndY));
        line.style.display = '';
        line2.setAttribute('x1', String(viewRightX));
        line2.setAttribute('y1', String(viewStartY));
        line2.setAttribute('x2', String(viewRightX));
        line2.setAttribute('y2', String(viewEndY));
        line2.style.display = '';
        return;
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
