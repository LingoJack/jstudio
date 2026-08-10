/**
 * sequenceInteraction 的模型级无头测试。
 *
 * maxGraph 的 GraphDataModel / Cell / Geometry 不依赖 DOM，
 * 这里用一个最小 fake graph（仅实现 CONNECT listener 用到的 API）
 * 驱动真实的 attachAutoActivation 逻辑，验证时序图五种场景的分派。
 *
 * 运行：npx tsx --test src/components/editor/nodes/graph/sequenceInteraction.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cell, Geometry, GraphDataModel, type AbstractGraph } from '@maxgraph/core';

import {
  attachAutoActivation,
  attachSequenceResizeSync,
  isActivation,
  isLifeline,
} from './sequenceInteraction';

/* ------------------------------------------------------------------ */
/* 最小 fake graph                                                     */
/* ------------------------------------------------------------------ */

interface FakeCtx {
  graph: AbstractGraph;
  model: GraphDataModel;
  parent: Cell;
  fireConnect: (edge: Cell) => void;
  fireResize: (cells: Cell[], prevs?: (Geometry | null)[]) => void;
}

function makeGraph(): FakeCtx {
  const model = new GraphDataModel();
  const root = model.getRoot();
  if (!root) throw new Error('root is null');
  const parent = root.getChildAt(0);

  const children = (p: Cell): Cell[] => {
    const out: Cell[] = [];
    for (let i = 0; i < p.getChildCount(); i += 1) out.push(p.getChildAt(i));
    return out;
  };

  // 事件监听器注册表：按事件名分组（支持 CONNECT / CELLS_RESIZED）
  const graphListeners = new Map<string, Array<(s: unknown, evt: { getProperty: (k: string) => unknown }) => void>>();

  const graph = {
    getDataModel: () => model,
    getDefaultParent: () => parent,
    getChildVertices: (p: Cell) => children(p).filter((c) => c.isVertex()),
    getChildEdges: (p: Cell) => children(p).filter((c) => c.isEdge()),
    insertVertex: ({ parent: p, id, value, position, size, style }: {
      parent: Cell; id: string; value: string;
      position: [number, number]; size: [number, number];
      style: Record<string, unknown>;
    }) => {
      const c = new Cell(value, new Geometry(position[0], position[1], size[0], size[1]), style);
      c.setId(id);
      c.setVertex(true);
      return model.add(p, c) as Cell;
    },
    // 返回以 cell 为任一端点的所有边（供 resize sync 使用）
    getEdges: (cell: Cell, _p: Cell, _incoming: boolean, _outgoing: boolean, _includeCollapsed: boolean) =>
      children(parent).filter((c) => c.isEdge() && (c.getTerminal(true) === cell || c.getTerminal(false) === cell)),
    addListener: (evt: string, l: (s: unknown, e: { getProperty: (k: string) => unknown }) => void) => {
      const arr = graphListeners.get(evt) ?? [];
      arr.push(l);
      graphListeners.set(evt, arr);
    },
    removeListener: (l: (s: unknown, e: { getProperty: (k: string) => unknown }) => void) => {
      for (const arr of graphListeners.values()) {
        const i = arr.indexOf(l);
        if (i >= 0) arr.splice(i, 1);
      }
    },
  } as unknown as AbstractGraph;

  let connectListener: ((s: unknown, evt: { getProperty: (k: string) => unknown }) => void) | null =
    null;
  const handler = {
    addListener: (_evt: string, l: typeof connectListener) => {
      connectListener = l;
    },
    removeListener: () => {},
    first: null,
  };
  attachAutoActivation(graph, handler as never);
  attachSequenceResizeSync(graph);

  return {
    graph,
    model,
    parent,
    fireConnect: (edge: Cell) => {
      connectListener?.(null, { getProperty: (k) => (k === 'cell' ? edge : undefined) });
    },
    fireResize: (cells: Cell[], prevs?: (Geometry | null)[]) => {
      const arr = graphListeners.get('cellsResized') ?? [];
      for (const l of arr) {
        l(null, {
          getProperty: (k) => {
            if (k === 'cells') return cells;
            if (k === 'prev') return prevs;
            return undefined;
          },
        });
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* 构造工具                                                            */
/* ------------------------------------------------------------------ */

function addLifeline(ctx: FakeCtx, id: string, x: number): Cell {
  const c = new Cell('', new Geometry(x, 100, 100, 400), {
    shape: 'lifeline',
    perimeter: 'lifelinePerimeter',
  });
  c.setId(id);
  c.setVertex(true);
  return ctx.model.add(ctx.parent, c) as Cell;
}

/** 模拟 ConnectionHandler 落笔后的边：挂在 src/tgt 之间，带 exit 约束。 */
function connect(ctx: FakeCtx, src: Cell, tgt: Cell, exitYRel: number): Cell {
  const srcGeo = src.getGeometry()!;
  const edge = new Cell('', new Geometry(), {
    edgeStyle: 'obstacleEdgeStyle',
    endArrow: 'classic',
    exitX: srcGeo.width > 20 ? 0.5 : 1, // lifeline 中心 / ac 右缘
    exitY: exitYRel,
  });
  edge.setEdge(true);
  ctx.model.add(ctx.parent, edge);
  ctx.model.setTerminal(edge, src, true);
  ctx.model.setTerminal(edge, tgt, false);
  ctx.fireConnect(edge);
  return edge;
}

function activations(ctx: FakeCtx): Cell[] {
  return ctx.graph.getChildVertices(ctx.parent).filter(isActivation);
}

/* ------------------------------------------------------------------ */
/* 测试                                                                */
/* ------------------------------------------------------------------ */

test('ll → ll：创建 activation 并重定向 edge（场景 D）', () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, 'A', 0);
  const b = addLifeline(ctx, 'B', 300);

  const edge = connect(ctx, a, b, 0.2);

  const acs = activations(ctx);
  assert.equal(acs.length, 1, '应在 B 上创建一个 activation');
  // ac 居中贴在 B 的中心线上
  const acGeo = acs[0].getGeometry()!;
  assert.equal(acGeo.x + acGeo.width / 2, 350);
  // edge 的 target 被重定向到新 ac
  assert.equal(edge.getTerminal(false), acs[0]);
  // 实线调用样式
  const st = edge.getStyle() as Record<string, unknown>;
  assert.equal(st.endArrow, 'classic');
  assert.notEqual(st.dashed, true);
});

test('ac → 裸生命线（无 open call）：视为新调用，创建 activation（场景 D）', () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, 'A', 0);
  const b = addLifeline(ctx, 'B', 300);
  const c = addLifeline(ctx, 'C', 600);

  // A → B（B 上出现 ac）
  connect(ctx, a, b, 0.2);
  const acB = activations(ctx)[0];

  // B 的 ac → C 的裸生命线：应判定为新调用
  const exitY = 0.5;
  const edge = connect(ctx, acB, c, exitY);

  const acs = activations(ctx);
  assert.equal(acs.length, 2, '应在 C 上再创建一个 activation');
  const acC = acs.find((v) => v !== acB)!;
  // 新 ac 居中贴在 C 的中心线上（x=600, w=100 → center 650）
  const acCGeo = acC.getGeometry()!;
  assert.equal(acCGeo.x + acCGeo.width / 2, 650);
  // edge 重定向到 C 的 ac
  assert.equal(edge.getTerminal(false), acC);
  // 实线调用
  const st = edge.getStyle() as Record<string, unknown>;
  assert.equal(st.endArrow, 'classic');
  assert.notEqual(st.dashed, true);
});

