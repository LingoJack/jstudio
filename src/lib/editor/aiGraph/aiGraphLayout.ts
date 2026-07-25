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
