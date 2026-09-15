/**
 * graphAutoColor - 画板自动上色（用户触发，先预览再应用）。
 *
 * 规则：对画布上的矩形 / 圆角矩形 / 菱形做图着色——相邻（有连线直连）
 * 的图形不同色（硬约束），同层（连线方向上的同一深度，即流程图的同一级）
 * 的图形也不同色（软约束，色板富余时优先保证）。思维导图 topic（有自己
 * 的配色体系）、时序图生命线 / 活动块、文本 / 注释 / 泳道等其他形状不参与。
 *
 * 算法：Welsh-Powell 贪心着色——按度数从高到低，候选色先排除相邻已用色
 * （硬约束），再排除同层已用色（软约束），最后取全局用量最少的颜色
 * （保证各色分布均衡，不会"清一色第一色"）。色板每次随机洗牌，
 * "换一批"即重新洗牌出新方案。
 *
 * 预览机制：调用方先把着色方案瞬时写入模型，序列化出预览 SVG 后立即
 * 恢复原样式（undo 挂起 + emit 抑制），画布模型零残留；用户点击"应用"
 * 才真正写回（单次 batchUpdate，一步可撤销）。
 */

import type { Cell, CellStyle, Graph } from '@maxgraph/core';
import { fontColorFor } from './graphTheme';

/** 参与自动上色的形状（maxGraph shape 名）。'rectangle' 覆盖矩形与圆角矩形。 */
const AUTO_COLOR_SHAPES = new Set(['rectangle', 'rhombus']);

/** 自动上色色板（浅色 / 暗色各一套，取值均来自 FILL_COLOR_PAIRS 色对，主题切换自动互换）。 */
const AUTO_FILL_COLORS_LIGHT = [
  '#fde68a',
  '#93c5fd',
  '#86efac',
  '#f9a8d4',
  '#f3e8ff',
  '#fed7aa',
];
const AUTO_FILL_COLORS_DARK = [
  '#92400e',
  '#1d4ed8',
  '#15803d',
  '#be185d',
  '#581c87',
  '#7c2d12',
];

/** 判断 cell 是否参与自动上色。 */
function isAutoColorable(cell: Cell): boolean {
  if (!cell.isVertex()) return false;
  const style = cell.getStyle() as CellStyle & Record<string, unknown>;
  if (typeof style.shape !== 'string' || !AUTO_COLOR_SHAPES.has(style.shape)) {
    return false;
  }
  // 思维导图 topic 有独立配色体系（mmScheme/mmDepth），不参与。
  if (style.isTopic) return false;
  return true;
}

/** 收集画布上参与自动上色的 cell（递归含泳道等容器的子级）。 */
export function collectAutoColorCells(graph: Graph): Cell[] {
  const result: Cell[] = [];
  const walk = (parent: Cell) => {
    for (const cell of graph.getChildCells(parent, true, false)) {
      if (isAutoColorable(cell)) result.push(cell);
      walk(cell);
    }
  };
  walk(graph.getDefaultParent());
  return result;
}

