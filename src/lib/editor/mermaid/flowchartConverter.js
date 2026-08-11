function mapVertexToShape(vertex) {
  const shape = vertex.shape ?? "";
  if (shape) {
    if (shape === "question" || shape === "hexagon_alt") return "diamond";
    if (shape === "stadium" || shape === "rounded") return "rounded";
    if (shape === "circle" || shape === "doublecircle" || shape === "ellipse") return "ellipse";
    if (shape === "cylinder") return "database";
    if (shape === "hexagon") return "rectangle";
    if (shape === "rect" || shape === "square" || shape === "labelRect") return "rectangle";
  }
  const type = vertex.type ?? "";
  if (type) {
    if (type.includes("diamond") || type.includes("rhombus") || type === "question") return "diamond";
    if (type.includes("round") || type.includes("stadium")) return "rounded";
    if (type.includes("circle") || type.includes("ellipse")) return "ellipse";
    if (type.includes("cylinder") || type.includes("database")) return "database";
  }
  const styles = vertex.styles ?? [];
  if (styles.includes("stadium") || styles.includes("round")) return "rounded";
  if (styles.includes("circle") || styles.includes("ellipse")) return "ellipse";
  if (styles.includes("diamond") || styles.includes("rhombus")) return "diamond";
  if (styles.includes("cylinder") || styles.includes("database")) return "database";
  return "rectangle";
}
const DEFAULT_NODE_SIZE = {
  rectangle: { w: 120, h: 60 },
  rounded: { w: 120, h: 60 },
  ellipse: { w: 120, h: 80 },
  diamond: { w: 80, h: 80 },
  text: { w: 80, h: 30 },
  actor: { w: 50, h: 150 },
  "swimlane-v": { w: 200, h: 300 },
  "swimlane-h": { w: 300, h: 200 },
  lifeline: { w: 100, h: 150 },
  activation: { w: 16, h: 60 },
  note: { w: 100, h: 60 },
  database: { w: 120, h: 80 },
  topic: { w: 100, h: 36 },
  "edge-line": { w: 100, h: 20 },
  "edge-ortho": { w: 100, h: 20 },
  "edge-dashed": { w: 100, h: 20 },
  "edge-no-arrow": { w: 100, h: 20 }
};
const LABEL_FONT_SIZE = 13;
const LINE_HEIGHT = Math.round(LABEL_FONT_SIZE * 1.4);
const ASCII_CHAR_WIDTH = 7;
const MAX_TEXT_WIDTH = 340;
function isWideChar(ch) {
  const code = ch.codePointAt(0) ?? 0;
  return code >= 4352 && code <= 4447 || // Hangul Jamo
  code >= 9312 && code <= 9471 || // 圈号数字 ①②③ 等
  code >= 11904 && code <= 40959 || // CJK 部首 .. CJK 统一表意
  code >= 44032 && code <= 55203 || // Hangul Syllables
  code >= 63744 && code <= 64255 || // CJK 兼容表意
  code >= 65072 && code <= 65135 || // CJK 兼容形式
  code >= 65280 && code <= 65376 || // 全角形式
  code >= 131072 && code <= 195103;
}
function splitLabelLines(label) {
  return label.split(/<br\s*\/?>|\n/gi).map((l) => l.replace(/<[^>]+>/g, "").trim());
}
function estimateLineWidth(line) {
  let w = 0;
  for (const ch of line) {
    w += isWideChar(ch) ? LABEL_FONT_SIZE : ASCII_CHAR_WIDTH;
  }
  return w;
}
function measureLabel(label) {
  const lines = splitLabelLines(label);
  let maxWidth = 0;
  for (const line of lines) {
    maxWidth = Math.max(maxWidth, estimateLineWidth(line));
  }
  return { maxWidth, lineCount: Math.max(lines.length, 1) };
}
function wrapLabel(label, maxTextWidth = MAX_TEXT_WIDTH) {
  const lines = splitLabelLines(label);
  const out = [];
  for (const line of lines) {
    if (estimateLineWidth(line) <= maxTextWidth) {
      out.push(line);
      continue;
    }
    let current = "";
    for (const ch of line) {
      if (current.length > 0 && estimateLineWidth(current + ch) > maxTextWidth) {
        const lastSpace = current.lastIndexOf(" ");
        if (lastSpace > 0 && estimateLineWidth(current.slice(0, lastSpace)) >= maxTextWidth * 0.5) {
          out.push(current.slice(0, lastSpace));
          current = current.slice(lastSpace + 1) + ch;
        } else {
          out.push(current);
          current = ch === " " ? "" : ch;
        }
      } else {
        current += ch;
      }
    }
    if (current) out.push(current);
  }
  return out.join("<br/>");
}
function computeNodeSize(shape, label) {
  const { maxWidth, lineCount } = measureLabel(label);
  const textH = lineCount * LINE_HEIGHT;
  switch (shape) {
    case "diamond":
      return {
        w: Math.max(100, Math.ceil(maxWidth * 1.4) + 40),
        h: Math.max(80, Math.ceil(textH * 1.9) + 24)
      };
    case "ellipse":
      return {
        w: Math.max(120, Math.ceil(maxWidth * 1.3) + 32),
        h: Math.max(80, Math.ceil(textH * 1.4) + 24)
      };
    case "rectangle":
    case "rounded":
      return {
        w: Math.max(120, maxWidth + 32),
        h: Math.max(60, textH + 20)
      };
    default:
      return DEFAULT_NODE_SIZE[shape] ?? DEFAULT_NODE_SIZE.rectangle;
  }
}
function mapEdgeTypeToStyle(edge) {
  const type = edge.type ?? "";
  const stroke = edge.stroke ?? "normal";
  const strokeWidth = stroke === "thick" ? 3 : 1.5;
  const dashed = stroke === "dotted";
  let endArrow = "classic";
  if (type.includes("arrow_cross")) {
    endArrow = "block";
  } else if (type.includes("arrow_circle")) {
    endArrow = "oval";
  } else if (type.includes("arrow_open")) {
    endArrow = "none";
  } else if (type.includes("double_arrow")) {
    endArrow = "classic";
  }
  const routing = "orthogonal";
  return { routing, dashed, endArrow, strokeWidth };
}
const LAY_BASE = 50;
const LAY_H_GAP = 40;
const LAY_V_GAP = 60;
const DUMMY_PREFIX = "__dummy_";
function buildDAG(nodeIds, edges) {
  const outgoing = /* @__PURE__ */ new Map();
  const incoming = /* @__PURE__ */ new Map();
  for (const id of nodeIds) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  const seen = /* @__PURE__ */ new Set();
  for (const e of edges) {
    if (e.start === e.end) continue;
    const key = `${e.start}->${e.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (outgoing.has(e.start) && incoming.has(e.end)) {
      outgoing.get(e.start).push(e.end);
      incoming.get(e.end).push(e.start);
    }
  }
  const color = /* @__PURE__ */ new Map();
  for (const id of nodeIds) color.set(id, 0);
  const backEdges = [];
  const dfs = (node) => {
    color.set(node, 1);
    for (const next of outgoing.get(node) ?? []) {
      const c = color.get(next) ?? 0;
      if (c === 1) backEdges.push([node, next]);
      else if (c === 0) dfs(next);
    }
    color.set(node, 2);
  };
  for (const id of nodeIds) if (color.get(id) === 0) dfs(id);
  for (const [u, v] of backEdges) {
    const ou = outgoing.get(u);
    const iv = incoming.get(v);
    ou.splice(ou.indexOf(v), 1);
    iv.splice(iv.indexOf(u), 1);
  }
  return { outgoing, incoming };
}
function assignLayers(nodeIds, outgoing, incoming) {
  const inDeg = /* @__PURE__ */ new Map();
  for (const id of nodeIds) inDeg.set(id, (incoming.get(id) ?? []).length);
  const queue = [];
  for (const id of nodeIds) if (inDeg.get(id) === 0) queue.push(id);
  if (queue.length === 0 && nodeIds.length > 0) {
    queue.push(nodeIds[0]);
    inDeg.set(nodeIds[0], 0);
  }
  const topo = [];
  const visited = /* @__PURE__ */ new Set();
  while (queue.length > 0) {
    const node = queue.shift();
    topo.push(node);
    visited.add(node);
    for (const next of outgoing.get(node) ?? []) {
      const d = (inDeg.get(next) ?? 1) - 1;
      inDeg.set(next, d);
      if (d === 0 && !visited.has(next)) queue.push(next);
    }
    if (queue.length === 0 && topo.length < nodeIds.length) {
      for (const id of nodeIds) {
        if (!visited.has(id)) {
          queue.push(id);
          inDeg.set(id, 0);
          break;
        }
      }
    }
  }
  const layer = /* @__PURE__ */ new Map();
  for (const node of topo) {
    const preds = incoming.get(node) ?? [];
    layer.set(node, preds.length === 0 ? 0 : Math.max(...preds.map((p) => (layer.get(p) ?? 0) + 1)));
  }
  const maxLayer = Math.max(0, ...Array.from(layer.values()));
  const levels = Array.from({ length: maxLayer + 1 }, () => []);
  for (const node of topo) levels[layer.get(node)].push(node);
  return levels;
}
function insertDummies(levels, outgoing, incoming) {
  const newLevels = levels.map((l) => [...l]);
  const newOut = /* @__PURE__ */ new Map();
  const newIn = /* @__PURE__ */ new Map();
  const isDummy = /* @__PURE__ */ new Set();
  const edgeToDummies = /* @__PURE__ */ new Map();
  for (const [k, v] of outgoing) newOut.set(k, [...v]);
  for (const [k, v] of incoming) newIn.set(k, [...v]);
  const layerOf = /* @__PURE__ */ new Map();
  for (let i = 0; i < levels.length; i++)
    for (const n of levels[i]) layerOf.set(n, i);
  const allEdges = [];
  for (const [u, vs] of outgoing) for (const v of vs) allEdges.push([u, v]);
  let count = 0;
  for (const [u, v] of allEdges) {
    const lu = layerOf.get(u);
    const lv = layerOf.get(v);
    const span = lv - lu;
    if (span <= 1) continue;
    newOut.get(u).splice(newOut.get(u).indexOf(v), 1);
    newIn.get(v).splice(newIn.get(v).indexOf(u), 1);
    let prev = u;
    const chain = [];
    for (let l = lu + 1; l < lv; l++) {
      const d = `${DUMMY_PREFIX}${count++}`;
      isDummy.add(d);
      chain.push(d);
      newOut.set(d, []);
      newIn.set(d, []);
      newLevels[l].push(d);
      layerOf.set(d, l);
      newOut.get(prev).push(d);
      newIn.get(d).push(prev);
      prev = d;
    }
    newOut.get(prev).push(v);
    newIn.get(v).push(prev);
    edgeToDummies.set(`${u}->${v}`, { u, v, chain });
  }
  return { levels: newLevels, outgoing: newOut, incoming: newIn, isDummy, edgeToDummies };
}
function countCrossingsBetween(upper, lower, outgoing) {
  const upPos = /* @__PURE__ */ new Map();
  upper.forEach((n, i) => upPos.set(n, i));
  const loPos = /* @__PURE__ */ new Map();
  lower.forEach((n, i) => loPos.set(n, i));
  const pairs = [];
  for (const u of upper) {
    for (const v of outgoing.get(u) ?? []) {
      const p = loPos.get(v);
      if (p !== void 0) pairs.push([upPos.get(u), p]);
    }
  }
  let count = 0;
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      if (pairs[i][0] < pairs[j][0] && pairs[i][1] > pairs[j][1]) count++;
      else if (pairs[i][0] > pairs[j][0] && pairs[i][1] < pairs[j][1]) count++;
    }
  }
  return count;
}
function adjacentExchange(levels, outgoing, maxRounds = 4) {
  const result = levels.map((l) => [...l]);
  const layerCrossings = (l) => {
    let total = 0;
    if (l > 0) total += countCrossingsBetween(result[l - 1], result[l], outgoing);
    if (l < result.length - 1) total += countCrossingsBetween(result[l], result[l + 1], outgoing);
    return total;
  };
  for (let round = 0; round < maxRounds; round++) {
    let improved = false;
    for (let l = 0; l < result.length; l++) {
      for (let i = 0; i < result[l].length - 1; i++) {
        const before = layerCrossings(l);
        [result[l][i], result[l][i + 1]] = [result[l][i + 1], result[l][i]];
        const after = layerCrossings(l);
        if (after < before) improved = true;
        else [result[l][i], result[l][i + 1]] = [result[l][i + 1], result[l][i]];
      }
    }
    if (!improved) break;
  }
  return result;
}
function minimizeCrossings(levels, outgoing, incoming, sweeps = 8) {
  const result = levels.map((l) => [...l]);
  const dfsOrder = /* @__PURE__ */ new Map();
  let counter = 0;
  const visited = /* @__PURE__ */ new Set();
  const dfs = (node) => {
    if (visited.has(node)) return;
    visited.add(node);
    dfsOrder.set(node, counter++);
    for (const next of outgoing.get(node) ?? []) dfs(next);
  };
  for (const node of result[0] ?? []) dfs(node);
  for (const layer of result) for (const node of layer) if (!visited.has(node)) dfs(node);
  for (const layer of result) layer.sort((a, b) => (dfsOrder.get(a) ?? 0) - (dfsOrder.get(b) ?? 0));
  const baryUp = (node, layer) => {
    const ns = incoming.get(node) ?? [];
    let sum = 0, n = 0;
    for (const nb of ns) {
      const p = result[layer - 1]?.indexOf(nb);
      if (p !== void 0 && p >= 0) {
        sum += p;
        n++;
      }
    }
    return n > 0 ? sum / n : -1;
  };
  const baryDown = (node, layer) => {
    const ns = outgoing.get(node) ?? [];
    let sum = 0, n = 0;
    for (const nb of ns) {
      const p = result[layer + 1]?.indexOf(nb);
      if (p !== void 0 && p >= 0) {
        sum += p;
        n++;
      }
    }
    return n > 0 ? sum / n : -1;
  };
  const sortLayer = (layer, baryFn) => {
    result[layer].sort((a, b) => {
      const ba = baryFn(a, layer);
      const bb = baryFn(b, layer);
      if (ba === -1 && bb === -1) return 0;
      if (ba === -1) return 1;
      if (bb === -1) return -1;
      const diff = ba - bb;
      return Math.abs(diff) < 0.01 ? 0 : diff;
    });
  };
  for (let s = 0; s < sweeps; s++) {
    if (s % 2 === 0) {
      for (let l = 1; l < result.length; l++) sortLayer(l, baryUp);
    } else {
      for (let l = result.length - 2; l >= 0; l--) sortLayer(l, baryDown);
    }
  }
  return adjacentExchange(result, outgoing);
}
function medianOf(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function assignCoordinates(levels, outgoing, incoming, sizes, isDummy, direction, longEdges) {
  const isHorizontal = direction === "LR" || direction === "RL";
  const isReverse = direction === "RL" || direction === "BT";
  const sizeOf = (id) => isDummy.has(id) ? { w: 0, h: 0 } : sizes.get(id) ?? { w: 120, h: 60 };
  const mainDim = (id) => isHorizontal ? sizeOf(id).w : sizeOf(id).h;
  const crossDim = (id) => isHorizontal ? sizeOf(id).h : sizeOf(id).w;
  const baseMainGap = isHorizontal ? LAY_H_GAP : LAY_V_GAP;
  const crossGap = isHorizontal ? LAY_V_GAP : LAY_H_GAP;
  const layerOf = /* @__PURE__ */ new Map();
  for (let l = 0; l < levels.length; l++)
    for (const n of levels[l]) layerOf.set(n, l);
  const seamCount = new Array(Math.max(0, levels.length - 1)).fill(0);
  for (const le of longEdges) {
    const lu = layerOf.get(le.u);
    const lv = layerOf.get(le.v);
    for (let m = lu; m < lv; m++) seamCount[m]++;
  }
  const mainPos = /* @__PURE__ */ new Map();
  const levelMaxMain = [];
  let mainCursor = 0;
  for (let l = 0; l < levels.length; l++) {
    const mx = Math.max(0, ...levels[l].map(mainDim));
    levelMaxMain.push(mx);
    for (const node of levels[l]) mainPos.set(node, mainCursor);
    mainCursor += mx;
    if (l < levels.length - 1) {
      mainCursor += Math.max(baseMainGap, 20 + seamCount[l] * 12);
    }
  }
  const totalMain = mainCursor;
  const crossPos = /* @__PURE__ */ new Map();
  for (const layer of levels) {
    let cursor = 0;
    for (const node of layer) {
      crossPos.set(node, cursor);
      cursor += crossDim(node) + crossGap;
    }
  }
  const crossCenter = (id) => crossPos.get(id) + crossDim(id) / 2;
  const placeLayer = (layer, desired, leftToRight) => {
    if (leftToRight) {
      let cursor = -Infinity;
      for (const node of layer) {
        const w = crossDim(node);
        const d = desired.get(node);
        let x = d !== void 0 ? d - w / 2 : crossPos.get(node);
        x = Math.max(x, cursor);
        crossPos.set(node, x);
        cursor = x + w + crossGap;
      }
    } else {
      let cursor = Infinity;
      for (let i = layer.length - 1; i >= 0; i--) {
        const node = layer[i];
        const w = crossDim(node);
        const d = desired.get(node);
        let x = d !== void 0 ? d - w / 2 : crossPos.get(node);
        x = Math.min(x, cursor - w);
        crossPos.set(node, x);
        cursor = x - crossGap;
      }
    }
  };
  for (let round = 0; round < 4; round++) {
    const down = round % 2 === 0;
    const leftToRight = round % 2 === 0;
    if (down) {
      for (let l = 1; l < levels.length; l++) {
        const desired = /* @__PURE__ */ new Map();
        for (const node of levels[l]) {
          const centers = (incoming.get(node) ?? []).map((nb) => crossCenter(nb));
          if (centers.length > 0) desired.set(node, medianOf(centers));
        }
        placeLayer(levels[l], desired, leftToRight);
      }
    } else {
      for (let l = levels.length - 2; l >= 0; l--) {
        const desired = /* @__PURE__ */ new Map();
        for (const node of levels[l]) {
          const centers = (outgoing.get(node) ?? []).map((nb) => crossCenter(nb));
          if (centers.length > 0) desired.set(node, medianOf(centers));
        }
        placeLayer(levels[l], desired, leftToRight);
      }
    }
  }
  const nodeAtLayer = (le, l) => {
    const lu = layerOf.get(le.u);
    if (l === lu) return le.u;
    if (l === layerOf.get(le.v)) return le.v;
    return le.chain[l - lu - 1];
  };
  const channelOf = /* @__PURE__ */ new Map();
  for (let m = 0; m < levels.length - 1; m++) {
    const crossing = longEdges.filter((le) => layerOf.get(le.u) <= m && layerOf.get(le.v) > m).sort((a, b) => {
      const ca = (crossCenter(nodeAtLayer(a, m)) + crossCenter(nodeAtLayer(a, m + 1))) / 2;
      const cb = (crossCenter(nodeAtLayer(b, m)) + crossCenter(nodeAtLayer(b, m + 1))) / 2;
      return ca - cb;
    });
    if (crossing.length === 0) continue;
    const bandTop = mainPos.get(levels[m][0]) + levelMaxMain[m] + 8;
    const bandBottom = mainPos.get(levels[m + 1][0]) - 8;
    const bandH = bandBottom - bandTop;
    crossing.forEach((le, i) => {
      const ch = bandTop + bandH * (i + 1) / (crossing.length + 1);
      const arr = channelOf.get(le.key) ?? [];
      arr.push(ch);
      channelOf.set(le.key, arr);
    });
  }
  const positions = /* @__PURE__ */ new Map();
  let minX = Infinity, minY = Infinity;
  for (let l = 0; l < levels.length; l++) {
    for (const node of levels[l]) {
      const mp = mainPos.get(node);
      const cp = crossPos.get(node);
      const s = sizeOf(node);
      let x, y;
      if (isHorizontal) {
        x = isReverse ? totalMain - mp - s.w : mp;
        y = cp;
      } else {
        x = cp;
        y = isReverse ? totalMain - mp - s.h : mp;
      }
      positions.set(node, { x, y });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
    }
  }
  const offX = Math.max(0, LAY_BASE - (minX === Infinity ? 0 : minX));
  const offY = Math.max(0, LAY_BASE - (minY === Infinity ? 0 : minY));
  if (offX > 0 || offY > 0) {
    for (const [, pos] of positions) {
      pos.x += offX;
      pos.y += offY;
    }
  }
  const toXY = (main, cross) => {
    const m = isReverse ? totalMain - main : main;
    return isHorizontal ? { x: m + offX, y: cross + offY } : { x: cross + offX, y: m + offY };
  };
  const channelWaypoints = /* @__PURE__ */ new Map();
  for (const le of longEdges) {
    const channels = channelOf.get(le.key);
    if (!channels) continue;
    const lu = layerOf.get(le.u);
    const lv = layerOf.get(le.v);
    const abs = [];
    for (let m = lu; m < lv; m++) {
      const ch = channels[m - lu];
      const cCur = crossCenter(nodeAtLayer(le, m));
      const cNext = crossCenter(nodeAtLayer(le, m + 1));
      abs.push({ main: ch, cross: cCur });
      abs.push({ main: ch, cross: cNext });
    }
    const deduped = [];
    for (const p of abs) {
      const last = deduped[deduped.length - 1];
      if (last && last.main === p.main && last.cross === p.cross) continue;
      deduped.push(p);
    }
    channelWaypoints.set(le.key, deduped.map((p) => toXY(p.main, p.cross)));
  }
  const seamMids = [];
  for (let m = 0; m < levels.length - 1; m++) {
    if (levels[m].length === 0 || levels[m + 1].length === 0) {
      seamMids.push(0);
      continue;
    }
    const upper = mainPos.get(levels[m][0]) + levelMaxMain[m];
    const lower = mainPos.get(levels[m + 1][0]);
    seamMids.push((upper + lower) / 2);
  }
  return {
    positions,
    channelWaypoints,
    seamMids,
    geom: { isHorizontal, isReverse, totalMain, offX, offY }
  };
}
function layoutNodes(vertices, edges, direction, sizes) {
  const nodeIds = Array.from(vertices.keys());
  if (nodeIds.length === 0)
    return { positions: /* @__PURE__ */ new Map(), waypoints: /* @__PURE__ */ new Map(), ports: /* @__PURE__ */ new Map() };
  const { outgoing, incoming } = buildDAG(nodeIds, edges);
  const levels = assignLayers(nodeIds, outgoing, incoming);
  const { levels: dLevels, outgoing: dOut, incoming: dIn, isDummy, edgeToDummies } = insertDummies(levels, outgoing, incoming);
  const ordered = minimizeCrossings(dLevels, dOut, dIn);
  const longEdges = [];
  for (const [key, info] of edgeToDummies) {
    longEdges.push({ key, u: info.u, v: info.v, chain: info.chain });
  }
  const { positions: allPositions, channelWaypoints, seamMids, geom } = assignCoordinates(
    ordered,
    dOut,
    dIn,
    sizes,
    isDummy,
    direction,
    longEdges
  );
  const positions = /* @__PURE__ */ new Map();
  for (const [id, pos] of allPositions) {
    if (!isDummy.has(id)) positions.set(id, pos);
  }
  const layerOf = /* @__PURE__ */ new Map();
  for (let l = 0; l < levels.length; l++)
    for (const n of levels[l]) layerOf.set(n, l);
  const isHorizontal = geom.isHorizontal;
  const sizeOf = (id) => sizes.get(id) ?? { w: 120, h: 60 };
  const mainCenterOf = (id) => {
    const p = positions.get(id);
    const s = sizeOf(id);
    return isHorizontal ? p.x + s.w / 2 : p.y + s.h / 2;
  };
  const mainToXY = (m) => (geom.isReverse ? geom.totalMain - m : m) + (isHorizontal ? geom.offX : geom.offY);
  const waypoints = /* @__PURE__ */ new Map();
  const ports = /* @__PURE__ */ new Map();
  const loopIdx = [];
  const edgeDelta = [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    edgeDelta.push(0);
    if (e.start === e.end) continue;
    if (!positions.has(e.start) || !positions.has(e.end)) continue;
    const d = mainCenterOf(e.end) - mainCenterOf(e.start);
    edgeDelta[i] = d;
    const backward = geom.isReverse ? d > 0 : d < 0;
    if (backward && layerOf.has(e.start) && layerOf.has(e.end)) loopIdx.push(i);
  }
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (e.start === e.end) continue;
    if (!positions.has(e.start) || !positions.has(e.end)) continue;
    const forward = edgeDelta[i] >= 0;
    let exit;
    let entry;
    if (isHorizontal) {
      exit = forward ? { x: 1, y: 0.5 } : { x: 0, y: 0.5 };
      entry = forward ? { x: 0, y: 0.5 } : { x: 1, y: 0.5 };
    } else {
      exit = forward ? { x: 0.5, y: 1 } : { x: 0.5, y: 0 };
      entry = forward ? { x: 0.5, y: 0 } : { x: 0.5, y: 1 };
    }
    ports.set(i, { exit, entry });
  }
  if (loopIdx.length > 0) {
    const sorted = [...loopIdx].sort((a, b) => {
      const la = layerOf.get(edges[a].end) - layerOf.get(edges[a].start);
      const lb = layerOf.get(edges[b].end) - layerOf.get(edges[b].start);
      if (la !== lb) return la - lb;
      return a - b;
    });
    const laneRank = /* @__PURE__ */ new Map();
    sorted.forEach((idx, rank) => laneRank.set(idx, rank));
    let maxCross = -Infinity;
    for (const [id, p] of positions) {
      const s = sizeOf(id);
      maxCross = Math.max(maxCross, isHorizontal ? p.y + s.h : p.x + s.w);
    }
    const laneOf = (idx) => maxCross + 24 + (sorted.length - 1 - laneRank.get(idx)) * 16;
    const spreadPort = (keyOf, isExit) => {
      const groups = /* @__PURE__ */ new Map();
      for (const idx of loopIdx) {
        const k = keyOf(edges[idx]);
        const arr = groups.get(k) ?? [];
        arr.push(idx);
        groups.set(k, arr);
      }
      for (const arr of groups.values()) {
        if (arr.length < 2) continue;
        arr.sort((a, b) => laneRank.get(a) - laneRank.get(b));
        arr.forEach((idx, i) => {
          const rel = 0.5 + (i - (arr.length - 1) / 2) * 0.2;
          const p = ports.get(idx);
          if (isExit) {
            p.exit = isHorizontal ? { x: p.exit.x, y: rel } : { x: rel, y: p.exit.y };
          } else {
            p.entry = isHorizontal ? { x: p.entry.x, y: rel } : { x: rel, y: p.entry.y };
          }
        });
      }
    };
    spreadPort((e) => e.start, true);
    spreadPort((e) => e.end, false);
    const staggerOf = (seamOf) => {
      const groups = /* @__PURE__ */ new Map();
      for (const idx of loopIdx) {
        const m = seamOf(idx);
        const arr = groups.get(m) ?? [];
        arr.push(idx);
        groups.set(m, arr);
      }
      const result = /* @__PURE__ */ new Map();
      for (const arr of groups.values()) {
        arr.sort((a, b) => laneRank.get(a) - laneRank.get(b));
        arr.forEach((idx, i) => result.set(idx, (i - (arr.length - 1) / 2) * 12));
      }
      return result;
    };
    const stagSource = staggerOf((idx) => layerOf.get(edges[idx].start) - 1);
    const stagTarget = staggerOf((idx) => layerOf.get(edges[idx].end));
    for (const idx of loopIdx) {
      const e = edges[idx];
      const sp = positions.get(e.start);
      const tp = positions.get(e.end);
      const ss = sizeOf(e.start);
      const ts = sizeOf(e.end);
      const p = ports.get(idx);
      const exitCross = isHorizontal ? sp.y + p.exit.y * ss.h : sp.x + p.exit.x * ss.w;
      const entryCross = isHorizontal ? tp.y + p.entry.y * ts.h : tp.x + p.entry.x * ts.w;
      const gapS = mainToXY(seamMids[layerOf.get(e.start) - 1]) + (stagSource.get(idx) ?? 0);
      const gapT = mainToXY(seamMids[layerOf.get(e.end)]) + (stagTarget.get(idx) ?? 0);
      const lane = laneOf(idx);
      const raw = isHorizontal ? [
        { x: gapS, y: exitCross },
        { x: gapS, y: lane },
        { x: gapT, y: lane },
        { x: gapT, y: entryCross }
      ] : [
        { x: exitCross, y: gapS },
        { x: lane, y: gapS },
        { x: lane, y: gapT },
        { x: entryCross, y: gapT }
      ];
      const pts = [];
      for (const pt of raw) {
        const last = pts[pts.length - 1];
        if (last && last.x === pt.x && last.y === pt.y) continue;
        pts.push(pt);
      }
      waypoints.set(idx, pts);
    }
  }
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (e.start === e.end || waypoints.has(i)) continue;
    const fwdKey = `${e.start}->${e.end}`;
    const revKey = `${e.end}->${e.start}`;
    let pts = channelWaypoints.get(fwdKey);
    let reversed = false;
    if (!pts) {
      pts = channelWaypoints.get(revKey);
      reversed = true;
    }
    if (!pts || pts.length === 0) continue;
    waypoints.set(i, reversed ? [...pts].reverse() : pts);
  }
  return { positions, waypoints, ports };
}
function convertFlowchartToSnapshot(data) {
  const { vertices, edges, direction } = data;
  const nodes = [];
  const graphEdges = [];
  const labels = /* @__PURE__ */ new Map();
  const sizes = /* @__PURE__ */ new Map();
  for (const [id, vertex] of vertices) {
    const shape = mapVertexToShape(vertex);
    const label = wrapLabel(vertex.text ?? id);
    labels.set(id, label);
    sizes.set(id, computeNodeSize(shape, label));
  }
  const dir = direction ?? "TB";
  const { positions, waypoints, ports } = layoutNodes(vertices, edges, dir, sizes);
  for (const [id, vertex] of vertices) {
    const shape = mapVertexToShape(vertex);
    const size = sizes.get(id) ?? DEFAULT_NODE_SIZE.rectangle;
    const pos = positions.get(id) ?? { x: 50, y: 50 };
    nodes.push({
      id: `node-${id}`,
      shape,
      x: pos.x,
      y: pos.y,
      w: size.w,
      h: size.h,
      label: labels.get(id) ?? id
    });
  }
  for (let edgeIdx = 0; edgeIdx < edges.length; edgeIdx++) {
    const edge = edges[edgeIdx];
    const sourceId = `node-${edge.start}`;
    const targetId = `node-${edge.end}`;
    if (!vertices.has(edge.start) || !vertices.has(edge.end)) {
      continue;
    }
    const style = mapEdgeTypeToStyle(edge);
    const wp = waypoints.get(edgeIdx);
    const pt = ports.get(edgeIdx);
    const graphEdge = {
      // 平行边（A->B 写两次）需靠循环索引区分，不能用时间戳（同一毫秒内相同）
      id: `edge-${edge.start}-${edge.end}-${edgeIdx}`,
      source: sourceId,
      target: targetId,
      label: edge.text ?? void 0,
      routing: style.routing,
      endArrow: style.endArrow,
      style: {
        dashed: style.dashed,
        strokeWidth: style.strokeWidth
      }
    };
    if (pt) {
      graphEdge.exit = pt.exit;
      graphEdge.entry = pt.entry;
    }
    if (wp && wp.length > 0) graphEdge.waypoints = wp;
    graphEdges.push(graphEdge);
  }
  return {
    kind: "jgraph",
    version: 1,
    nodes,
    edges: graphEdges,
    viewport: {
      scale: 1,
      dx: 0,
      dy: 0
    }
  };
}
export {
  computeNodeSize,
  convertFlowchartToSnapshot,
  layoutNodes,
  measureLabel,
  wrapLabel
};
