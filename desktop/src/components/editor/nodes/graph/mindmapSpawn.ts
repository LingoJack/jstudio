/**
 * Mindmap spawn functions - create child / sibling nodes with auto-layout.
 *
 * Extracted from GraphCanvas.tsx. These functions operate on a maxGraph
 * instance but have no React dependencies, making them easy to test
 * independently.
 */

import type { Graph, Cell } from '@maxgraph/core';
import { DEFAULT_SIZE, styleForShape } from './graphConstants';
import { MINDMAP_GAP_X, MINDMAP_GAP_Y, reflowMindmap } from './mindmapLayout';
import { mindmapEdgeStyle, nextCellId } from './graphHelpers';
import { mindmapStyleForDepth, DEFAULT_MINDMAP_SCHEME, type MindmapScheme } from './graphTheme';

/**
 * 计算思维导图 topic 节点在树中的深度。
 *
 * - 根节点（无 topic 父节点）：depth = 0
 * - 根的直接子节点：depth = 1
 * - 以此类推
 *
 * 通过沿入边向上遍历 topic 祖先来计数，带环检测保护。
 */
function topicDepth(graph: Graph, cell: Cell): number {
  const parent = graph.getDefaultParent();
  let cur: Cell | null = cell;
  const visited = new Set<string>();
  let depth = 0;
  while (cur && !visited.has(cur.getId() ?? '')) {
    visited.add(cur.getId() ?? '');
    const inEdges = graph.getIncomingEdges(cur, parent);
    const src = inEdges
      .map((e) => e.getTerminal(true))
      .find((c): c is Cell => {
        if (!c || c === cur) return false;
        // 判断是否为 topic 父节点：检查 style 中的 isTopic 标记
        const style = graph.getCurrentCellStyle(c) as Record<string, unknown>;
        return style?.isTopic === 1 || style?.isTopic === '1';
      });
    if (!src) break;
    cur = src;
    depth++;
  }
  return depth;
}

/**
 * 读取 cell style 上的 mmBranch 标记。
 * 旧快照无标记时返回 0（fallback）。
 */
function branchIndexOf(cell: Cell): number {
  const style = cell.getStyle() as Record<string, unknown> | undefined;
  if (!style) return 0;
  return typeof style.mmBranch === 'number' ? style.mmBranch : 0;
}

/**
 * 统计 parentCell 现有的 topic 子节点数，作为新分支的 branchIndex。
 * 用于在 depth=1 时按兄弟顺序循环 neon 分支色。
 */
function nextBranchIndex(graph: Graph, parentCell: Cell): number {
  const parent = graph.getDefaultParent();
  const outEdges = graph.getOutgoingEdges(parentCell, parent);
  let count = 0;
  for (const edge of outEdges) {
    const target = edge.getTerminal(false);
    if (!target || !target.isVertex()) continue;
    const style = graph.getCurrentCellStyle(target) as Record<string, unknown>;
    if (style?.isTopic === 1 || style?.isTopic === '1') count++;
  }
  return count;
}

/**
 * 构建指定深度 + 方案 + 分支索引的思维导图节点 CellStyle。
 *
 * 以 `styleForShape('topic')` 为基础（提供 shape/rounded/arcSize/isTopic 等结构属性），
 * 再用 `mindmapStyleForDepth(depth, dark, scheme, branchIndex)` 覆盖配色，
 * 并写入 mmScheme/mmBranch/mmDepth 标记供主题刷新反查。
 */
function topicStyleForDepth(
  depth: number,
  dark: boolean,
  scheme: MindmapScheme,
  branchIndex: number,
): Record<string, unknown> {
  return {
    ...styleForShape('topic', dark, scheme),
    ...mindmapStyleForDepth(depth, dark, scheme, branchIndex),
    mmScheme: scheme,
    mmBranch: branchIndex,
    mmDepth: depth,
  };
}

/**
 * 在父节点旁生发一个子节点，并自动进入文本编辑。
 * 插入后对整棵树做整洁树重排（reflowMindmap），保证兄弟子树互不重叠。
 *
 * **左右分栏**：side 参数决定新子节点放在根节点的右侧还是左侧。
 * 非根节点的子节点始终跟随 side 方向水平排开。
 *
 * **分支索引**：depth=1 时按兄弟顺序循环 neon 分支色；depth>=2 时继承父分支索引。
 */
