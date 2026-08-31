/**
 * 避障正交边路由器 (Obstacle-Avoiding Orthogonal Edge Router)
 *
 * maxGraph 内置的 OrthogonalConnector 是局部路由器：只看源/目标节点位置，
 * 不考虑画布上的其他节点，因此连线会从已有图形上穿过。
 *
 * 本模块实现混合式避障路由：
 * 1. 先运行内置 OrthogonalConnector 获取基础路由（处理 jetty/端口约束等）
 * 2. 检查基础路由是否穿过任何障碍物
 * 3. 若未穿过 -> 直接使用内置结果（大多数边走这条路径，零额外开销）
 * 4. 若穿过 -> 运行 A* 网格寻路计算避障路径
 * 5. A* 失败 -> 回退到内置结果
 */

import { Point, EdgeStyleRegistry, type CellState } from '@maxgraph/core';

// ─── 配置常量 ──────────────────────────────────────────────

/** A* 网格分辨率（模型单位/格） */
const GRID_STEP = 20;

/** 障碍物外扩余量（模型单位）——A* 路径与图形保持的最小间距 */
const OBSTACLE_MARGIN = 12;

/** Jetty 偏移量（模型单位）——连接点沿出口方向延伸的距离，需 > OBSTACLE_MARGIN */
const JETTY_SIZE = 20;

/** 同侧连接（如左->左、上->上）的 jetty 偏移量。
 *  内置正交路由器默认 buffer 仅 10px，同侧 U 形拐弯的平行段几乎贴着节点边框；
 *  加大同侧 jetty 让 A* 路径有充足间距绕开端点节点。 */
const JETTY_SIZE_SAME_SIDE = 30;

/** A* 转弯惩罚（格）——值越大路径越直，但可能绕远 */
const TURN_PENALTY = 6;

/** 网格最大单元数，超出则回退到内置路由器，防止极端情况下的性能问题 */
const MAX_GRID_CELLS = 60000;

// ─── 类型定义 ──────────────────────────────────────────────

type Dir = 'N' | 'S' | 'E' | 'W' | null;

interface ModelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ModelPoint {
  x: number;
  y: number;
}

// ─── 工具函数 ──────────────────────────────────────────────

/**
 * 判断连接点在节点哪条边上，确定边的出口/入口方向。
 * 逻辑与 maxGraph OrthogonalConnector 一致，容差 1 模型单位。
 * 水平方向优先（大多数图水平连线居多）。
 */
function getExitDirection(pt: ModelPoint, cellState: CellState, scale: number): Dir {
  const gx = cellState.x / scale;
  const gy = cellState.y / scale;
  const gw = cellState.width / scale;
  const gh = cellState.height / scale;

  if (Math.abs(pt.x - gx) <= 1) return 'W';
  if (Math.abs(pt.x - (gx + gw)) <= 1) return 'E';
  if (Math.abs(pt.y - gy) <= 1) return 'N';
  if (Math.abs(pt.y - (gy + gh)) <= 1) return 'S';
  return null;
}

/** 沿指定方向偏移一个点 */
function offsetPoint(pt: ModelPoint, dir: Dir, dist: number): ModelPoint {
  switch (dir) {
    case 'W': return { x: pt.x - dist, y: pt.y };
    case 'E': return { x: pt.x + dist, y: pt.y };
    case 'N': return { x: pt.x, y: pt.y - dist };
    case 'S': return { x: pt.x, y: pt.y + dist };
    default: return { x: pt.x, y: pt.y };
  }
}

/** 节点中心（模型坐标） */
function centerOfState(cellState: CellState, scale: number): ModelPoint {
  return {
    x: (cellState.x + cellState.width / 2) / scale,
    y: (cellState.y + cellState.height / 2) / scale,
  };
}

