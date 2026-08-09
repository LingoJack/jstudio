/**
 * mindmapLayout — 思维导图（topic 节点）的自动布局与专用连线样式。
 *
 * reflowMindmap：生发子节点/兄弟节点后，从根节点开始按"整洁树"算法
 * 重新排布整棵思维导图，保证兄弟子树互不重叠：
 *   - 子树高度 = max(自身高度, 各子节点子树高度之和 + 间距)
 *   - 自底向上测量，自顶向下分配 Y 区间；节点在自身子树区间内垂直居中
 *   - 子节点 X = 父节点右缘 + MINDMAP_GAP_X（同层对齐），根节点保持原位
 *
 * mindmapCurveEdgeStyle：思维导图专用连线——从父节点右缘中点到子节点
 * 左缘中点的三次贝塞尔 S 曲线。做法：对理想贝塞尔采样 5 个中间点，
 * 配合 style.curved=true 由 PolylineShape.paintCurvedLine 平滑渲染，
 * 视觉效果与 XMind/幕布类思维导图一致。
 */

import {
  EdgeStyleRegistry,
  Point,
  type Cell,
  type CellState,
  type Graph,
} from '@maxgraph/core';

import { styleToNodeShape } from './graphModel';

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

/** 父子节点水平间距（图坐标 px）。 */
export const MINDMAP_GAP_X = 60;
/** 兄弟节点垂直间距（图坐标 px）。 */
export const MINDMAP_GAP_Y = 16;

/**
 * 思维导图连线样式名。
 * 注册到 EdgeStyleRegistry（见 registerMindmapEdgeStyle）；
 * 快照中以 routing:'mindmap' 持久化（见 graphSnapshot / graphModel）。
 */
export const MINDMAP_EDGE_STYLE = 'mindmapCurveEdgeStyle';

/* ------------------------------------------------------------------ */
/* 整洁树布局                                                          */
/* ------------------------------------------------------------------ */

/** 判断 cell 是否为思维导图 topic 节点。 */
function isTopicCell(graph: Graph, cell: Cell): boolean {
  return (
    cell.isVertex() &&
    styleToNodeShape(graph.getCurrentCellStyle(cell)) === 'topic'
  );
}

/** 获取 topic 节点的 topic 子节点（按当前 Y 排序，保持用户视觉顺序）。 */
function topicChildren(graph: Graph, cell: Cell): Cell[] {
  const outEdges = graph.getOutgoingEdges(cell, graph.getDefaultParent());
  const children: Cell[] = [];
  for (const edge of outEdges) {
    const target = edge.getTerminal(false);
    if (target && target !== cell && isTopicCell(graph, target)) {
      children.push(target);
    }
  }
  children.sort(
    (a, b) => (a.getGeometry()?.y ?? 0) - (b.getGeometry()?.y ?? 0),
  );
  return children;
}

/** 沿入边向上找到思维导图根节点（无 topic 父节点的 topic 节点）。 */
function findTopicRoot(graph: Graph, cell: Cell): Cell {
  const parent = graph.getDefaultParent();
  let cur = cell;
  const visited = new Set<string>();
  while (!visited.has(cur.getId() ?? '')) {
    visited.add(cur.getId() ?? '');
    const inEdges = graph.getIncomingEdges(cur, parent);
    const src = inEdges
      .map((e) => e.getTerminal(true))
      .find((c): c is Cell => !!c && c !== cur && isTopicCell(graph, c));
    if (!src) break;
    cur = src;
  }
  return cur;
}

/**
 * 重新排布 fromCell 所在的整棵思维导图（非 topic 节点直接忽略）。
 * 根节点保持原位，所有后代按整洁树算法重新定位。
 * 调用方需自行包在 graph.batchUpdate 内（与节点插入合并为一步撤销）。
 */
