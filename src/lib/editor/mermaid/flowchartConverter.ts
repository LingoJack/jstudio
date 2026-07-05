/**
 * flowchartConverter — Mermaid Flowchart → GraphSnapshot 转换
 *
 * 将 Mermaid flowchart/graph 语法解析后的数据转换为 GraphCanvas 可用的快照格式。
 * 包含：
 *   - 节点形状映射（Mermaid 形状 → GraphNodeShape）
 *   - 连线样式映射（Mermaid 箭头 → GraphEdge 样式）
 *   - 自动布局算法（基于图拓扑的层级布局）
 */

import type { FlowchartData, MermaidVertex, MermaidEdge } from './mermaidParser';
import type { GraphNode, GraphEdge, GraphNodeShape, GraphSnapshot } from '../../../components/editor/nodes/graph/graphSnapshot';

/* ------------------------------------------------------------------ */
/* 形状映射                                                            */
/* ------------------------------------------------------------------ */

/**
 * Mermaid 节点形状类型 → GraphNodeShape
 *
 * Mermaid 形状语法：
 *   - 默认方形: id[text] 或 id(text)
 *   - 圆角: id([text])
 *   - 圆形: id((text))
 *   - 菱形: id{text}
 *   - 六边形: id[[text]] → 暂映射为 rectangle
 *   - 不对称: id>text] → 暂映射为 rectangle
 *   - 棍棒/平行四边形: id[/text/] / id[\text\] → 暂映射为 rectangle
 *
 * 参考: https://mermaid.js.org/syntax/flowchart.html#node-shapes
 */
function mapVertexToShape(vertex: MermaidVertex): GraphNodeShape {
  // Mermaid 内部通过 nodeType 或 shape 字段表示形状
  // 类型可能在不同版本有差异，这里用多种方式判断

  const text = vertex.text ?? '';
  const domId = vertex.domId ?? '';

  // 通过 domId 的 pattern 判断形状（flowchart-node-xxx 形式）
  // 更可靠的方式是检查 vertex 的内部 type 字段

  // 检查 styles 数组中是否有形状标记
  const styles = vertex.styles ?? [];
  if (styles.includes('stadium') || styles.includes('round')) {
    return 'rounded';
  }
  if (styles.includes('circle') || styles.includes('ellipse')) {
    return 'ellipse';
  }
  if (styles.includes('diamond') || styles.includes('rhombus')) {
    return 'diamond';
  }

  // 检查 type 字段（mermaid 内部可能设置）
  const type = vertex.type ?? '';
  if (type.includes('round') || type.includes('stadium')) {
    return 'rounded';
  }
  if (type.includes('circle') || type.includes('ellipse')) {
    return 'ellipse';
  }
  if (type.includes('diamond') || type.includes('rhombus')) {
    return 'diamond';
  }

  // 默认为矩形
  return 'rectangle';
}

/** 默认节点尺寸 */
const DEFAULT_NODE_SIZE: Record<GraphNodeShape, { w: number; h: number }> = {
  rectangle: { w: 120, h: 60 },
  rounded: { w: 120, h: 60 },
  ellipse: { w: 120, h: 80 },
  diamond: { w: 80, h: 80 },
  text: { w: 80, h: 30 },
  actor: { w: 50, h: 150 },
  'swimlane-v': { w: 200, h: 300 },
  'swimlane-h': { w: 300, h: 200 },
  lifeline: { w: 100, h: 150 },
  activation: { w: 16, h: 60 },
  note: { w: 100, h: 60 },
  'edge-line': { w: 100, h: 20 },
  'edge-ortho': { w: 100, h: 20 },
  'edge-dashed': { w: 100, h: 20 },
  'edge-no-arrow': { w: 100, h: 20 },
};

/* ------------------------------------------------------------------ */
/* 连线映射                                                            */
/* ------------------------------------------------------------------ */

