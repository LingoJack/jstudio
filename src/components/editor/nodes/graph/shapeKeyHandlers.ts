/**
 * Tab/Enter 在选中 shape 上的行为按类别分派。
 *
 * 两类行为本质不同，按 shape 类别路由：
 *   - topic（思维导图）：Tab 生发子节点 / Enter（非编辑态）生发兄弟节点；
 *     编辑态 Enter 穿透为换行，提交文字用 Cmd/Ctrl+Enter
 *   - 其它 vertex：Tab 循环选中下一个 / Enter 进入文字编辑（普通画板交互）
 *
 * 纯函数模块，不依赖 React，便于独立测试。
 */

import type { Graph, Cell } from '@maxgraph/core';

import { styleToNodeShape } from './graphModel';
import { spawnMindmapChild, spawnMindmapSibling } from './mindmapSpawn';
import type { MindmapScheme } from './graphTheme';

/**
 * 根据当前选中 shape 的类别分派 Tab/Enter 行为。
 *
 * 返回 true 表示已处理（调用方应 preventDefault）；false 表示未命中
 * 处理逻辑（如未选中、多选、选中 edge），调用方应放任默认行为。
 */
export function handleShapeTabEnter(
  graph: Graph,
  key: 'Tab' | 'Enter',
  shiftKey: boolean,
  dark: boolean,
  mindmapScheme: MindmapScheme,
): boolean {
  const sel = graph.getSelectionCells();
  if (sel.length !== 1 || !sel[0].isVertex()) return false;
  const shape = styleToNodeShape(graph.getCurrentCellStyle(sel[0]));

  if (shape === 'topic') {
    return handleMindmapTopic(graph, sel[0], key, shiftKey, dark, mindmapScheme);
  }
  return handlePlainShape(graph, sel[0], key, shiftKey);
}

/* ------------------------- mindmap 策略 ------------------------- */

/**
 * 思维导图 topic 节点的 Tab/Enter 行为：
 *   - Tab / Shift+Tab：在右侧 / 左侧生发子节点（编辑中先提交再生发）
 *   - Enter（非编辑态）：生发同级兄弟节点
 *   - Enter（编辑态）：不拦截，交给 CellEditor 原生插入换行
 *
 * 编辑文本时提交统一用 Cmd/Ctrl+Enter（见 useGraphKeyboard 的 window 捕获逻辑）；
 * 提交后再按 Enter（非编辑态）才生发兄弟节点，符合文本编辑器直觉。
 */
function handleMindmapTopic(
  graph: Graph,
  cell: Cell,
  key: 'Tab' | 'Enter',
  shiftKey: boolean,
  dark: boolean,
  scheme: MindmapScheme,
): boolean {
  // 正在编辑文本时，Enter 不拦截，交给 CellEditor 原生插入换行。
  // 用户需先 Cmd/Ctrl+Enter 提交文字（或点击外部 / Esc 取消），
  // 再按 Enter（非编辑态）才生发兄弟节点。
  if (key === 'Enter' && graph.isEditing()) {
    return false;
  }
  if (graph.isEditing()) {
    graph.stopEditing(false);
  }
  if (key === 'Tab') {
    spawnMindmapChild(graph, cell, dark, shiftKey ? 'left' : 'right', scheme);
  } else {
    spawnMindmapSibling(graph, cell, dark, scheme);
  }
  return true;
}

/* ------------------------- 普通形状策略 ------------------------- */

/**
 * 普通形状（非 topic）的 Tab/Enter 行为：
 *   - Tab / Shift+Tab：在顶层 vertex 列表中循环选中下一个 / 上一个
 *   - Enter：进入文字编辑（若该 cell 可编辑）
 *
 * 编辑态下 Enter 不拦截，交给 CellEditor 原生处理；
 * 提交统一用 Cmd/Ctrl+Enter（见 useGraphKeyboard 的 window 捕获逻辑）。
 */
function handlePlainShape(
  graph: Graph,
  cell: Cell,
  key: 'Tab' | 'Enter',
  shiftKey: boolean,
): boolean {
  if (key === 'Enter') {
    if (graph.isEditing()) return false;
    if (!graph.isCellEditable(cell)) return false;
    graph.startEditingAtCell(cell);
    return true;
  }
  cycleVertexSelection(graph, cell, shiftKey ? 'prev' : 'next');
  return true;
}

/**
 * 在画布所有顶层 vertex 间循环选中。
 *
 * 顺序：maxGraph 模型插入顺序（getChildVertices 返回顺序）。
 * 包裹式循环（到末尾回到首个，到首个回到末尾）。
 * 当前选中不在顶层列表时（嵌套或异常），从首个重新开始。
 */
function cycleVertexSelection(
  graph: Graph,
  current: Cell,
  dir: 'next' | 'prev',
): void {
  const vertices = graph.getChildVertices(graph.getDefaultParent());
  if (vertices.length === 0) return;
  const idx = vertices.indexOf(current);
  if (idx === -1) {
    graph.setSelectionCell(vertices[0]);
    return;
  }
  const len = vertices.length;
  const nextIdx = dir === 'next' ? (idx + 1) % len : (idx - 1 + len) % len;
  graph.setSelectionCell(vertices[nextIdx]);
}
