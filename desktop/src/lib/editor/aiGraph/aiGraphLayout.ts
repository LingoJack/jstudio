/**
 * aiGraphLayout — AI 生成图表的自动布局。
 *
 * AI 输出的坐标常常全 0 或堆叠在一起，直接渲染会糊成一团。
 * 这里基于图拓扑做 BFS 层级布局：节点按入度分层，同层水平排列，
 * 层间垂直递增。处理环（断环）、孤立节点（尾部追加一列）。
 *
 * 算法移植自 `mermaid/flowchartConverter.ts:152-286`，但解耦 Mermaid
 * 类型，直接作用于 `GraphNode[]` / `GraphEdge[]`。仅重算 x/y，保留
 * 原 w/h（AI 给的尺寸通常合理，无需重算）。
 *
 * 布局方向固定为 TB（自上而下）——AI 生成的图表方向未知，垂直布局
 * 最通用；用户导入后可手动调整。
 */

import type { GraphNode, GraphEdge } from '../../../components/editor/nodes/graph/graphSnapshot';

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

/** 同层节点水平间距（像素）。考虑节点平均宽度 120 + 20 间隙。 */
const H_SPACING = 140;

/** 层间垂直间距（像素）。考虑节点平均高度 60 + 40 间隙。 */
const V_SPACING = 100;

/** 起始坐标偏移，避免节点贴在画布边缘。 */
const ORIGIN_OFFSET = 50;

/* ------------------------------------------------------------------ */
/* 入口                                                                */
/* ------------------------------------------------------------------ */

/**
 * 对一组节点 + 边做层级自动布局，返回带新坐标的节点列表。
 *
 * @param nodes 原始节点（w/h 保留，x/y 会被覆盖）
 * @param edges 边列表（用于推断拓扑层级）
 * @returns 新的节点数组（不修改输入）
 */
export function autoLayoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (nodes.length === 0) return { nodes, edges };

  // 1. 构建邻接表
  const nodeIds = nodes.map((n) => n.id);
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const id of nodeIds) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  for (const edge of edges) {
    if (outgoing.has(edge.source)) outgoing.get(edge.source)!.push(edge.target);
    if (incoming.has(edge.target)) incoming.get(edge.target)!.push(edge.source);
  }

  // 2. 入度
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) inDegree.set(id, incoming.get(id)?.length ?? 0);

  // 3. BFS 分层
  const levels: string[][] = [];
  const assigned = new Set<string>();
  const queue: string[] = [];

  // 起点：入度为 0 的节点
  for (const id of nodeIds) {
    if (inDegree.get(id) === 0) queue.push(id);
  }
  // 全是环 → 选第一个作起点
  if (queue.length === 0) queue.push(nodeIds[0]);

  while (queue.length > 0) {
    const currentLevel = [...queue];
    levels.push(currentLevel);
    queue.length = 0;

    for (const id of currentLevel) {
      assigned.add(id);
      for (const next of outgoing.get(id) ?? []) {
        if (assigned.has(next)) continue;
        const deg = inDegree.get(next) ?? 1;
        inDegree.set(next, deg - 1);
        if (deg - 1 <= 0) queue.push(next);
      }
    }

    // 环断路：queue 空但还有未分配节点 → 挑一个继续
    if (queue.length === 0) {
      for (const id of nodeIds) {
        if (!assigned.has(id)) {
          queue.push(id);
          break;
        }
      }
    }
  }

  // 4. 分配坐标：层 → 行（y），同层节点 → 列（x）
  const positions = new Map<string, { x: number; y: number }>();
  for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
    const level = levels[levelIdx];
    for (let nodeIdx = 0; nodeIdx < level.length; nodeIdx++) {
      positions.set(level[nodeIdx], {
        x: nodeIdx * H_SPACING + ORIGIN_OFFSET,
        y: levelIdx * V_SPACING + ORIGIN_OFFSET,
      });
    }
  }

  // 5. 孤立节点（未出现在任何 level 里——理论上不会发生，因为 BFS 会兜底，
  //    但防御性处理：遗漏的节点追加到尾部一列）
  for (const node of nodes) {
    if (!positions.has(node.id)) {
      positions.set(node.id, {
        x: ORIGIN_OFFSET,
        y: levels.length * V_SPACING + ORIGIN_OFFSET,
      });
    }
  }

  // 6. 应用新坐标，返回新数组（不修改输入）
  const laidOutNodes = nodes.map((node) => {
    const pos = positions.get(node.id);
    return pos ? { ...node, x: pos.x, y: pos.y } : node;
  });

  return { nodes: laidOutNodes, edges };
}