/**
 * Mermaid 边类型 → GraphEdge 样式
 *
 * Mermaid 连线语法：
 *   - 箭头实线: --> 或 ---> → endArrow='classic', dashed=false
 *   - 无箭头实线: --- 或 ---- → endArrow='none', dashed=false
 *   - 箭头虚线: -.-> 或 -..-> → endArrow='classic', dashed=true
 *   - 无箭头虚线: -.- 或 -..- → endArrow='none', dashed=true
 *   - 粗箭头: ==> 或 ===> → strokeWidth=3, dashed=false
 *   - 多箭头: --o 或 --x → 特殊箭头类型
 *
 * 参考: https://mermaid.js.org/syntax/flowchart.html#links
 */
function mapEdgeTypeToStyle(edge: MermaidEdge): {
  routing: 'orthogonal' | 'straight';
  dashed: boolean;
  endArrow: string;
  strokeWidth: number;
} {
  const type = edge.type ?? '';
  const stroke = edge.stroke ?? 'normal';

  // stroke 类型: normal, dotted, thick
  const strokeWidth = stroke === 'thick' ? 3 : 1.5;
  const dashed = stroke === 'dotted';

  // 箭头类型
  let endArrow = 'classic';
  if (type.includes('arrow_cross')) {
    endArrow = 'block';
  } else if (type.includes('arrow_circle')) {
    endArrow = 'oval';
  } else if (type.includes('arrow_open')) {
    endArrow = 'none';
  } else if (type.includes('double_arrow')) {
    // 双向箭头：设置 startArrow
    endArrow = 'classic';
    // 在 GraphEdge 中会特殊处理
  }

  // 连线走线风格：默认正交（流程图标准）
  const routing: 'orthogonal' | 'straight' = 'orthogonal';

  return { routing, dashed, endArrow, strokeWidth };
}

/* ------------------------------------------------------------------ */
/* 自动布局                                                            */
/* ------------------------------------------------------------------ */

/**
 * 简化层级布局算法
 *
 * 基于图的拓扑结构进行层级划分，然后分配坐标。
 * 算法：
 *   1. 找到所有入度为 0 的节点作为第一层
 *   2. BFS 逐层展开，每层节点横向排列
 *   3. 同层节点间距 H_SPACING，层间距 V_SPACING
 */