/** 从节点中心朝 toward 方向的射线与包围盒的交点（模型坐标），保底返回中心 */
function perimeterPointToward(
  cellState: CellState,
  toward: ModelPoint,
  scale: number,
): ModelPoint {
  const c = centerOfState(cellState, scale);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = cellState.width / 2 / scale;
  const hh = cellState.height / 2 / scale;
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/**
 * 收集障碍物：画布上所有顶点（排除当前边的源/目标）。
 * 返回的是原始包围盒（未外扩），外扩在 A* 内部按 OBSTACLE_MARGIN 处理。
 */
function collectObstacles(
  state: CellState,
  sourceCell: unknown,
  targetCell: unknown,
  scale: number,
): ModelRect[] {
  const graph = state.view.graph;
  const vertices = graph.getChildVertices();
  const obstacles: ModelRect[] = [];

  for (const cell of vertices) {
    if (cell === sourceCell || cell === targetCell) continue;
    const cs = state.view.getState(cell as never);
    if (!cs || cs.width <= 0 || cs.height <= 0) continue;
    obstacles.push({
      x: cs.x / scale,
      y: cs.y / scale,
      w: cs.width / scale,
      h: cs.height / scale,
    });
  }

  return obstacles;
}

/**
 * 检测正交线段是否与矩形相交。
 * 线段为水平 (y1===y2) 或垂直 (x1===x2)，使用严格不等式避免擦边误判。
 */
function segmentIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  rx: number, ry: number, rw: number, rh: number,
): boolean {
  if (x1 === x2) {
    // 垂直线段
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return x1 > rx && x1 < rx + rw && maxY > ry && minY < ry + rh;
  }
  // 水平线段
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  return y1 > ry && y1 < ry + rh && maxX > rx && minX < rx + rw;
}

/**
 * 检查内置路由结果是否穿过任何障碍物。
 * result 中的点为缩放坐标，需除以 scale 转模型坐标后与障碍物比较。
 */
function routeIntersectsObstacles(
  route: Point[],
  obstacles: ModelRect[],
  scale: number,
): boolean {
  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];
    if (!p1 || !p2) continue;
    const x1 = p1.x / scale, y1 = p1.y / scale;
    const x2 = p2.x / scale, y2 = p2.y / scale;
    for (const obs of obstacles) {
      if (segmentIntersectsRect(x1, y1, x2, y2, obs.x, obs.y, obs.w, obs.h)) {
        return true;
      }
    }
  }
  return false;
}

// ─── 二叉堆优先队列 ────────────────────────────────────────

/** 最小二叉堆，用于 A* open set。键为 f-score，值为节点索引。 */
class MinHeap {
  private keys: number[] = [];
  private values: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, value: number): void {
    this.keys.push(key);
    this.values.push(value);
    this.bubbleUp(this.keys.length - 1);
  }

  pop(): { key: number; value: number } | null {
    if (this.keys.length === 0) return null;
    const result = { key: this.keys[0], value: this.values[0] };
    const lastIdx = this.keys.length - 1;
    this.keys[0] = this.keys[lastIdx];
    this.values[0] = this.values[lastIdx];
    this.keys.pop();
    this.values.pop();
    if (this.keys.length > 0) this.sinkDown(0);
    return result;
  }

  private bubbleUp(idx: number): void {
    const key = this.keys[idx];
    const value = this.values[idx];
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.keys[parent] <= key) break;
      this.keys[idx] = this.keys[parent];
      this.values[idx] = this.values[parent];
      idx = parent;
    }
    this.keys[idx] = key;
    this.values[idx] = value;
  }

  private sinkDown(idx: number): void {
    const key = this.keys[idx];
    const value = this.values[idx];
    const n = this.keys.length;
    let child = idx * 2 + 1;
    while (child < n) {
      if (child + 1 < n && this.keys[child + 1] < this.keys[child]) child++;
      if (key <= this.keys[child]) break;
      this.keys[idx] = this.keys[child];
      this.values[idx] = this.values[child];
      idx = child;
      child = idx * 2 + 1;
    }
    this.keys[idx] = key;
    this.values[idx] = value;
  }
}

// ─── A* 网格寻路 ───────────────────────────────────────────

/**
 * A* 正交避障寻路。
 *
 * @param start  起点（模型坐标）
 * @param end    终点（模型坐标）
 * @param obstacles 障碍物列表（原始包围盒，内部按 OBSTACLE_MARGIN 外扩）
 * @returns 简化后的路径点数组（模型坐标），或 null（无路径/网格过大）
 */
