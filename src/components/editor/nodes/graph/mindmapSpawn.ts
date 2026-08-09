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
import { mindmapStyleForDepth } from './graphTheme';

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
 * 构建指定深度的思维导图节点 CellStyle。
 *
 * 以 `styleForShape('topic')` 为基础（提供 shape/rounded/arcSize/isTopic 等结构属性），
 * 再用 `mindmapStyleForDepth(depth)` 覆盖配色（fillColor/strokeColor/fontColor 等）。
 */
function topicStyleForDepth(depth: number, dark: boolean): Record<string, unknown> {
  return {
    ...styleForShape('topic', dark),
    ...mindmapStyleForDepth(depth, dark),
  };
}

/**
 * 在父节点右侧生发一个子节点，并自动进入文本编辑。
 * 插入后对整棵树做整洁树重排（reflowMindmap），保证兄弟子树互不重叠。
 */
export function spawnMindmapChild(graph: Graph, parentCell: Cell, dark: boolean): void {
  const parentGeo = parentCell.getGeometry();
  if (!parentGeo) return;
  const parent = graph.getDefaultParent();
  const size = DEFAULT_SIZE['topic'];

  // 初始位置放在父节点正右方，最终位置由 reflowMindmap 统一分配。
  const newX = parentGeo.x + parentGeo.width + MINDMAP_GAP_X;
  const newY = parentGeo.y;

  // 子节点深度 = 父节点深度 + 1，据此选择配色（分支/叶子层级）。
  const childDepth = topicDepth(graph, parentCell) + 1;

  graph.batchUpdate(() => {
    const childCell = graph.insertVertex({
      parent,
      id: nextCellId('n'),
      value: '子主题',
      position: [newX, newY],
      size: [size.w, size.h],
      style: topicStyleForDepth(childDepth, dark),
    });
    graph.insertEdge({
      parent,
      id: nextCellId('e'),
      value: '',
      source: parentCell,
      target: childCell,
      style: mindmapEdgeStyle(dark),
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
export function spawnMindmapSibling(graph: Graph, currentCell: Cell, dark: boolean): void {
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
  const siblingDepth = topicDepth(graph, currentCell);

  graph.batchUpdate(() => {
    const siblingCell = graph.insertVertex({
      parent,
      id: nextCellId('n'),
      value: '分支主题',
      position: [newX, newY],
      size: [size.w, size.h],
      style: topicStyleForDepth(siblingDepth, dark),
    });
    if (parentNode) {
      graph.insertEdge({
        parent,
        id: nextCellId('e'),
        value: '',
        source: parentNode,
        target: siblingCell,
        style: mindmapEdgeStyle(dark),
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