function layoutNodes(
  vertices: Map<string, MermaidVertex>,
  edges: MermaidEdge[],
  direction: string,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  // 获取所有节点 ID
  const nodeIds = Array.from(vertices.keys());
  if (nodeIds.length === 0) return positions;

  // 构建邻接关系（有向图）
  const outgoing = new Map<string, string[]>(); // 节点 → 出边目标列表
  const incoming = new Map<string, string[]>(); // 节点 → 入边源列表

  for (const nodeId of nodeIds) {
    outgoing.set(nodeId, []);
    incoming.set(nodeId, []);
  }

  for (const edge of edges) {
    const from = edge.start;
    const to = edge.end;
    if (outgoing.has(from)) {
      outgoing.get(from)?.push(to);
    }
    if (incoming.has(to)) {
      incoming.get(to)?.push(from);
    }
  }

  // 计算入度，找出第一层（入度=0 或被所有节点指向）
  const inDegree = new Map<string, number>();
  for (const nodeId of nodeIds) {
    inDegree.set(nodeId, incoming.get(nodeId)?.length ?? 0);
  }

  // 使用拓扑排序进行层级分配
  const levels: string[][] = [];
  const assigned = new Set<string>();
  const queue: string[] = [];

  // 初始：入度为 0 的节点
  for (const nodeId of nodeIds) {
    if (inDegree.get(nodeId) === 0) {
      queue.push(nodeId);
    }
  }

  // 如果没有入度为 0 的节点（环形图），选第一个作为起点
  if (queue.length === 0 && nodeIds.length > 0) {
    queue.push(nodeIds[0]);
  }

  // BFS 分层
  while (queue.length > 0) {
    const currentLevel = [...queue];
    levels.push(currentLevel);
    queue.length = 0;

    for (const nodeId of currentLevel) {
      assigned.add(nodeId);
      // 减少后续节点的入度
      for (const next of outgoing.get(nodeId) ?? []) {
        if (!assigned.has(next)) {
          const deg = inDegree.get(next) ?? 1;
          inDegree.set(next, deg - 1);
          if (deg - 1 <= 0) {
            queue.push(next);
          }
        }
      }
    }

    // 处理环形图：如果还有未分配节点但 queue 空，加入剩余节点
    if (queue.length === 0) {
      for (const nodeId of nodeIds) {
        if (!assigned.has(nodeId)) {
          queue.push(nodeId);
          break; // 只加一个，继续 BFS
        }
      }
    }
  }

  // 坐标分配
  const H_SPACING = 140; // 同层节点水平间距
  const V_SPACING = 100; // 层间垂直间距

  // 方向调整
  const isHorizontal = direction === 'LR' || direction === 'RL';
  const isReverse = direction === 'RL' || direction === 'BT';

  for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
    const level = isReverse ? levels[levels.length - 1 - levelIdx] : levels[levelIdx];

    for (let nodeIdx = 0; nodeIdx < level.length; nodeIdx++) {
      const nodeId = level[nodeIdx];

      if (isHorizontal) {
        // 水平布局：层对应列，节点对应行
        positions.set(nodeId, {
          x: levelIdx * H_SPACING,
          y: nodeIdx * V_SPACING,
        });
      } else {
        // 垂直布局（默认 TB）：层对应行，节点对应列
        positions.set(nodeId, {
          x: nodeIdx * H_SPACING,
          y: levelIdx * V_SPACING,
        });
      }
    }
  }

  // 偏移校正：让所有节点在正数坐标区域
  let minX = Infinity;
  let minY = Infinity;
  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
  }
  if (minX < 50 || minY < 50) {
    const offsetX = Math.max(0, 50 - minX);
    const offsetY = Math.max(0, 50 - minY);
    for (const [nodeId, pos] of positions) {
      positions.set(nodeId, {
        x: pos.x + offsetX,
        y: pos.y + offsetY,
      });
    }
  }

  return positions;
}

/* ------------------------------------------------------------------ */
/* 转换函数                                                            */
/* ------------------------------------------------------------------ */

/**
 * 将 Flowchart 数据转换为 GraphSnapshot
 */
export function convertFlowchartToSnapshot(data: FlowchartData): GraphSnapshot {
  const { vertices, edges, direction } = data;

  const nodes: GraphNode[] = [];
  const graphEdges: GraphEdge[] = [];

  // 1. 布局计算
  const positions = layoutNodes(vertices, edges, direction ?? 'TB');

  // 2. 转换节点
  for (const [id, vertex] of vertices) {
    const shape = mapVertexToShape(vertex);
    const size = DEFAULT_NODE_SIZE[shape];
    const pos = positions.get(id) ?? { x: 50, y: 50 };

    nodes.push({
      id: `node-${id}`,
      shape,
      x: pos.x,
      y: pos.y,
      w: size.w,
      h: size.h,
      label: vertex.text ?? id,
    });
  }

  // 3. 转换连线
  for (const edge of edges) {
    const sourceId = `node-${edge.start}`;
    const targetId = `node-${edge.end}`;

    // 检查源和目标节点是否存在
    if (!vertices.has(edge.start) || !vertices.has(edge.end)) {
      continue; // 跳过无效边
    }

    const style = mapEdgeTypeToStyle(edge);

    graphEdges.push({
      id: `edge-${edge.start}-${edge.end}-${Date.now().toString(36).slice(-4)}`,
      source: sourceId,
      target: targetId,
      label: edge.text ?? undefined,
      routing: style.routing,
      endArrow: style.endArrow,
      style: {
        dashed: style.dashed,
        strokeWidth: style.strokeWidth,
      },
    });
  }

  // 4. 构建快照
  return {
    kind: 'jgraph',
    version: 1,
    nodes,
    edges: graphEdges,
    viewport: {
      scale: 1,
      dx: 0,
      dy: 0,
    },
  };
}