function aStarRoute(
  start: ModelPoint,
  end: ModelPoint,
  obstacles: ModelRect[],
): ModelPoint[] | null {
  // 外扩障碍物
  const expanded: ModelRect[] = obstacles.map((o) => ({
    x: o.x - OBSTACLE_MARGIN,
    y: o.y - OBSTACLE_MARGIN,
    w: o.w + 2 * OBSTACLE_MARGIN,
    h: o.h + 2 * OBSTACLE_MARGIN,
  }));

  // 计算网格边界：起点 + 终点 + 所有障碍物的包围盒 + padding
  let minX = Math.min(start.x, end.x);
  let maxX = Math.max(start.x, end.x);
  let minY = Math.min(start.y, end.y);
  let maxY = Math.max(start.y, end.y);
  for (const o of expanded) {
    minX = Math.min(minX, o.x);
    maxX = Math.max(maxX, o.x + o.w);
    minY = Math.min(minY, o.y);
    maxY = Math.max(maxY, o.y + o.h);
  }
  minX -= GRID_STEP;
  minY -= GRID_STEP;
  maxX += GRID_STEP;
  maxY += GRID_STEP;

  // 将起点/终点对齐到网格
  const startGX = Math.round((start.x - minX) / GRID_STEP);
  const startGY = Math.round((start.y - minY) / GRID_STEP);
  const endGX = Math.round((end.x - minX) / GRID_STEP);
  const endGY = Math.round((end.y - minY) / GRID_STEP);

  const gridW = Math.ceil((maxX - minX) / GRID_STEP) + 1;
  const gridH = Math.ceil((maxY - minY) / GRID_STEP) + 1;

  if (gridW <= 0 || gridH <= 0) return null;
  if (gridW * gridH > MAX_GRID_CELLS) return null;

  // 构建阻塞网格：网格点中心落在任意外扩障碍物内 -> 阻塞
  const cellCount = gridW * gridH;
  const blocked = new Uint8Array(cellCount);
  for (let gy = 0; gy < gridH; gy++) {
    const wy = minY + gy * GRID_STEP;
    for (let gx = 0; gx < gridW; gx++) {
      const wx = minX + gx * GRID_STEP;
      for (const o of expanded) {
        if (wx >= o.x && wx <= o.x + o.w && wy >= o.y && wy <= o.y + o.h) {
          blocked[gy * gridW + gx] = 1;
          break;
        }
      }
    }
  }

  // 起止格强制解锁（即使落在障碍物扩展区内也允许出发/到达）
  const startIdx = startGY * gridW + startGX;
  const endIdx = endGY * gridW + endGX;
  blocked[startIdx] = 0;
  blocked[endIdx] = 0;

  if (startIdx === endIdx) {
    return [{ x: minX + startGX * GRID_STEP, y: minY + startGY * GRID_STEP }];
  }

  // A* 搜索
  const NO_NODE = -1;
  const NO_DIR = -1;
  const gScore = new Float32Array(cellCount).fill(Infinity);
  const parent = new Int32Array(cellCount).fill(NO_NODE);
  const cameFromDir = new Int8Array(cellCount).fill(NO_DIR); // 0=N 1=S 2=W 3=E
  const closed = new Uint8Array(cellCount);

  // 方向量：[dx, dy, dirId]
  const DIRS = [
    [0, -1, 0], // N
    [0, 1, 1],  // S
    [-1, 0, 2], // W
    [1, 0, 3],  // E
  ] as const;

  const manhattan = (x1: number, y1: number, x2: number, y2: number) =>
    Math.abs(x1 - x2) + Math.abs(y1 - y2);

  gScore[startIdx] = 0;
  const heap = new MinHeap();
  heap.push(manhattan(startGX, startGY, endGX, endGY), startIdx);

  while (heap.size > 0) {
    const popped = heap.pop()!;
    const current = popped.value;

    if (current === endIdx) {
      // 回溯路径
      const gridPath: Array<[number, number]> = [];
      let node = current;
      while (node !== NO_NODE) {
        gridPath.push([node % gridW, Math.floor(node / gridW)]);
        node = parent[node];
      }
      gridPath.reverse();

      // 简化路径：移除共线中间点
      return simplifyGridPath(gridPath, minX, minY);
    }

    if (closed[current]) continue;
    closed[current] = 1;

    const cgx = current % gridW;
    const cgy = Math.floor(current / gridW);
    const currentDir = cameFromDir[current];

    for (const [dx, dy, dirId] of DIRS) {
      const ngx = cgx + dx;
      const ngy = cgy + dy;
      if (ngx < 0 || ngx >= gridW || ngy < 0 || ngy >= gridH) continue;
      const nIdx = ngy * gridW + ngx;
      if (blocked[nIdx] || closed[nIdx]) continue;

      // 转弯惩罚：方向变化时增加额外成本
      const turnCost = currentDir !== NO_DIR && currentDir !== dirId ? TURN_PENALTY : 0;
      const tentativeG = gScore[current] + 1 + turnCost;

      if (tentativeG < gScore[nIdx]) {
        parent[nIdx] = current;
        cameFromDir[nIdx] = dirId;
        gScore[nIdx] = tentativeG;
        const f = tentativeG + manhattan(ngx, ngy, endGX, endGY);
        heap.push(f, nIdx);
      }
    }
  }

  return null; // 无路径
}