export function reflowMindmap(graph: Graph, fromCell: Cell): void {
  if (!isTopicCell(graph, fromCell)) return;
  const root = findTopicRoot(graph, fromCell);
  const rootGeo = root.getGeometry();
  if (!rootGeo) return;

  // 自底向上测量子树高度（先占位再递归，防环）。
  const subtreeH = new Map<Cell, number>();
  const childrenCache = new Map<Cell, Cell[]>();
  const measure = (cell: Cell): number => {
    const geo = cell.getGeometry();
    if (!geo) return 0;
    if (subtreeH.has(cell)) return subtreeH.get(cell)!;
    subtreeH.set(cell, geo.height);
    const kids = topicChildren(graph, cell);
    childrenCache.set(cell, kids);
    let h = geo.height;
    if (kids.length > 0) {
      const total =
        kids.reduce((s, k) => s + measure(k), 0) +
        MINDMAP_GAP_Y * (kids.length - 1);
      h = Math.max(h, total);
    }
    subtreeH.set(cell, h);
    return h;
  };
  measure(root);

  // 自顶向下分配位置：节点在自身子树区间内垂直居中，子节点依次排开。
  const updates: Array<{ cell: Cell; x: number; y: number }> = [];
  const assign = (cell: Cell, x: number, top: number): void => {
    const geo = cell.getGeometry();
    const h = subtreeH.get(cell);
    if (!geo || h === undefined) return;
    updates.push({ cell, x, y: top + (h - geo.height) / 2 });
    const kids = childrenCache.get(cell) ?? [];
    if (kids.length === 0) return;
    const childX = x + geo.width + MINDMAP_GAP_X;
    const kidsH =
      kids.reduce((s, k) => s + (subtreeH.get(k) ?? 0), 0) +
      MINDMAP_GAP_Y * (kids.length - 1);
    let cursor = top + (h - kidsH) / 2;
    for (const kid of kids) {
      assign(kid, childX, cursor);
      cursor += (subtreeH.get(kid) ?? 0) + MINDMAP_GAP_Y;
    }
  };
  // 根节点中心 Y 固定（子树向上下两侧对称展开）。
  const rootH = subtreeH.get(root) ?? rootGeo.height;
  assign(root, rootGeo.x, rootGeo.y + rootGeo.height / 2 - rootH / 2);

  // 应用新位置（跳过未变化的，避免产生空撤销步）。
  const model = graph.getDataModel();
  for (const u of updates) {
    const geo = u.cell.getGeometry();
    if (!geo) continue;
    if (Math.abs(geo.x - u.x) < 0.5 && Math.abs(geo.y - u.y) < 0.5) continue;
    const next = geo.clone();
    next.x = Math.round(u.x);
    next.y = Math.round(u.y);
    model.setGeometry(u.cell, next);
  }
}

/* ------------------------------------------------------------------ */
/* 贝塞尔 S 曲线连线样式                                                */
/* ------------------------------------------------------------------ */

/**
 * 思维导图曲线边路由。
 *
 * 从源节点右缘中点出发、水平进入目标节点左缘中点的三次贝塞尔曲线：
 *   P0 = 源右缘中点, C1 = P0 右移 d, C2 = P3 左移 d, P3 = 目标左缘中点
 * （d = 水平距离的一半，下限 30 图坐标 px，保证紧凑布局下仍有弧度。）
 * 采样 5 个中间点推入 result；配合 style.curved=true 渲染为平滑曲线。
 *
 * 有用户航点 / 缺端点时回退到避障正交路由。
 */
function mindmapCurveEdgeStyle(
  state: CellState,
  source: CellState,
  target: CellState | null,
  points: Point[],
  result: Point[],
): void {
  if (!source || !target || (points && points.length > 0)) {
    const fallback = EdgeStyleRegistry.get('obstacleEdgeStyle');
    if (fallback) fallback(state, source, target, points, result);
    return;
  }

  // state 坐标均为缩放坐标，result 中的点也用缩放坐标。
  const sx = source.x + source.width;
  const sy = source.y + source.height / 2;
  const tx = target.x;
  const ty = target.y + target.height / 2;
  const dx = tx - sx;
  const dir = dx >= 0 ? 1 : -1;
  const d = Math.max(Math.abs(dx) / 2, 30 * state.view.scale);

  const c1x = sx + dir * d;
  const c2x = tx - dir * d;

  // 三次贝塞尔采样（两端点由 updatePoints 自动推入，这里只推中间点）。
  const SAMPLES = [0.15, 0.325, 0.5, 0.675, 0.85];
  for (const t of SAMPLES) {
    const mt = 1 - t;
    const bx =
      mt * mt * mt * sx + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * tx;
    const by =
      mt * mt * mt * sy + 3 * mt * mt * t * sy + 3 * mt * t * t * ty + t * t * t * ty;
    result.push(new Point(bx, by));
  }
}

/** 注册思维导图曲线边样式。在图初始化时调用一次。 */
export function registerMindmapEdgeStyle(): void {
  EdgeStyleRegistry.add(MINDMAP_EDGE_STYLE, mindmapCurveEdgeStyle, {
    handlerKind: 'default',
    isOrthogonal: false,
  });
}
