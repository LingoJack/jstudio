/**
 * Mindmap spawn functions - create child / sibling nodes with auto-layout.
 *
 * Extracted from GraphCanvas.tsx. These functions operate on a maxGraph
 * instance but have no React dependencies, making them easy to test
 * independently.
 */

import type { Graph, Cell } from '@maxgraph/core';
import { DEFAULT_SIZE, styleForShape } from './graphCanvasStyle';
import { MINDMAP_GAP_X, MINDMAP_GAP_Y, reflowMindmap } from './mindmapLayout';
import { mindmapEdgeStyle, nextCellId } from './graphHelpers';

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

  graph.batchUpdate(() => {
    const childCell = graph.insertVertex({
      parent,
      id: nextCellId('n'),
      value: '子主题',
      position: [newX, newY],
      size: [size.w, size.h],
      style: styleForShape('topic', dark),
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

  graph.batchUpdate(() => {
    const siblingCell = graph.insertVertex({
      parent,
      id: nextCellId('n'),
      value: '分支主题',
      position: [newX, newY],
      size: [size.w, size.h],
      style: styleForShape('topic', dark),
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