/** 将网格路径简化为拐点列表（移除共线中间点），并转为模型坐标 */
function simplifyGridPath(
  gridPath: Array<[number, number]>,
  minX: number,
  minY: number,
): ModelPoint[] {
  if (gridPath.length <= 2) {
    return gridPath.map(([gx, gy]) => ({
      x: minX + gx * GRID_STEP,
      y: minY + gy * GRID_STEP,
    }));
  }

  const result: ModelPoint[] = [{
    x: minX + gridPath[0][0] * GRID_STEP,
    y: minY + gridPath[0][1] * GRID_STEP,
  }];

  for (let i = 1; i < gridPath.length - 1; i++) {
    const [px, py] = gridPath[i - 1];
    const [cx, cy] = gridPath[i];
    const [nx, ny] = gridPath[i + 1];
    // 方向变化时保留该点
    if (cx - px !== nx - cx || cy - py !== ny - cy) {
      result.push({ x: minX + cx * GRID_STEP, y: minY + cy * GRID_STEP });
    }
  }

  const [lx, ly] = gridPath[gridPath.length - 1];
  result.push({ x: minX + lx * GRID_STEP, y: minY + ly * GRID_STEP });
  return result;
}

/**
 * 将 A* 路径首尾对齐到精确 jetty 坐标，消除网格取整导致的对角线歪斜。
 *
 * A* 的起点/终点经过 `Math.round` 对齐到 GRID_STEP 网格，非 jetty 轴
 * （W/E 方向时为 Y 轴，N/S 方向时为 X 轴）可能偏移多达 GRID_STEP/2，
 * 使连接点到首个路径点之间出现可见的斜线。
 *
 * 本函数将首尾替换为精确坐标；若替换后首段/末段出现对角线
 * （两点 X、Y 均不同），则插入一个 L 形拐点恢复正交。
 */
