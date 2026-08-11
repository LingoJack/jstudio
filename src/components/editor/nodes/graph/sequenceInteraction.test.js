import { test } from "node:test";
import assert from "node:assert/strict";
import { Cell, Geometry, GraphDataModel } from "@maxgraph/core";
import {
  attachAutoActivation,
  attachSequenceResizeSync,
  isActivation
} from "./sequenceInteraction";
function makeGraph() {
  const model = new GraphDataModel();
  const root = model.getRoot();
  if (!root) throw new Error("root is null");
  const parent = root.getChildAt(0);
  const children = (p) => {
    const out = [];
    for (let i = 0; i < p.getChildCount(); i += 1) out.push(p.getChildAt(i));
    return out;
  };
  const graphListeners = /* @__PURE__ */ new Map();
  const graph = {
    getDataModel: () => model,
    getDefaultParent: () => parent,
    getChildVertices: (p) => children(p).filter((c) => c.isVertex()),
    getChildEdges: (p) => children(p).filter((c) => c.isEdge()),
    insertVertex: ({ parent: p, id, value, position, size, style }) => {
      const c = new Cell(value, new Geometry(position[0], position[1], size[0], size[1]), style);
      c.setId(id);
      c.setVertex(true);
      return model.add(p, c);
    },
    // 返回以 cell 为任一端点的所有边（供 resize sync 使用）
    getEdges: (cell, _p, _incoming, _outgoing, _includeCollapsed) => children(parent).filter((c) => c.isEdge() && (c.getTerminal(true) === cell || c.getTerminal(false) === cell)),
    addListener: (evt, l) => {
      const arr = graphListeners.get(evt) ?? [];
      arr.push(l);
      graphListeners.set(evt, arr);
    },
    removeListener: (l) => {
      for (const arr of graphListeners.values()) {
        const i = arr.indexOf(l);
        if (i >= 0) arr.splice(i, 1);
      }
    }
  };
  let connectListener = null;
  const handler = {
    addListener: (_evt, l) => {
      connectListener = l;
    },
    removeListener: () => {
    },
    first: null
  };
  attachAutoActivation(graph, handler);
  attachSequenceResizeSync(graph);
  return {
    graph,
    model,
    parent,
    fireConnect: (edge) => {
      connectListener?.(null, { getProperty: (k) => k === "cell" ? edge : void 0 });
    },
    fireResize: (cells, prevs) => {
      const arr = graphListeners.get("cellsResized") ?? [];
      for (const l of arr) {
        l(null, {
          getProperty: (k) => {
            if (k === "cells") return cells;
            if (k === "prev") return prevs;
            return void 0;
          }
        });
      }
    }
  };
}
function addLifeline(ctx, id, x) {
  const c = new Cell("", new Geometry(x, 100, 100, 400), {
    shape: "lifeline",
    perimeter: "lifelinePerimeter"
  });
  c.setId(id);
  c.setVertex(true);
  return ctx.model.add(ctx.parent, c);
}
function connect(ctx, src, tgt, exitYRel) {
  const srcGeo = src.getGeometry();
  const edge = new Cell("", new Geometry(), {
    edgeStyle: "obstacleEdgeStyle",
    endArrow: "classic",
    exitX: srcGeo.width > 20 ? 0.5 : 1,
    // lifeline 中心 / ac 右缘
    exitY: exitYRel
  });
  edge.setEdge(true);
  ctx.model.add(ctx.parent, edge);
  ctx.model.setTerminal(edge, src, true);
  ctx.model.setTerminal(edge, tgt, false);
  ctx.fireConnect(edge);
  return edge;
}
function activations(ctx) {
  return ctx.graph.getChildVertices(ctx.parent).filter(isActivation);
}
test("ll \u2192 ll\uFF1A\u521B\u5EFA activation \u5E76\u91CD\u5B9A\u5411 edge\uFF08\u573A\u666F D\uFF09", () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, "A", 0);
  const b = addLifeline(ctx, "B", 300);
  const edge = connect(ctx, a, b, 0.2);
  const acs = activations(ctx);
  assert.equal(acs.length, 1, "\u5E94\u5728 B \u4E0A\u521B\u5EFA\u4E00\u4E2A activation");
  const acGeo = acs[0].getGeometry();
  assert.equal(acGeo.x + acGeo.width / 2, 350);
  assert.equal(edge.getTerminal(false), acs[0]);
  const st = edge.getStyle();
  assert.equal(st.endArrow, "classic");
  assert.notEqual(st.dashed, true);
});
test("ac \u2192 \u88F8\u751F\u547D\u7EBF\uFF08\u65E0 open call\uFF09\uFF1A\u89C6\u4E3A\u65B0\u8C03\u7528\uFF0C\u521B\u5EFA activation\uFF08\u573A\u666F D\uFF09", () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, "A", 0);
  const b = addLifeline(ctx, "B", 300);
  const c = addLifeline(ctx, "C", 600);
  connect(ctx, a, b, 0.2);
  const acB = activations(ctx)[0];
  const exitY = 0.5;
  const edge = connect(ctx, acB, c, exitY);
  const acs = activations(ctx);
  assert.equal(acs.length, 2, "\u5E94\u5728 C \u4E0A\u518D\u521B\u5EFA\u4E00\u4E2A activation");
  const acC = acs.find((v) => v !== acB);
  const acCGeo = acC.getGeometry();
  assert.equal(acCGeo.x + acCGeo.width / 2, 650);
  assert.equal(edge.getTerminal(false), acC);
  const st = edge.getStyle();
  assert.equal(st.endArrow, "classic");
  assert.notEqual(st.dashed, true);
});
test("ac \u2192 \u8C03\u7528\u65B9\u751F\u547D\u7EBF\uFF08\u6709 open call\uFF09\uFF1A\u89C6\u4E3A\u8FD4\u56DE\u6D88\u606F\uFF0C\u4E0D\u521B\u5EFA activation\uFF08\u573A\u666F B\uFF09", () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, "A", 0);
  const b = addLifeline(ctx, "B", 300);
  connect(ctx, a, b, 0.2);
  const acB = activations(ctx)[0];
  const acGeo = acB.getGeometry();
  const exitAbsY = acGeo.y + 0.6 * acGeo.height;
  const edge = connect(ctx, acB, a, 0.6);
  assert.equal(activations(ctx).length, 1, "\u8FD4\u56DE\u6D88\u606F\u4E0D\u5E94\u521B\u5EFA activation");
  const st = edge.getStyle();
  assert.equal(st.dashed, true, "\u8FD4\u56DE\u6D88\u606F\u5E94\u4E3A\u865A\u7EBF");
  assert.equal(st.endArrow, "openThin");
  const aGeo = a.getGeometry();
  assert.equal(st.entryX, 0.5);
  const entryAbsY = aGeo.y + st.entryY * aGeo.height;
  assert.ok(Math.abs(entryAbsY - exitAbsY) < 1e-6, "\u8FD4\u56DE\u6D88\u606F\u5E94\u4FDD\u6301\u6C34\u5E73");
});
test("\u6563\u7F6E ac\uFF08\u627E\u4E0D\u5230\u6240\u5C5E\u751F\u547D\u7EBF\uFF09\u2192 \u88F8\u751F\u547D\u7EBF\uFF1A\u6309\u65B0\u8C03\u7528\u5904\u7406\uFF0C\u521B\u5EFA activation", () => {
  const ctx = makeGraph();
  addLifeline(ctx, "A", 0);
  const c = addLifeline(ctx, "C", 600);
  const stray = new Cell("", new Geometry(123, 200, 16, 60), {
    shape: "umlActivation",
    perimeter: "activationPerimeter"
  });
  stray.setId("stray-ac");
  stray.setVertex(true);
  ctx.model.add(ctx.parent, stray);
  const edge = connect(ctx, stray, c, 0.5);
  const acs = activations(ctx).filter((v) => v !== stray);
  assert.equal(acs.length, 1, "\u6563\u7F6E ac \u62D6\u7EBF\u4E5F\u5E94\u521B\u5EFA activation");
  assert.equal(edge.getTerminal(false), acs[0]);
  assert.notEqual(edge.getStyle().dashed, true);
});
test("ac \u2192 \u81EA\u5DF1\u6240\u5728\u7684\u751F\u547D\u7EBF\uFF1A\u6309\u8FD4\u56DE\u6D88\u606F\u5904\u7406", () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, "A", 0);
  const b = addLifeline(ctx, "B", 300);
  connect(ctx, a, b, 0.2);
  const acB = activations(ctx)[0];
  const edge = connect(ctx, acB, b, 0.6);
  assert.equal(activations(ctx).length, 1);
  assert.equal(edge.getStyle().dashed, true);
});
test("ac \u2192 ac\uFF1A\u666E\u901A\u6D88\u606F\uFF0C\u4E0D\u521B\u5EFA activation\uFF08\u573A\u666F C\uFF09", () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, "A", 0);
  const b = addLifeline(ctx, "B", 300);
  connect(ctx, a, b, 0.2);
  const acB = activations(ctx)[0];
  connect(ctx, b, a, 0.4);
  const acA = activations(ctx).find((v) => v !== acB);
  const edge = connect(ctx, acB, acA, 0.5);
  assert.equal(activations(ctx).length, 2, "ac\u2192ac \u4E0D\u5E94\u521B\u5EFA\u65B0 activation");
  const st = edge.getStyle();
  assert.equal(st.endArrow, "classic");
  assert.notEqual(st.dashed, true);
});
test("ll \u2192 \u540C\u4E00 ll\uFF1A\u751F\u547D\u7EBF\u81EA\u73AF\uFF0C\u56DE\u5F62\u8DEF\u7531\uFF0C\u4E0D\u521B\u5EFA activation\uFF08\u573A\u666F A2\uFF09", () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, "A", 0);
  const edge = connect(ctx, a, a, 0.2);
  const st0 = edge.getStyle();
  ctx.model.setStyle(edge, { ...st0, entryY: 0.4 });
  ctx.fireConnect(edge);
  assert.equal(activations(ctx).length, 0, "\u751F\u547D\u7EBF\u81EA\u73AF\u4E0D\u5E94\u521B\u5EFA activation");
  const st = edge.getStyle();
  assert.equal(st.edgeStyle, "none", "\u5E94\u7981\u7528 obstacle \u8DEF\u7531\uFF0C\u4FDD\u7559\u76F4\u89D2\u6298\u7EBF");
  assert.equal(st.endArrow, "classic");
  const geo = edge.getGeometry();
  assert.ok(geo.points && geo.points.length === 2, "\u5E94\u6709 2 \u4E2A\u822A\u70B9\u5F62\u6210 U \u5F62");
  const llGeo = a.getGeometry();
  const centerX = llGeo.x + llGeo.width / 2;
  const exitAbsY = llGeo.y + 0.2 * llGeo.height;
  const entryAbsY = llGeo.y + 0.4 * llGeo.height;
  assert.equal(geo.points[0].x, centerX + 30);
  assert.equal(geo.points[0].y, exitAbsY);
  assert.equal(geo.points[1].x, centerX + 30);
  assert.equal(geo.points[1].y, entryAbsY);
});
test("lifeline \u62C9\u957F\u540E\uFF0C\u5DF2\u753B\u7684\u6D88\u606F\u7AEF\u70B9\u4FDD\u6301\u539F\u59CB\u7EDD\u5BF9 Y\uFF08\u8FDE\u7EBF\u4ECD\u6C34\u5E73\uFF09", () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, "A", 0);
  const b = addLifeline(ctx, "B", 300);
  const edge = connect(ctx, a, b, 0.2);
  const aGeo0 = a.getGeometry();
  const origMsgY = aGeo0.y + 0.2 * aGeo0.height;
  assert.equal(origMsgY, 180);
  const aGeo = a.getGeometry();
  aGeo.height = 600;
  ctx.fireResize([a]);
  const st = edge.getStyle();
  assert.ok(st.exitAbsY != null, "exitAbsY \u5E94\u5DF2\u5B58\u50A8");
  const newExitAbsY = aGeo.y + st.exitY * aGeo.height;
  assert.ok(Math.abs(newExitAbsY - origMsgY) < 1e-6, `exit \u7AEF\u70B9\u5E94\u4FDD\u6301\u5728 Y=${origMsgY}\uFF0C\u5B9E\u9645 ${newExitAbsY}`);
});
test("\u65E7\u8FB9\uFF08\u65E0 exitAbsY/entryAbsY\uFF09\uFF1Alifeline \u62C9\u957F\u65F6\u7528 prev \u51E0\u4F55\u53CD\u63A8\u7EDD\u5BF9 Y\uFF0C\u8FDE\u7EBF\u4ECD\u6C34\u5E73", () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, "A", 0);
  const b = addLifeline(ctx, "B", 300);
  const edge = new Cell("", new Geometry(), {
    edgeStyle: "none",
    endArrow: "classic",
    exitX: 0.5,
    exitY: 0.2,
    // msgY = 100 + 0.2*400 = 180
    entryX: 0.5,
    entryY: 0.2
  });
  edge.setEdge(true);
  ctx.model.add(ctx.parent, edge);
  ctx.model.setTerminal(edge, a, true);
  ctx.model.setTerminal(edge, b, false);
  const origMsgY = 180;
  const prevA = new Geometry(0, 100, 100, 400);
  const aGeo = a.getGeometry();
  aGeo.height = 600;
  ctx.fireResize([a], [prevA]);
  const st = edge.getStyle();
  assert.equal(st.exitAbsY, 180, "\u5E94\u4ECE prev \u51E0\u4F55\u8865\u5B58 exitAbsY");
  const newExitAbsY = aGeo.y + st.exitY * aGeo.height;
  assert.ok(Math.abs(newExitAbsY - origMsgY) < 1e-6, `exit \u7AEF\u70B9\u5E94\u4FDD\u6301\u5728 Y=${origMsgY}\uFF0C\u5B9E\u9645 ${newExitAbsY}`);
  aGeo.height = 800;
  ctx.fireResize([a]);
  const st2 = edge.getStyle();
  const newExitAbsY2 = aGeo.y + st2.exitY * aGeo.height;
  assert.ok(Math.abs(newExitAbsY2 - origMsgY) < 1e-6, `\u7B2C\u4E8C\u6B21 resize \u540E exit \u7AEF\u70B9\u4ECD\u5E94\u4FDD\u6301 Y=${origMsgY}\uFF0C\u5B9E\u9645 ${newExitAbsY2}`);
});
test("\u751F\u547D\u7EBF\u81EA\u73AF\uFF1A\u62C9\u957F\u751F\u547D\u7EBF\u540E\u56DE\u5F62\u4E24\u7AEF\u4FDD\u6301\u539F\u59CB\u7EDD\u5BF9 Y", () => {
  const ctx = makeGraph();
  const a = addLifeline(ctx, "A", 0);
  const edge = connect(ctx, a, a, 0.2);
  const st0 = edge.getStyle();
  ctx.model.setStyle(edge, { ...st0, entryY: 0.4 });
  ctx.fireConnect(edge);
  const aGeo = a.getGeometry();
  aGeo.height = 600;
  ctx.fireResize([a]);
  const st = edge.getStyle();
  const newExitAbsY = aGeo.y + st.exitY * aGeo.height;
  const newEntryAbsY = aGeo.y + st.entryY * aGeo.height;
  assert.ok(Math.abs(newExitAbsY - 180) < 1e-6, `\u81EA\u73AF exit \u7AEF\u70B9\u5E94\u4FDD\u6301 Y=180\uFF0C\u5B9E\u9645 ${newExitAbsY}`);
  assert.ok(Math.abs(newEntryAbsY - 260) < 1e-6, `\u81EA\u73AF entry \u7AEF\u70B9\u5E94\u4FDD\u6301 Y=260\uFF0C\u5B9E\u9645 ${newEntryAbsY}`);
});
test("actor \u751F\u547D\u7EBF\uFF08umlActor \u5355 cell\uFF09\uFF1A\u62C9\u957F\u540E\u6302\u5728\u4E0A\u9762\u7684\u6D88\u606F\u7AEF\u70B9\u4FDD\u6301\u539F\u59CB\u7EDD\u5BF9 Y", () => {
  const ctx = makeGraph();
  const actor = new Cell("", new Geometry(0, 100, 100, 400), { shape: "umlActor" });
  actor.setId("actor");
  actor.setVertex(true);
  ctx.model.add(ctx.parent, actor);
  const b = addLifeline(ctx, "B", 300);
  const edge = new Cell("", new Geometry(), {
    edgeStyle: "none",
    endArrow: "classic",
    exitX: 0.5,
    exitY: 0.2,
    // msgY = 100 + 0.2*400 = 180
    entryX: 0.5,
    entryY: 0.2
  });
  edge.setEdge(true);
  ctx.model.add(ctx.parent, edge);
  ctx.model.setTerminal(edge, actor, true);
  ctx.model.setTerminal(edge, b, false);
  const prevActor = new Geometry(0, 100, 100, 400);
  const actorGeo = actor.getGeometry();
  actorGeo.height = 900;
  ctx.fireResize([actor], [prevActor]);
  const st = edge.getStyle();
  assert.equal(st.exitAbsY, 180, "\u5E94\u4ECE prev \u51E0\u4F55\u8865\u5B58 exitAbsY");
  const newExitAbsY = actorGeo.y + st.exitY * actorGeo.height;
  assert.ok(Math.abs(newExitAbsY - 180) < 1e-6, `actor \u4E0A\u7684 exit \u7AEF\u70B9\u5E94\u4FDD\u6301 Y=180\uFF0C\u5B9E\u9645 ${newExitAbsY}`);
});
