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
export function findTopicRoot(graph: Graph, cell: Cell): Cell {
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
  * 根节点保持原位，后代按"整洁树"算法重新定位。
  *
  * **左右分栏布局**：根节点的子节点按当前 X 位置分为左右两组，
  * 右侧子树向右展开（X 递增），左侧子树向左展开（X 递减），
  * 两侧各自独立垂直居中于根节点。非根节点的子节点始终跟随父节点所在侧。
  *
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

  type Side = 'right' | 'left';
  const updates: Array<{ cell: Cell; x: number; y: number }> = [];

  /**
   * 递归排布非根节点的子树：节点在自身子树区间内垂直居中，
   * 子节点按 side 方向水平排开。
   */
  const assign = (cell: Cell, x: number, top: number, side: Side): void => {
    const geo = cell.getGeometry();
    const h = subtreeH.get(cell);
    if (!geo || h === undefined) return;
    updates.push({ cell, x, y: top + (h - geo.height) / 2 });
    const kids = childrenCache.get(cell) ?? [];
    if (kids.length === 0) return;
    const kidsH =
      kids.reduce((s, k) => s + (subtreeH.get(k) ?? 0), 0) +
      MINDMAP_GAP_Y * (kids.length - 1);
    let cursor = top + (h - kidsH) / 2;
    for (const kid of kids) {
      const kidGeo = kid.getGeometry();
      const childX =
        side === 'right'
          ? x + geo.width + MINDMAP_GAP_X
          : x - MINDMAP_GAP_X - (kidGeo?.width ?? geo.width);
      assign(kid, childX, cursor, side);
      cursor += (subtreeH.get(kid) ?? 0) + MINDMAP_GAP_Y;
    }
  };

  // 根节点中心 Y（子树向上下两侧对称展开）。
  const rootCenterY = rootGeo.y + rootGeo.height / 2;

  // 根节点的子节点按当前 X 分为左右两组。
  const rootKids = childrenCache.get(root) ?? [];
  const rightKids = rootKids.filter(
    (k) => (k.getGeometry()?.x ?? 0) >= rootGeo.x,
  );
  const leftKids = rootKids.filter(
    (k) => (k.getGeometry()?.x ?? 0) < rootGeo.x,
  );

  // 右侧子树：向右展开，垂直居中于根节点。
  if (rightKids.length > 0) {
    const rightH =
      rightKids.reduce((s, k) => s + (subtreeH.get(k) ?? 0), 0) +
      MINDMAP_GAP_Y * (rightKids.length - 1);
    let cursor = rootCenterY - rightH / 2;
    const childX = rootGeo.x + rootGeo.width + MINDMAP_GAP_X;
    for (const kid of rightKids) {
      assign(kid, childX, cursor, 'right');
      cursor += (subtreeH.get(kid) ?? 0) + MINDMAP_GAP_Y;
    }
  }

  // 左侧子树：向左展开，垂直居中于根节点。
  if (leftKids.length > 0) {
    const leftH =
      leftKids.reduce((s, k) => s + (subtreeH.get(k) ?? 0), 0) +
      MINDMAP_GAP_Y * (leftKids.length - 1);
    let cursor = rootCenterY - leftH / 2;
    for (const kid of leftKids) {
      const kidWidth = kid.getGeometry()?.width ?? rootGeo.width;
      const childX = rootGeo.x - MINDMAP_GAP_X - kidWidth;
      assign(kid, childX, cursor, 'left');
      cursor += (subtreeH.get(kid) ?? 0) + MINDMAP_GAP_Y;
    }
  }

  // 根节点位置不变。
  updates.push({ cell: root, x: rootGeo.x, y: rootGeo.y });

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
 * 根据源/目标节点的相对位置自动选择连线方向：
 *   - 目标在右侧：从源右缘中点 -> 目标左缘中点
 *   - 目标在左侧：从源左缘中点 -> 目标右缘中点
 *
 * 三次贝塞尔 S 曲线，采样 5 个中间点推入 result；配合 style.curved=true 渲染为平滑曲线。
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

  // 判断连线方向：以源/目标中心点 X 坐标比较。
  const sourceCenterX = source.x + source.width / 2;
  const targetCenterX = target.x + target.width / 2;
  const isRight = targetCenterX >= sourceCenterX;

  // state 坐标均为缩放坐标，result 中的点也用缩放坐标。
  const sx = isRight ? source.x + source.width : source.x;
  const sy = source.y + source.height / 2;
  const tx = isRight ? target.x : target.x + target.width;
  const ty = target.y + target.height / 2;
  const dx = tx - sx;
  const dir = dx >= 0 ? 1 : -1;
  const d = Math.max(Math.abs(dx) / 2, 30 * state.view.scale);

  const c1x = sx + dir * d;
  const c2x = tx - dir * d;

  // 三次贝塞尔采样（两端点由 updatePoints 自动推入，这里只推中间点）。
  // 采样点越多曲线越平滑；选中时不会显示为手柄（见 vertexHandlers 的 isHandleVisible 覆盖）。
  const SAMPLES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
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