function snapPathEndpoints(
  path: ModelPoint[],
  start: ModelPoint,
  end: ModelPoint,
  startDir: Dir,
  endDir: Dir,
): void {
  if (path.length === 0) return;

  // 单点路径：start/end 落在同一格，直接用精确坐标替换
  if (path.length === 1) {
    path[0] = { ...start };
    if (start.x !== end.x || start.y !== end.y) {
      path.push({ ...end });
      if (start.x !== end.x && start.y !== end.y) {
        const isH = startDir === 'W' || startDir === 'E';
        path.splice(1, 0, isH
          ? { x: end.x, y: start.y }
          : { x: start.x, y: end.y });
      }
    }
    return;
  }

  // --- 对齐起点 ---
  path[0] = { ...start };
  {
    const p1 = path[0];
    const p2 = path[1];
    if (p1.x !== p2.x && p1.y !== p2.y) {
      // 对角线 -> 插入 L 形拐点
      // W/E（水平 jetty）：先水平（保持 Y），再垂直
      // N/S（垂直 jetty）：先垂直（保持 X），再水平
      const isH = startDir === 'W' || startDir === 'E';
      path.splice(1, 0, isH
        ? { x: p2.x, y: p1.y }
        : { x: p1.x, y: p2.y });
    }
  }

  // --- 对齐终点 ---
  const lastIdx = path.length - 1;
  path[lastIdx] = { ...end };
  {
    const pn1 = path[lastIdx];
    const pn2 = path[lastIdx - 1];
    if (pn1.x !== pn2.x && pn1.y !== pn2.y) {
      // W/E：先垂直（保持 X=pn2.x），再水平
      // N/S：先水平（保持 Y=pn2.y），再垂直
      const isH = endDir === 'W' || endDir === 'E';
      path.splice(lastIdx, 0, isH
        ? { x: pn2.x, y: pn1.y }
        : { x: pn1.x, y: pn2.y });
    }
  }
}

// ─── 边路由函数 ────────────────────────────────────────────

/**
 * 避障正交边路由函数。
 *
 * 流程：
 * 1. 运行内置 OrthogonalConnector 获取基础路由
 * 2. 若有手动航点 / 边到边连接 / 无目标 -> 直接返回内置结果
 * 3. 收集障碍物（排除源/目标）
 * 4. 获取连接点，确定出口/入口方向
 * 5. 检测同侧连接（如左->左）：同侧时强制 A* 重路由 + 加大 jetty
 * 6. 非同侧：仅在内置路由穿过障碍物时才 A* 重路由
 * 7. 计算 jetty 点（同侧使用更大偏移）
 * 8. A* 寻路 + 首尾对齐到精确 jetty 坐标（消除网格取整歪斜）
 * 9. A* 失败 -> 保留内置结果
 *
 * 坐标系：state/source/target 中的坐标均为缩放坐标（屏幕像素），
 * 除以 state.view.scale 得到模型坐标。A* 在模型坐标中运算，
 * 结果乘以 scale 推入 result。
 */