test('ac → 调用方生命线（有 open call）：视为返回消息，不创建 activation（场景 B）', () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, 'A', 0);
  const b = addLifeline(ctx, 'B', 300);

  // A → B（open call）
  connect(ctx, a, b, 0.2);
  const acB = activations(ctx)[0];

  // B 的 ac → A 的生命线：应判定为返回（虚线），不新建 ac
  const acGeo = acB.getGeometry()!;
  const exitAbsY = acGeo.y + 0.6 * acGeo.height;
  const edge = connect(ctx, acB, a, 0.6);

  assert.equal(activations(ctx).length, 1, '返回消息不应创建 activation');
  const st = edge.getStyle() as Record<string, unknown>;
  assert.equal(st.dashed, true, '返回消息应为虚线');
  assert.equal(st.endArrow, 'openThin');
  // entry 钉在 A 的中心线上、与 exit 同一 Y（水平）
  const aGeo = a.getGeometry()!;
  assert.equal(st.entryX, 0.5);
  const entryAbsY = aGeo.y + (st.entryY as number) * aGeo.height;
  assert.ok(Math.abs(entryAbsY - exitAbsY) < 1e-6, '返回消息应保持水平');
});

test('散置 ac（找不到所属生命线）→ 裸生命线：按新调用处理，创建 activation', () => {
  const ctx = makeGraph();
  addLifeline(ctx, 'A', 0);
  const c = addLifeline(ctx, 'C', 600);
  // 手工放一个不在任何生命线中心线上的 ac（模拟 lifeline 被拖走后的残留 ac）
  const stray = new Cell('', new Geometry(123, 200, 16, 60), {
    shape: 'umlActivation',
    perimeter: 'activationPerimeter',
  });
  stray.setId('stray-ac');
  stray.setVertex(true);
  ctx.model.add(ctx.parent, stray);

  const edge = connect(ctx, stray, c, 0.5);
  const acs = activations(ctx).filter((v) => v !== stray);
  assert.equal(acs.length, 1, '散置 ac 拖线也应创建 activation');
  assert.equal(edge.getTerminal(false), acs[0]);
  assert.notEqual((edge.getStyle() as Record<string, unknown>).dashed, true);
});