/* ------------------------------------------------------------------ */
/* 时序图布局                                                          */
/* ------------------------------------------------------------------ */

/** 时序图布局常量（与 mermaid/sequenceConverter.ts 保持一致）。 */
const SEQ_PARTICIPANT_W = 100;
const SEQ_PARTICIPANT_SPACING = 150;
const SEQ_HEAD_HEIGHT = 50;
const SEQ_MESSAGE_SPACING = 40;
const SEQ_MESSAGE_START_Y = SEQ_HEAD_HEIGHT + 20;
const SEQ_MARGIN = 50;
const SEQ_ACTIVATION_W = 16;
const SEQ_ACTIVATION_H = 40;

/**
 * 时序图布局：lifeline 水平排列，消息按出现顺序垂直递增。
 *
 * 参照 `mermaid/sequenceConverter.ts` 的布局逻辑，但直接作用于
 * AI 输出的 `GraphNode[]` / `GraphEdge[]`。
 *
 * @param nodes 原始节点
 * @param edges 边列表
 * @returns 新的节点 + 边数组（不修改输入）
 */
export function autoLayoutSequence(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (nodes.length === 0) return { nodes, edges };

  // 1. 分类节点
  const lifelines = nodes.filter((n) => n.shape === 'lifeline');
  const activations = nodes.filter((n) => n.shape === 'activation');
  const others = nodes.filter(
    (n) => n.shape !== 'lifeline' && n.shape !== 'activation',
  );

  // 没有 lifeline -> 降级为流程图布局
  if (lifelines.length === 0) return autoLayoutGraph(nodes, edges);

  // 2. 统计 lifeline 之间的消息数（用于计算生命线高度）
  const lifelineIds = new Set(lifelines.map((n) => n.id));
  const messageEdges = edges.filter(
    (e) => lifelineIds.has(e.source) && lifelineIds.has(e.target),
  );
  const numMessages = Math.max(messageEdges.length, 1);

  // 3. 计算生命线高度
  const lifelineH = Math.max(
    200,
    SEQ_MESSAGE_START_Y + numMessages * SEQ_MESSAGE_SPACING + SEQ_MARGIN,
  );

  // 4. 水平排列 lifeline
  const lifelineX = new Map<string, number>();
  const laidOutLifelines = lifelines.map((node, i) => {
    const x = SEQ_MARGIN + i * SEQ_PARTICIPANT_SPACING;
    lifelineX.set(node.id, x);
    return {
      ...node,
      x,
      y: SEQ_MARGIN,
      w: SEQ_PARTICIPANT_W,
      h: lifelineH,
    };
  });

  // 5. 构建邻接表：activation / other -> 关联的 lifeline
  const edgesByNode = new Map<string, { source: string; target: string }[]>();
  for (const e of edges) {
    for (const id of [e.source, e.target]) {
      if (!edgesByNode.has(id)) edgesByNode.set(id, []);
      edgesByNode.get(id)!.push({ source: e.source, target: e.target });
    }
  }

  /** 找到节点通过边关联的 lifeline id（优先作为 source，其次 target）。 */
  function findConnectedLifeline(nodeId: string): string | undefined {
    const conns = edgesByNode.get(nodeId) ?? [];
    for (const c of conns) {
      if (c.source === nodeId && lifelineIds.has(c.target)) return c.target;
      if (c.target === nodeId && lifelineIds.has(c.source)) return c.source;
    }
    return undefined;
  }

  // 6. 排列 activation：贴在对应 lifeline 中心线上，按索引垂直递增
  const activationCountByLifeline = new Map<string, number>();
  const laidOutActivations = activations.map((node) => {
    const llId = findConnectedLifeline(node.id) ?? lifelines[0].id;
    const llX = lifelineX.get(llId) ?? SEQ_MARGIN;
    const llW = SEQ_PARTICIPANT_W;
    const idx = activationCountByLifeline.get(llId) ?? 0;
    activationCountByLifeline.set(llId, idx + 1);

    return {
      ...node,
      x: llX + (llW - SEQ_ACTIVATION_W) / 2,
      y: SEQ_MARGIN + SEQ_MESSAGE_START_Y + idx * SEQ_ACTIVATION_H,
      w: SEQ_ACTIVATION_W,
      h: SEQ_ACTIVATION_H,
    };
  });

  // 7. 排列其他节点（actor / note 等）：放在关联 lifeline 上方
  const otherCountByLifeline = new Map<string, number>();
  const laidOutOthers = others.map((node) => {
    const llId = findConnectedLifeline(node.id) ?? lifelines[0].id;
    const llX = lifelineX.get(llId) ?? SEQ_MARGIN;
    const idx = otherCountByLifeline.get(llId) ?? 0;
    otherCountByLifeline.set(llId, idx + 1);

    const nodeW = node.w || 80;
    const nodeH = node.h || 48;
    return {
      ...node,
      x: llX + (SEQ_PARTICIPANT_W - nodeW) / 2,
      y: SEQ_MARGIN - nodeH - 10 - idx * (nodeH + 10),
      w: nodeW,
      h: nodeH,
    };
  });

  // 8. 为每条消息边计算 waypoints，保证消息按时间顺序垂直排列在生命线上
  //
  // 关键点：maxGraph 默认会把边路由到节点中心。对于同一对生命线之间的多条消息，
  // 如果不设 waypoints，它们会全部叠在同一条水平线上。所以每条消息必须有一个
  // waypoint 明确其 Y 坐标（画布绝对坐标）。
  //
  // 策略：遍历所有 messageEdges，按出现顺序分配 msgY = SEQ_MARGIN +
  // SEQ_MESSAGE_START_Y + idx * SEQ_MESSAGE_SPACING。每条消息设 2 个 waypoints
  // （源端点和目标端点在生命线中心线的对应 Y 上），这样 maxGraph 会画出
  // 一条从 (srcX, msgY) 到 (dstX, msgY) 的水平线。
  const messageEdgeIds = new Set(messageEdges.map((e) => e.id));
  let msgIndex = 0;
  const laidOutEdges = edges.map((e) => {
    if (!messageEdgeIds.has(e.id)) {
      // 非消息边（如 actor->lifeline 关联线）：仅强制 straight routing
      return { ...e, routing: 'straight' as const };
    }
    const srcX = (lifelineX.get(e.source) ?? SEQ_MARGIN) + SEQ_PARTICIPANT_W / 2;
    const dstX = (lifelineX.get(e.target) ?? SEQ_MARGIN) + SEQ_PARTICIPANT_W / 2;
    const msgY = SEQ_MARGIN + SEQ_MESSAGE_START_Y + msgIndex * SEQ_MESSAGE_SPACING;
    msgIndex += 1;

    // 自消息（source === target）需要 3 个 waypoints，画一个向右的回路
    if (e.source === e.target) {
      const loopW = 40;
      return {
        ...e,
        routing: 'straight' as const,
        waypoints: [
          { x: srcX, y: msgY },
          { x: srcX + loopW, y: msgY },
          { x: srcX + loopW, y: msgY + 20 },
          { x: srcX, y: msgY + 20 },
        ],
      };
    }

    return {
      ...e,
      routing: 'straight' as const,
      waypoints: [
        { x: srcX, y: msgY },
        { x: dstX, y: msgY },
      ],
    };
  });

  return {
    nodes: [...laidOutLifelines, ...laidOutActivations, ...laidOutOthers],
    edges: laidOutEdges,
  };
}

/* ------------------------------------------------------------------ */
/* 类型分发                                                            */
/* ------------------------------------------------------------------ */

/**
 * 根据 AI 输出的节点形状自动选择布局算法。
 *
 * - 含 `lifeline` 节点 -> 时序图布局（水平生命线 + 垂直消息流）
 * - 否则 -> 流程图布局（BFS 自上而下分层）
 */
export function autoLayoutByType(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const hasLifeline = nodes.some((n) => n.shape === 'lifeline');
  if (hasLifeline) return autoLayoutSequence(nodes, edges);
  return autoLayoutGraph(nodes, edges);
}