export function obstacleAvoidingOrthogonalStyle(
  state: CellState,
  source: CellState,
  target: CellState | null,
  points: Point[],
  result: Point[],
): void {
  const scale = state.view.scale;
  if (scale <= 0) return;

  // 获取内置正交路由器
  const orthConnector = EdgeStyleRegistry.get('orthogonalEdgeStyle');
  if (!orthConnector) return;

  // 1. 运行内置路由器（处理 jetty、端口约束、连接点选择等）
  orthConnector(state, source, target, points, result);

  // 2. 回退条件：手动航点 / 边到边 / 无目标 -> 尊重内置结果
  if (points && points.length > 0) return;
  if (source?.cell?.isEdge?.()) return;
  if (target?.cell?.isEdge?.()) return;
  if (!target) return;

  // 3. 收集障碍物（排除源/目标节点本身）
  const sourceCell = source.cell;
  const targetCell = target.cell;
  const obstacles = collectObstacles(state, sourceCell, targetCell, scale);

  // 4. 获取连接点（模型坐标）。
  //    首渲染时 GraphView.updateEdgeState 的调用顺序为
  //    updateFixedTerminalPoints -> updatePoints(调 edgeStyle) -> updateFloatingTerminalPoints，
  //    style 函数执行时 state.absolutePoints 对新边为空。因此分级推导：
  //    absolutePoints -> result[0]/exit 端口约束 -> perimeter 点 -> 中心点。
  const absPts = state.absolutePoints;
  const absFirst = absPts && absPts.length >= 2 ? absPts[0] : undefined;
  const absLast = absPts && absPts.length >= 2 ? absPts[absPts.length - 1] : undefined;

  let p0: ModelPoint;
  let pe: ModelPoint;
  if (absFirst && absLast) {
    p0 = { x: absFirst.x / scale, y: absFirst.y / scale };
    pe = { x: absLast.x / scale, y: absLast.y / scale };
  } else {
    const st = state.style as unknown as {
      exitX?: number;
      exitY?: number;
      entryX?: number;
      entryY?: number;
    };
    // p0：updatePoints 在调 style 前已把源点推入 result[0]
    const r0 = result[0];
    if (r0) {
      p0 = { x: r0.x / scale, y: r0.y / scale };
    } else if (typeof st.exitX === 'number' && typeof st.exitY === 'number') {
      p0 = {
        x: (source.x + st.exitX * source.width) / scale,
        y: (source.y + st.exitY * source.height) / scale,
      };
    } else {
      p0 = perimeterPointToward(source, centerOfState(target, scale), scale);
    }
    // pe：entry 端口约束 -> 朝 p0 的 perimeter 点 -> 中心点
    if (typeof st.entryX === 'number' && typeof st.entryY === 'number') {
      pe = {
        x: (target.x + st.entryX * target.width) / scale,
        y: (target.y + st.entryY * target.height) / scale,
      };
    } else {
      pe = perimeterPointToward(target, p0, scale);
    }
  }

  // 5. 确定出口/入口方向
  const startDir = getExitDirection(p0, source, scale);
  const endDir = getExitDirection(pe, target, scale);

  // 同侧连接（如左->左、右->右、上->上、下->下）：
  // 内置正交路由器的 U 形拐弯偏移很小（默认 buffer=10），当两端节点紧挨时，
  // 中间平行段几乎贴着端点节点边框，视觉局促。对同侧连接强制 A* 重路由 + 加大 jetty。
  const isSameSide = startDir !== null && startDir === endDir;

  // 6. 检查是否需要 A* 重路由
  //    非同侧：仅在内置路由穿过障碍物时才重算
  //    同侧：总是重算（内置路由即便不穿障碍物也会贴着端点节点）
  if (!isSameSide) {
    if (obstacles.length === 0) return; // 无障碍物，内置路由已足够
    if (!routeIntersectsObstacles(result, obstacles, scale)) return; // 路由干净，无需重算
  }

  // 7. 计算 jetty 点（同侧连接使用更大偏移，确保平行段与节点边框有充足间距）
  const jettySize = isSameSide ? JETTY_SIZE_SAME_SIDE : JETTY_SIZE;
  const jettyStart = offsetPoint(p0, startDir, jettySize);
  const jettyEnd = offsetPoint(pe, endDir, jettySize);

  // 8. 将源/目标也作为障碍物（防止 A* 路径穿过自身端点）
  const allObstacles: ModelRect[] = [...obstacles];
  allObstacles.push({
    x: source.x / scale, y: source.y / scale,
    w: source.width / scale, h: source.height / scale,
  });
  allObstacles.push({
    x: target.x / scale, y: target.y / scale,
    w: target.width / scale, h: target.height / scale,
  });

  // 9. 运行 A* 寻路
  const path = aStarRoute(jettyStart, jettyEnd, allObstacles);
  if (!path || path.length === 0) return; // A* 失败，保留内置结果

  // 将 A* 路径首尾对齐到精确 jetty 坐标，消除网格取整导致的对角线歪斜
  snapPathEndpoints(path, jettyStart, jettyEnd, startDir, endDir);

  // 10. 替换 result 中的中间路径点
  //    result[0] = 源连接点（由 updatePoints 推入，必须保留）
  //    之后推入 A* 路径点（jettyStart -> ... -> jettyEnd）
  //    目标连接点由 updatePoints 在调用结束后自动追加
  result.splice(1); // 移除 result[1:] 的所有内置路由点
  for (const p of path) {
    result.push(
      new Point(
        Math.round(p.x * scale * 10) / 10,
        Math.round(p.y * scale * 10) / 10,
      ),
    );
  }
}

// ─── 注册函数 ──────────────────────────────────────────────

/** 注册避障正交边路由样式。在图初始化时调用一次。 */
export function registerObstacleEdgeStyle(): void {
  EdgeStyleRegistry.add('obstacleEdgeStyle', obstacleAvoidingOrthogonalStyle, {
    handlerKind: 'segment', // 同 orthogonalEdgeStyle，支持拖拽航点
    isOrthogonal: true,
  });
}