test('ac → 自己所在的生命线：按返回消息处理', () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, 'A', 0);
  const b = addLifeline(ctx, 'B', 300);

  connect(ctx, a, b, 0.2);
  const acB = activations(ctx)[0];

  // B 的 ac → B 自己的生命线
  const edge = connect(ctx, acB, b, 0.6);
  assert.equal(activations(ctx).length, 1);
  assert.equal((edge.getStyle() as Record<string, unknown>).dashed, true);
});

test('ac → ac：普通消息，不创建 activation（场景 C）', () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, 'A', 0);
  const b = addLifeline(ctx, 'B', 300);

  connect(ctx, a, b, 0.2);
  const acB = activations(ctx)[0];
  connect(ctx, b, a, 0.4); // B 的裸生命线 → A：新调用，A 上出现 ac
  const acA = activations(ctx).find((v) => v !== acB)!;

  // acB → acA：场景 C
  const edge = connect(ctx, acB, acA, 0.5);
  assert.equal(activations(ctx).length, 2, 'ac→ac 不应创建新 activation');
  const st = edge.getStyle() as Record<string, unknown>;
  assert.equal(st.endArrow, 'classic');
  assert.notEqual(st.dashed, true);
});

test('ll → 同一 ll：生命线自环，回形路由，不创建 activation（场景 A2）', () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, 'A', 0);

  // A → A：exitY=0.2，entryY=0.4（不同 Y，模拟向下拖出回路）
  const edge = connect(ctx, a, a, 0.2);
  // 手工把 entryY 改为 0.4 模拟落点在 exit 下方
  const st0 = edge.getStyle() as Record<string, unknown>;
  ctx.model.setStyle(edge, { ...st0, entryY: 0.4 });
  // 再次触发 CONNECT（模拟松手时分派）
  ctx.fireConnect(edge);

  // 不应创建 activation
  assert.equal(activations(ctx).length, 0, '生命线自环不应创建 activation');

  const st = edge.getStyle() as Record<string, unknown>;
  assert.equal(st.edgeStyle, 'none', '应禁用 obstacle 路由，保留直角折线');
  assert.equal(st.endArrow, 'classic');

  // 航点：向右伸出 30px 形成回形（centerX=50, wpX=80）
  const geo = edge.getGeometry()!;
  assert.ok(geo.points && geo.points.length === 2, '应有 2 个航点形成 U 形');
  const llGeo = a.getGeometry()!;
  const centerX = llGeo.x + llGeo.width / 2;
  const exitAbsY = llGeo.y + 0.2 * llGeo.height;
  const entryAbsY = llGeo.y + 0.4 * llGeo.height;
  assert.equal(geo.points[0].x, centerX + 30);
  assert.equal(geo.points[0].y, exitAbsY);
  assert.equal(geo.points[1].x, centerX + 30);
  assert.equal(geo.points[1].y, entryAbsY);
});

test('lifeline 拉长后，已画的消息端点保持原始绝对 Y（连线仍水平）', () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, 'A', 0);
  const b = addLifeline(ctx, 'B', 300);

  // A → B：exitY=0.2 → msgY = 100 + 0.2*400 = 180
  const edge = connect(ctx, a, b, 0.2);

  // 记录原始消息 Y（exit 端绝对 Y）
  const aGeo0 = a.getGeometry()!;
  const origMsgY = aGeo0.y + 0.2 * aGeo0.height;
  assert.equal(origMsgY, 180);

  // 拉长 A 生命线：y=100 不变，height 400 → 600
  const aGeo = a.getGeometry()!;
  aGeo.height = 600;
  ctx.fireResize([a]);

  // 验证 A 上的 exitY 被重算：exitAbsY=180, newHeight=600
  // → exitY = (180-100)/600 = 0.1333...
  // 绝对 Y = 100 + exitY * 600 = 180（保持不变）
  const st = edge.getStyle() as Record<string, number>;
  assert.ok(st.exitAbsY != null, 'exitAbsY 应已存储');
  const newExitAbsY = aGeo.y + st.exitY * aGeo.height;
  assert.ok(Math.abs(newExitAbsY - origMsgY) < 1e-6, `exit 端点应保持在 Y=${origMsgY}，实际 ${newExitAbsY}`);
});