export function spawnMindmapChild(
  graph: Graph,
  parentCell: Cell,
  dark: boolean,
  side: 'right' | 'left' = 'right',
  scheme: MindmapScheme = DEFAULT_MINDMAP_SCHEME,
): void {
  const parentGeo = parentCell.getGeometry();
  if (!parentGeo) return;
  const parent = graph.getDefaultParent();
  const size = DEFAULT_SIZE['topic'];

  // 子节点深度 = 父节点深度 + 1，据此选择配色（分支/叶子层级）。
  const childDepth = topicDepth(graph, parentCell) + 1;
  // 分支索引：depth=1 时按兄弟顺序（用于 neon 循环色）；depth>=2 时继承父分支。
  const branchIndex =
    childDepth === 1
      ? nextBranchIndex(graph, parentCell)
      : branchIndexOf(parentCell);

  // 初始位置放在父节点对应侧，最终位置由 reflowMindmap 统一分配。
  const newX = side === 'right'
    ? parentGeo.x + parentGeo.width + MINDMAP_GAP_X
    : parentGeo.x - MINDMAP_GAP_X - size.w;
  const newY = parentGeo.y;

  graph.batchUpdate(() => {
    const childCell = graph.insertVertex({
      parent,
      id: nextCellId('n'),
      value: '子主题',
      position: [newX, newY],
      size: [size.w, size.h],
      style: topicStyleForDepth(childDepth, dark, scheme, branchIndex),
    });
    graph.insertEdge({
      parent,
      id: nextCellId('e'),
      value: '',
      source: parentCell,
      target: childCell,
      style: mindmapEdgeStyle(dark, scheme, childDepth, branchIndex),
    });
    // 整洁树重排：新子节点会被放到最下方兄弟之后，并推开后续子树。
    reflowMindmap(graph, childCell);
    graph.setSelectionCell(childCell);
  });

  // 等渲染完成后进入文本编辑。
  requestAnimationFrame(() => {
    const cell = graph.getSelectionCell();
    if (cell) graph.startEditingAtCell(cell);
  });
}

/**
 * 在当前节点下方生发一个同级兄弟节点（共享同一父节点），并自动进入文本编辑。
 * 若当前节点无父节点（根节点），则直接在下方生成一个独立节点（无连线）。
 */
export function spawnMindmapSibling(
  graph: Graph,
  currentCell: Cell,
  dark: boolean,
  scheme: MindmapScheme = DEFAULT_MINDMAP_SCHEME,
): void {
  const curGeo = currentCell.getGeometry();
  if (!curGeo) return;
  const parent = graph.getDefaultParent();
  const size = DEFAULT_SIZE['topic'];

  // 查找父节点：当前节点作为 target 的入边的 source。
  const inEdges = graph.getIncomingEdges(currentCell, parent);
  const parentNode = inEdges.length > 0 ? inEdges[0].getTerminal(true) : null;

  const newX = curGeo.x;
  const newY = curGeo.y + curGeo.height + MINDMAP_GAP_Y;

  // 兄弟节点与当前节点同层，使用相同深度的配色。
  // 分支索引：depth=1 时每个兄弟都是独立分支，按兄弟顺序循环 neon 分支色；
  // depth>=2 时继承当前节点的分支索引（同一分支下叶子共享颜色）。
  const siblingDepth = topicDepth(graph, currentCell);
  const branchIndex =
    siblingDepth === 1 && parentNode
      ? nextBranchIndex(graph, parentNode)
      : branchIndexOf(currentCell);

  graph.batchUpdate(() => {
    const siblingCell = graph.insertVertex({
      parent,
      id: nextCellId('n'),
      value: '分支主题',
      position: [newX, newY],
      size: [size.w, size.h],
      style: topicStyleForDepth(siblingDepth, dark, scheme, branchIndex),
    });
    if (parentNode) {
      graph.insertEdge({
        parent,
        id: nextCellId('e'),
        value: '',
        source: parentNode,
        target: siblingCell,
        style: mindmapEdgeStyle(dark, scheme, siblingDepth, branchIndex),
      });
      // 整洁树重排：新兄弟节点会挤开当前节点的子树及后续兄弟。
      reflowMindmap(graph, siblingCell);
    }
    graph.setSelectionCell(siblingCell);
  });

  requestAnimationFrame(() => {
    const cell = graph.getSelectionCell();
    if (cell) graph.startEditingAtCell(cell);
  });
}
