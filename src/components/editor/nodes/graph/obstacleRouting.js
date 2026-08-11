import { Point, EdgeStyleRegistry } from "@maxgraph/core";
const GRID_STEP = 20;
const OBSTACLE_MARGIN = 12;
const JETTY_SIZE = 20;
const JETTY_SIZE_SAME_SIDE = 30;
const TURN_PENALTY = 6;
const MAX_GRID_CELLS = 6e4;
function getExitDirection(pt, cellState, scale) {
  const gx = cellState.x / scale;
  const gy = cellState.y / scale;
  const gw = cellState.width / scale;
  const gh = cellState.height / scale;
  if (Math.abs(pt.x - gx) <= 1) return "W";
  if (Math.abs(pt.x - (gx + gw)) <= 1) return "E";
  if (Math.abs(pt.y - gy) <= 1) return "N";
  if (Math.abs(pt.y - (gy + gh)) <= 1) return "S";
  return null;
}
function offsetPoint(pt, dir, dist) {
  switch (dir) {
    case "W":
      return { x: pt.x - dist, y: pt.y };
    case "E":
      return { x: pt.x + dist, y: pt.y };
    case "N":
      return { x: pt.x, y: pt.y - dist };
    case "S":
      return { x: pt.x, y: pt.y + dist };
    default:
      return { x: pt.x, y: pt.y };
  }
}
function centerOfState(cellState, scale) {
  return {
    x: (cellState.x + cellState.width / 2) / scale,
    y: (cellState.y + cellState.height / 2) / scale
  };
}
function perimeterPointToward(cellState, toward, scale) {
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
function collectObstacles(state, sourceCell, targetCell, scale) {
  const graph = state.view.graph;
  const vertices = graph.getChildVertices();
  const obstacles = [];
  for (const cell of vertices) {
    if (cell === sourceCell || cell === targetCell) continue;
    const cs = state.view.getState(cell);
    if (!cs || cs.width <= 0 || cs.height <= 0) continue;
    obstacles.push({
      x: cs.x / scale,
      y: cs.y / scale,
      w: cs.width / scale,
      h: cs.height / scale
    });
  }
  return obstacles;
}
function segmentIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  if (x1 === x2) {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return x1 > rx && x1 < rx + rw && maxY > ry && minY < ry + rh;
  }
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  return y1 > ry && y1 < ry + rh && maxX > rx && minX < rx + rw;
}
function routeIntersectsObstacles(route, obstacles, scale) {
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
class MinHeap {
  keys = [];
  values = [];
  get size() {
    return this.keys.length;
  }
  push(key, value) {
    this.keys.push(key);
    this.values.push(value);
    this.bubbleUp(this.keys.length - 1);
  }
  pop() {
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
  bubbleUp(idx) {
    const key = this.keys[idx];
    const value = this.values[idx];
    while (idx > 0) {
      const parent = idx - 1 >> 1;
      if (this.keys[parent] <= key) break;
      this.keys[idx] = this.keys[parent];
      this.values[idx] = this.values[parent];
      idx = parent;
    }
    this.keys[idx] = key;
    this.values[idx] = value;
  }
  sinkDown(idx) {
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
function aStarRoute(start, end, obstacles) {
  const expanded = obstacles.map((o) => ({
    x: o.x - OBSTACLE_MARGIN,
    y: o.y - OBSTACLE_MARGIN,
    w: o.w + 2 * OBSTACLE_MARGIN,
    h: o.h + 2 * OBSTACLE_MARGIN
  }));
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
  const startGX = Math.round((start.x - minX) / GRID_STEP);
  const startGY = Math.round((start.y - minY) / GRID_STEP);
  const endGX = Math.round((end.x - minX) / GRID_STEP);
  const endGY = Math.round((end.y - minY) / GRID_STEP);
  const gridW = Math.ceil((maxX - minX) / GRID_STEP) + 1;
  const gridH = Math.ceil((maxY - minY) / GRID_STEP) + 1;
  if (gridW <= 0 || gridH <= 0) return null;
  if (gridW * gridH > MAX_GRID_CELLS) return null;
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
  const startIdx = startGY * gridW + startGX;
  const endIdx = endGY * gridW + endGX;
  blocked[startIdx] = 0;
  blocked[endIdx] = 0;
  if (startIdx === endIdx) {
    return [{ x: minX + startGX * GRID_STEP, y: minY + startGY * GRID_STEP }];
  }
  const NO_NODE = -1;
  const NO_DIR = -1;
  const gScore = new Float32Array(cellCount).fill(Infinity);
  const parent = new Int32Array(cellCount).fill(NO_NODE);
  const cameFromDir = new Int8Array(cellCount).fill(NO_DIR);
  const closed = new Uint8Array(cellCount);
  const DIRS = [
    [0, -1, 0],
    // N
    [0, 1, 1],
    // S
    [-1, 0, 2],
    // W
    [1, 0, 3]
    // E
  ];
  const manhattan = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);
  gScore[startIdx] = 0;
  const heap = new MinHeap();
  heap.push(manhattan(startGX, startGY, endGX, endGY), startIdx);
  while (heap.size > 0) {
    const popped = heap.pop();
    const current = popped.value;
    if (current === endIdx) {
      const gridPath = [];
      let node = current;
      while (node !== NO_NODE) {
        gridPath.push([node % gridW, Math.floor(node / gridW)]);
        node = parent[node];
      }
      gridPath.reverse();
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
  return null;
}
function simplifyGridPath(gridPath, minX, minY) {
  if (gridPath.length <= 2) {
    return gridPath.map(([gx, gy]) => ({
      x: minX + gx * GRID_STEP,
      y: minY + gy * GRID_STEP
    }));
  }
  const result = [{
    x: minX + gridPath[0][0] * GRID_STEP,
    y: minY + gridPath[0][1] * GRID_STEP
  }];
  for (let i = 1; i < gridPath.length - 1; i++) {
    const [px, py] = gridPath[i - 1];
    const [cx, cy] = gridPath[i];
    const [nx, ny] = gridPath[i + 1];
    if (cx - px !== nx - cx || cy - py !== ny - cy) {
      result.push({ x: minX + cx * GRID_STEP, y: minY + cy * GRID_STEP });
    }
  }
  const [lx, ly] = gridPath[gridPath.length - 1];
  result.push({ x: minX + lx * GRID_STEP, y: minY + ly * GRID_STEP });
  return result;
}
function snapPathEndpoints(path, start, end, startDir, endDir) {
  if (path.length === 0) return;
  if (path.length === 1) {
    path[0] = { ...start };
    if (start.x !== end.x || start.y !== end.y) {
      path.push({ ...end });
      if (start.x !== end.x && start.y !== end.y) {
        const isH = startDir === "W" || startDir === "E";
        path.splice(1, 0, isH ? { x: end.x, y: start.y } : { x: start.x, y: end.y });
      }
    }
    return;
  }
  path[0] = { ...start };
  {
    const p1 = path[0];
    const p2 = path[1];
    if (p1.x !== p2.x && p1.y !== p2.y) {
      const isH = startDir === "W" || startDir === "E";
      path.splice(1, 0, isH ? { x: p2.x, y: p1.y } : { x: p1.x, y: p2.y });
    }
  }
  const lastIdx = path.length - 1;
  path[lastIdx] = { ...end };
  {
    const pn1 = path[lastIdx];
    const pn2 = path[lastIdx - 1];
    if (pn1.x !== pn2.x && pn1.y !== pn2.y) {
      const isH = endDir === "W" || endDir === "E";
      path.splice(lastIdx, 0, isH ? { x: pn2.x, y: pn1.y } : { x: pn1.x, y: pn2.y });
    }
  }
}
function obstacleAvoidingOrthogonalStyle(state, source, target, points, result) {
  const scale = state.view.scale;
  if (scale <= 0) return;
  const orthConnector = EdgeStyleRegistry.get("orthogonalEdgeStyle");
  if (!orthConnector) return;
  orthConnector(state, source, target, points, result);
  if (points && points.length > 0) return;
  if (source?.cell?.isEdge?.()) return;
  if (target?.cell?.isEdge?.()) return;
  if (!target) return;
  const sourceCell = source.cell;
  const targetCell = target.cell;
  const obstacles = collectObstacles(state, sourceCell, targetCell, scale);
  const absPts = state.absolutePoints;
  const absFirst = absPts && absPts.length >= 2 ? absPts[0] : void 0;
  const absLast = absPts && absPts.length >= 2 ? absPts[absPts.length - 1] : void 0;
  let p0;
  let pe;
  if (absFirst && absLast) {
    p0 = { x: absFirst.x / scale, y: absFirst.y / scale };
    pe = { x: absLast.x / scale, y: absLast.y / scale };
  } else {
    const st = state.style;
    const r0 = result[0];
    if (r0) {
      p0 = { x: r0.x / scale, y: r0.y / scale };
    } else if (typeof st.exitX === "number" && typeof st.exitY === "number") {
      p0 = {
        x: (source.x + st.exitX * source.width) / scale,
        y: (source.y + st.exitY * source.height) / scale
      };
    } else {
      p0 = perimeterPointToward(source, centerOfState(target, scale), scale);
    }
    if (typeof st.entryX === "number" && typeof st.entryY === "number") {
      pe = {
        x: (target.x + st.entryX * target.width) / scale,
        y: (target.y + st.entryY * target.height) / scale
      };
    } else {
      pe = perimeterPointToward(target, p0, scale);
    }
  }
  const startDir = getExitDirection(p0, source, scale);
  const endDir = getExitDirection(pe, target, scale);
  const isSameSide = startDir !== null && startDir === endDir;
  if (!isSameSide) {
    if (obstacles.length === 0) return;
    if (!routeIntersectsObstacles(result, obstacles, scale)) return;
  }
  const jettySize = isSameSide ? JETTY_SIZE_SAME_SIDE : JETTY_SIZE;
  const jettyStart = offsetPoint(p0, startDir, jettySize);
  const jettyEnd = offsetPoint(pe, endDir, jettySize);
  const allObstacles = [...obstacles];
  allObstacles.push({
    x: source.x / scale,
    y: source.y / scale,
    w: source.width / scale,
    h: source.height / scale
  });
  allObstacles.push({
    x: target.x / scale,
    y: target.y / scale,
    w: target.width / scale,
    h: target.height / scale
  });
  const path = aStarRoute(jettyStart, jettyEnd, allObstacles);
  if (!path || path.length === 0) return;
  snapPathEndpoints(path, jettyStart, jettyEnd, startDir, endDir);
  result.splice(1);
  for (const p of path) {
    result.push(
      new Point(
        Math.round(p.x * scale * 10) / 10,
        Math.round(p.y * scale * 10) / 10
      )
    );
  }
}
function registerObstacleEdgeStyle() {
  EdgeStyleRegistry.add("obstacleEdgeStyle", obstacleAvoidingOrthogonalStyle, {
    handlerKind: "segment",
    // 同 orthogonalEdgeStyle，支持拖拽航点
    isOrthogonal: true
  });
}
export {
  obstacleAvoidingOrthogonalStyle,
  registerObstacleEdgeStyle
};