test('旧边（无 exitAbsY/entryAbsY）：lifeline 拉长时用 prev 几何反推绝对 Y，连线仍水平', () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, 'A', 0);
  const b = addLifeline(ctx, 'B', 300);

  // 手工构造一条"旧版"水平消息边：只有相对约束，没有 absY（不触发 CONNECT）
  const edge = new Cell('', new Geometry(), {
    edgeStyle: 'none',
    endArrow: 'classic',
    exitX: 0.5,
    exitY: 0.2, // msgY = 100 + 0.2*400 = 180
    entryX: 0.5,
    entryY: 0.2,
  });
  edge.setEdge(true);
  ctx.model.add(ctx.parent, edge);
  ctx.model.setTerminal(edge, a, true);
  ctx.model.setTerminal(edge, b, false);

  const origMsgY = 180;

  // 拉长 A 生命线：y=100 不变，height 400 → 600（prev 为 resize 前几何）
  const prevA = new Geometry(0, 100, 100, 400);
  const aGeo = a.getGeometry()!;
  aGeo.height = 600;
  ctx.fireResize([a], [prevA]);

  // exitY 应被重算为 (180-100)/600，且 exitAbsY 被补存为 180
  const st = edge.getStyle() as Record<string, number>;
  assert.equal(st.exitAbsY, 180, '应从 prev 几何补存 exitAbsY');
  const newExitAbsY = aGeo.y + st.exitY * aGeo.height;
  assert.ok(Math.abs(newExitAbsY - origMsgY) < 1e-6, `exit 端点应保持在 Y=${origMsgY}，实际 ${newExitAbsY}`);

  // 第二次拉长（600 → 800）无需 prev，走补存后的正常路径
  aGeo.height = 800;
  ctx.fireResize([a]);
  const st2 = edge.getStyle() as Record<string, number>;
  const newExitAbsY2 = aGeo.y + st2.exitY * aGeo.height;
  assert.ok(Math.abs(newExitAbsY2 - origMsgY) < 1e-6, `第二次 resize 后 exit 端点仍应保持 Y=${origMsgY}，实际 ${newExitAbsY2}`);
});

test('生命线自环：拉长生命线后回形两端保持原始绝对 Y', () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, 'A', 0);

  // A → A 自环：exitY=0.2 (Y=180)，entryY=0.4 (Y=260)
  const edge = connect(ctx, a, a, 0.2);
  const st0 = edge.getStyle() as Record<string, unknown>;
  ctx.model.setStyle(edge, { ...st0, entryY: 0.4 });
  ctx.fireConnect(edge);

  // 拉长 A：height 400 → 600
  const aGeo = a.getGeometry()!;
  aGeo.height = 600;
  ctx.fireResize([a]);

  const st = edge.getStyle() as Record<string, number>;
  const newExitAbsY = aGeo.y + st.exitY * aGeo.height;
  const newEntryAbsY = aGeo.y + st.entryY * aGeo.height;
  assert.ok(Math.abs(newExitAbsY - 180) < 1e-6, `自环 exit 端点应保持 Y=180，实际 ${newExitAbsY}`);
  assert.ok(Math.abs(newEntryAbsY - 260) < 1e-6, `自环 entry 端点应保持 Y=260，实际 ${newEntryAbsY}`);
});

test('actor 生命线（umlActor 单 cell）：拉长后挂在上面的消息端点保持原始绝对 Y', () => {
  const ctx = makeGraph();
  // actor = 小人 + 虚线生命线同一个 cell（shape='umlActor'）
  const actor = new Cell('', new Geometry(0, 100, 100, 400), { shape: 'umlActor' });
  actor.setId('actor');
  actor.setVertex(true);
  ctx.model.add(ctx.parent, actor);
  const b = addLifeline(ctx, 'B', 300);

  // 旧图：actor 生命线 → B 的水平消息（只有相对约束，无 absY）
  const edge = new Cell('', new Geometry(), {
    edgeStyle: 'none',
    endArrow: 'classic',
    exitX: 0.5,
    exitY: 0.2, // msgY = 100 + 0.2*400 = 180
    entryX: 0.5,
    entryY: 0.2,
  });
  edge.setEdge(true);
  ctx.model.add(ctx.parent, edge);
  ctx.model.setTerminal(edge, actor, true);
  ctx.model.setTerminal(edge, b, false);

  // 拉长 actor 生命线：height 400 → 900（截图中的场景：虚线拖到画布底部）
  const prevActor = new Geometry(0, 100, 100, 400);
  const actorGeo = actor.getGeometry()!;
  actorGeo.height = 900;
  ctx.fireResize([actor], [prevActor]);

  const st = edge.getStyle() as Record<string, number>;
  assert.equal(st.exitAbsY, 180, '应从 prev 几何补存 exitAbsY');
  const newExitAbsY = actorGeo.y + st.exitY * actorGeo.height;
  assert.ok(Math.abs(newExitAbsY - 180) < 1e-6, `actor 上的 exit 端点应保持 Y=180，实际 ${newExitAbsY}`);
});
