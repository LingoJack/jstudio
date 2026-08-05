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
}

function makeGraph(): FakeCtx {
  const model = new GraphDataModel();
  const root = model.getRoot();
  const parent = root.getChildAt(0);

  const children = (p: Cell): Cell[] => {
    const out: Cell[] = [];
    for (let i = 0; i < p.getChildCount(); i += 1) out.push(p.getChildAt(i));
    return out;
  };

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
  } as unknown as AbstractGraph;

  let listener: ((s: unknown, evt: { getProperty: (k: string) => unknown }) => void) | null =
    null;
  const handler = {
    addListener: (_evt: string, l: typeof listener) => {
      listener = l;
    },
    removeListener: () => {},
    first: null,
  };
  attachAutoActivation(graph, handler as never);

  return {
    graph,
    model,
    parent,
    fireConnect: (edge: Cell) => {
      listener?.(null, { getProperty: (k) => (k === 'cell' ? edge : undefined) });
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