/** Fisher-Yates 洗牌（返回新数组）。 */
function shuffled<T>(input: T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 按连线方向计算每个 cell 的层号（流程图的"第几级"）。
 * 最长路径分层（dagre/GraphViz 同款口径）：depth[dst] = max(depth[src] + 1)，
 * 通过多轮松弛逼近，迭代上限为节点数（含环的图不强求收敛，分层结果
 * 只影响配色，不影响正确性）。
 */
function computeLayers(
  cells: Cell[],
  outgoing: Map<Cell, Cell[]>,
): Map<Cell, number> {
  const depth = new Map<Cell, number>();
  for (const cell of cells) depth.set(cell, 0);
  for (let pass = 0; pass < cells.length; pass++) {
    let changed = false;
    for (const [src, dsts] of outgoing) {
      for (const dst of dsts) {
        const next = depth.get(src)! + 1;
        if (next > depth.get(dst)!) {
          depth.set(dst, next);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return depth;
}

/**
 * 生成着色方案：cell → 填充色。
 * 色板每次洗牌，重复调用即"换一批"。候选色按三档取舍：
 *   1. 未被相邻已上色图形占用的颜色（硬约束， adjacency 用尽则放弃该 cell）；
 *   2. 其中再优先取未被同层占用的颜色（同层不同色）；
 *   3. 候选内取全局用量最少的颜色（分布均衡）。
 */
export function assignAutoColors(
  graph: Graph,
  cells: Cell[],
  dark: boolean,
): Map<Cell, string> {
  const palette = shuffled(dark ? AUTO_FILL_COLORS_DARK : AUTO_FILL_COLORS_LIGHT);
  const cellSet = new Set(cells);
  // 邻接表（无向，相邻约束）+ 出边表（有向，分层用）。
  // 只统计 source/target 都是参与上色 cell 的边。
  const adjacency = new Map<Cell, Set<Cell>>();
  const outgoing = new Map<Cell, Cell[]>();
  for (const cell of cells) {
    adjacency.set(cell, new Set());
    outgoing.set(cell, []);
  }
  for (const edge of graph.getAllEdges(cells)) {
    const src = edge.getTerminal(true);
    const dst = edge.getTerminal(false);
    if (!src || !dst || src === dst) continue;
    if (!cellSet.has(src) || !cellSet.has(dst)) continue;
    adjacency.get(src)!.add(dst);
    adjacency.get(dst)!.add(src);
    outgoing.get(src)!.push(dst);
  }
  const layers = computeLayers(cells, outgoing);
  // 度数大的先分配，降低贪心失败概率。
  const ordered = [...cells].sort(
    (a, b) => adjacency.get(b)!.size - adjacency.get(a)!.size,
  );
  const assigned = new Map<Cell, string>();
  const usage = new Map<string, number>();
  for (const cell of ordered) {
    const adjacentColors = new Set<string>();
    for (const neighbor of adjacency.get(cell)!) {
      const color = assigned.get(neighbor);
      if (color) adjacentColors.add(color);
    }
    if (adjacentColors.size >= palette.length) continue; // 硬约束用尽，保持原色
    const layer = layers.get(cell);
    const layerColors = new Set<string>();
    for (const [other, color] of assigned) {
      if (other !== cell && layers.get(other) === layer) layerColors.add(color);
    }
    // 第一档：排除相邻 + 排除同层；色板不够时退到只排除相邻。
    let candidates = palette.filter(
      (c) => !adjacentColors.has(c) && !layerColors.has(c),
    );
    if (candidates.length === 0) {
      candidates = palette.filter((c) => !adjacentColors.has(c));
    }
    // 用量均衡：候选中取全局用得最少的颜色（洗牌序决定并列先后）。
    let best = candidates[0];
    for (const c of candidates) {
      if ((usage.get(c) ?? 0) < (usage.get(best) ?? 0)) best = c;
    }
    assigned.set(cell, best);
    usage.set(best, (usage.get(best) ?? 0) + 1);
  }
  return assigned;
}

/**
 * 把着色方案写入模型（不包裹事务，由调用方决定 batchUpdate / undo 语义）。
 * 字色随填充自适应（浅底深字 / 深底浅字）。
 */
export function applyAutoFillColors(
  graph: Graph,
  assignment: Map<Cell, string>,
  dark: boolean,
): void {
  const model = graph.getDataModel();
  for (const [cell, color] of assignment) {
    model.setStyle(cell, {
      ...cell.getClonedStyle(),
      fillColor: color,
      fontColor: fontColorFor(color, dark),
    });
  }
}

/** 捕获一组 cell 的完整原始样式（用于预览后回滚）。 */
export function captureCellStyles(cells: Cell[]): Map<Cell, CellStyle> {
  const originals = new Map<Cell, CellStyle>();
  for (const cell of cells) originals.set(cell, cell.getClonedStyle());
  return originals;
}

/** 恢复一组 cell 的原始样式（预览回滚）。 */
export function restoreCellStyles(
  graph: Graph,
  originals: Map<Cell, CellStyle>,
): void {
  const model = graph.getDataModel();
  for (const [cell, style] of originals) {
    model.setStyle(cell, style);
  }
}
