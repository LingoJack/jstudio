import { test } from "node:test";
import assert from "node:assert/strict";
import {
  measureLabel,
  wrapLabel,
  computeNodeSize,
  layoutNodes,
  convertFlowchartToSnapshot
} from "./flowchartConverter";
test("measureLabel: <br/> \u4E0E \\n \u5207\u884C", () => {
  const r = measureLabel("format_condition<br/>\u8EAB\u4EFD + condition");
  assert.equal(r.lineCount, 2);
  const r2 = measureLabel("a\nb<br>c");
  assert.equal(r2.lineCount, 3);
});
test("measureLabel: \u5355\u884C\u81F3\u5C11 1 \u884C\uFF0C\u7A7A\u4E32\u4E0D\u5D29", () => {
  assert.equal(measureLabel("").lineCount, 1);
  assert.equal(measureLabel("hello").lineCount, 1);
  assert.ok(measureLabel("hello").maxWidth > 0);
});
test("measureLabel: CJK \u884C\u5BBD\u5927\u4E8E\u540C\u5B57\u7B26\u6570 ASCII", () => {
  const cjk = measureLabel("\u8D26\u53F7\u7EA7\u7EC4\u7EC7\u7EA7").maxWidth;
  const ascii = measureLabel("abcdef").maxWidth;
  assert.ok(cjk > ascii, `CJK ${cjk} \u5E94\u5927\u4E8E ASCII ${ascii}`);
});
test("wrapLabel: \u77ED\u6807\u7B7E\u539F\u6837\uFF08<br/> \u5F52\u4E00\u5316\uFF09", () => {
  assert.equal(wrapLabel("\u77ED\u6807\u7B7E"), "\u77ED\u6807\u7B7E");
  assert.equal(wrapLabel("a<br>b"), "a<br/>b");
});
test("wrapLabel: \u8D85\u957F\u5355\u884C\u88AB\u6298\u65AD\uFF0C\u6BCF\u884C\u5BBD\u5EA6\u4E0D\u8D85\u9884\u7B97", () => {
  const long = "token uin=roleId ownerUin=\u89D2\u8272\u5F52\u5C5E\u8D26\u53F7 allow \u662F\u51C6\u5165 gate policy filter deny \u4F18\u5148 SCP \u4E09\u5C42\u4E32\u8054\u7EC4\u7EC7\u7EA7\u8D26\u53F7\u7EA7\u8FB9\u754C\u7B56\u7565";
  const wrapped = wrapLabel(long, 340);
  assert.ok(wrapped.includes("<br/>"), "\u5E94\u53D1\u751F\u6298\u884C");
  const m = measureLabel(wrapped);
  assert.ok(m.maxWidth <= 340, `\u6298\u884C\u540E\u6700\u957F\u884C ${m.maxWidth} \u5E94 \u2264 340`);
});
test("computeNodeSize: \u957F label \u8282\u70B9\u5927\u4E8E\u9ED8\u8BA4\u5C3A\u5BF8", () => {
  const label = "\u2462 SCP \u4E09\u5C42 cOrganizationExtension<br/>uinType=2 \u8D26\u53F7\u7EA7 / 3 \u7EC4\u7EC7\u7EA7 / 1 OU\u7EA7<br/>\u4E32\u8054: \u4E09\u5C42\u7686\u9700 allow";
  const size = computeNodeSize("rectangle", label);
  assert.ok(size.w > 120, `\u5BBD ${size.w} \u5E94 > 120`);
  assert.ok(size.h > 60, `\u9AD8 ${size.h} \u5E94 > 60`);
  assert.ok(size.w - 32 >= measureLabel(label).maxWidth);
});
test("computeNodeSize: \u540C label \u4E0B\u83F1\u5F62\u6BD4\u77E9\u5F62\u5927\uFF08\u5185\u63A5\u533A\u57DF\u8865\u507F\uFF09", () => {
  const label = "_has_policy_filter?<br/>type4 + hasPolicyFilter==1";
  const rect = computeNodeSize("rectangle", label);
  const diamond = computeNodeSize("diamond", label);
  assert.ok(diamond.w > rect.w);
  assert.ok(diamond.h > rect.h);
});
test("computeNodeSize: \u7A7A label \u56DE\u9000\u9ED8\u8BA4\u5C3A\u5BF8", () => {
  const size = computeNodeSize("rectangle", "");
  assert.deepEqual(size, { w: 120, h: 60 });
});
function makeUserExample() {
  const v = (id, text, type = "") => [
    id,
    { id, labelType: "text", text, type }
  ];
  const vertices = new Map([
    v("FC", "format_condition<br/>\u8EAB\u4EFD + condition"),
    v("V", "verifyPermission OV:3480<br/>toVerifyPermission :3500"),
    v(
      "S1",
      "\u2460 \u8EAB\u4EFD\u7B56\u7565 cExtension<br/>token uin=roleId / ownerUin=\u89D2\u8272\u5F52\u5C5E\u8D26\u53F7<br/>allow \u662F\u51C6\u5165 gate"
    ),
    v("S2", "_has_policy_filter?<br/>type4 + hasPolicyFilter==1", "diamond"),
    v("S3", "\u2461 policyFilter<br/>token \u81EA\u5E26\u7B56\u7565 \xB7 deny \u4F18\u5148"),
    v("S4", "SCP \u8DEF\u5F84?<br/>scpAuthCoro :2159", "diamond"),
    v(
      "S5",
      "\u2462 SCP \u4E09\u5C42 cOrganizationExtension<br/>uinType=2 \u8D26\u53F7\u7EA7 / 3 \u7EC4\u7EC7\u7EA7 / 1 OU\u7EA7<br/>\u4E32\u8054: \u4E09\u5C42\u7686\u9700 allow"
    ),
    v("S6", "\u8FB9\u754C\u7B56\u7565?<br/>mode 8/16/24", "diamond"),
    v("S7", "\u2463 cBoundaryExtension<br/>\u8FB9\u754C\u7B56\u7565\u4E32\u8054"),
    v("S8", "\u533F\u540D\u4E8C\u6B21?<br/>checkAuth :1254", "diamond"),
    v("S9", "\u2464 cAnonymousExtension<br/>uin=0 \u5E76\u8054 merge"),
    v("R", "\u4EA4\u96C6\u6C42\u503C<br/>\u8EAB\u4EFDallow \u2227 \xACfilter_deny \u2227 SCP_all_allow \u2227 \u8FB9\u754Callow"),
    v("O", "allow / deny \xB7 11008")
  ]);
  const e = (start, end, text = "") => ({
    start,
    end,
    text,
    type: "arrow_point",
    labelType: "text",
    stroke: "normal"
  });
  const edges = [
    e("FC", "V"),
    e("V", "S1"),
    e("S1", "S2"),
    e("S2", "S3", "\u662F"),
    e("S2", "S4", "\u5426"),
    e("S3", "S4"),
    e("S4", "S5", "\u662F"),
    e("S4", "S6", "\u5426"),
    e("S5", "S6"),
    e("S6", "S7", "\u662F"),
    e("S6", "S8", "\u5426"),
    e("S7", "S8"),
    e("S8", "S9", "\u662F cos/gstor \u7B49"),
    e("S8", "R", "\u5426"),
    e("S9", "R"),
    e("R", "O")
  ];
  return { vertices, edges };
}
function sizesFor(vertices) {
  const sizes = /* @__PURE__ */ new Map();
  for (const [id, vertex] of vertices) {
    const shape = vertex.type === "diamond" ? "diamond" : "rectangle";
    sizes.set(id, computeNodeSize(shape, wrapLabel(vertex.text)));
  }
  return sizes;
}
test("layoutNodes: \u7528\u6237\u793A\u4F8B\u56FE\u4EFB\u610F\u4E24\u8282\u70B9\u4E0D\u91CD\u53E0", () => {
  const { vertices, edges } = makeUserExample();
  const sizes = sizesFor(vertices);
  const { positions } = layoutNodes(vertices, edges, "TB", sizes);
  const ids = Array.from(vertices.keys());
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = { ...positions.get(ids[i]), ...sizes.get(ids[i]) };
      const b = { ...positions.get(ids[j]), ...sizes.get(ids[j]) };
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `\u8282\u70B9 ${ids[i]} \u4E0E ${ids[j]} \u4E0D\u5E94\u91CD\u53E0`);
    }
  }
});
test("layoutNodes: TB \u5E03\u5C40 y \u968F\u62D3\u6251\u5C42\u7EA7\u9012\u589E", () => {
  const { vertices, edges } = makeUserExample();
  const sizes = sizesFor(vertices);
  const { positions } = layoutNodes(vertices, edges, "TB", sizes);
  const chain = [
    ["FC", "V"],
    ["V", "S1"],
    ["S1", "S2"],
    ["S3", "S4"],
    ["S5", "S6"],
    ["S7", "S8"],
    ["S9", "R"],
    ["R", "O"]
  ];
  for (const [from, to] of chain) {
    assert.ok(
      positions.get(to).y > positions.get(from).y,
      `${to}.y \u5E94\u5927\u4E8E ${from}.y`
    );
  }
});
test("layoutNodes: LR \u5E03\u5C40 x \u968F\u62D3\u6251\u5C42\u7EA7\u9012\u589E", () => {
  const { vertices, edges } = makeUserExample();
  const sizes = sizesFor(vertices);
  const { positions } = layoutNodes(vertices, edges, "LR", sizes);
  assert.ok(positions.get("O").x > positions.get("FC").x);
  assert.ok(positions.get("R").x > positions.get("S9").x);
});
test("layoutNodes: \u73AF\u5F62\u56FE\u4E0D\u6B7B\u5FAA\u73AF\u4E14\u5168\u90E8\u8282\u70B9\u6709\u5750\u6807", () => {
  const vertices = /* @__PURE__ */ new Map([
    ["A", { id: "A", labelType: "text", text: "A" }],
    ["B", { id: "B", labelType: "text", text: "B" }],
    ["C", { id: "C", labelType: "text", text: "C" }]
  ]);
  const edges = [
    { start: "A", end: "B", text: "", type: "arrow_point", labelType: "text", stroke: "normal" },
    { start: "B", end: "C", text: "", type: "arrow_point", labelType: "text", stroke: "normal" },
    { start: "C", end: "A", text: "", type: "arrow_point", labelType: "text", stroke: "normal" }
  ];
  const { positions } = layoutNodes(vertices, edges, "TB", sizesFor(vertices));
  assert.equal(positions.size, 3);
});
test("layoutNodes: \u957F\u8FB9\u8DE8\u5C42--\u4E2D\u95F4\u5C42\u8282\u70B9\u4E0D\u6321\u5728\u957F\u8FB9\u8DEF\u5F84\u4E0A", () => {
  const vertices = /* @__PURE__ */ new Map([
    ["A", { id: "A", labelType: "text", text: "Start" }],
    ["B", { id: "B", labelType: "text", text: "Branch B" }],
    ["C", { id: "C", labelType: "text", text: "Branch C" }],
    ["D", { id: "D", labelType: "text", text: "End" }]
  ]);
  const edges = [
    { start: "A", end: "B", text: "", type: "arrow_point", labelType: "text", stroke: "normal" },
    { start: "A", end: "C", text: "", type: "arrow_point", labelType: "text", stroke: "normal" },
    { start: "A", end: "D", text: "", type: "arrow_point", labelType: "text", stroke: "normal" },
    { start: "B", end: "D", text: "", type: "arrow_point", labelType: "text", stroke: "normal" },
    { start: "C", end: "D", text: "", type: "arrow_point", labelType: "text", stroke: "normal" }
  ];
  const sizes = sizesFor(vertices);
  const { positions } = layoutNodes(vertices, edges, "TB", sizes);
  for (const id of ["A", "B", "C", "D"]) {
    assert.ok(positions.has(id), `\u8282\u70B9 ${id} \u5E94\u6709\u5750\u6807`);
  }
  assert.ok(positions.get("A").y < positions.get("B").y, "A \u5E94\u5728 B \u4E0A\u65B9");
  assert.ok(positions.get("A").y < positions.get("C").y, "A \u5E94\u5728 C \u4E0A\u65B9");
  assert.ok(positions.get("D").y > positions.get("B").y, "D \u5E94\u5728 B \u4E0B\u65B9");
  assert.ok(positions.get("D").y > positions.get("C").y, "D \u5E94\u5728 C \u4E0B\u65B9");
  const ids = ["A", "B", "C", "D"];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = { ...positions.get(ids[i]), ...sizes.get(ids[i]) };
      const b = { ...positions.get(ids[j]), ...sizes.get(ids[j]) };
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `\u8282\u70B9 ${ids[i]} \u4E0E ${ids[j]} \u4E0D\u5E94\u91CD\u53E0`);
    }
  }
});
test("layoutNodes: \u94BB\u77F3\u5206\u652F--\u7236\u8282\u70B9\u5C45\u4E2D\u4E8E\u5B50\u8282\u70B9\u4E4B\u95F4", () => {
  const vertices = /* @__PURE__ */ new Map([
    ["S", { id: "S", labelType: "text", text: "Start" }],
    ["D", { id: "D", labelType: "text", text: "cond?", type: "diamond" }],
    ["E", { id: "E", labelType: "text", text: "Yes" }],
    ["F", { id: "F", labelType: "text", text: "No" }],
    ["G", { id: "G", labelType: "text", text: "End" }]
  ]);
  const edges = [
    { start: "S", end: "D", text: "", type: "arrow_point", labelType: "text", stroke: "normal" },
    { start: "D", end: "E", text: "\u662F", type: "arrow_point", labelType: "text", stroke: "normal" },
    { start: "D", end: "F", text: "\u5426", type: "arrow_point", labelType: "text", stroke: "normal" },
    { start: "E", end: "G", text: "", type: "arrow_point", labelType: "text", stroke: "normal" },
    { start: "F", end: "G", text: "", type: "arrow_point", labelType: "text", stroke: "normal" }
  ];
  const sizes = sizesFor(vertices);
  const { positions } = layoutNodes(vertices, edges, "TB", sizes);
  const dCenter = positions.get("D").x + sizes.get("D").w / 2;
  const eCenter = positions.get("E").x + sizes.get("E").w / 2;
  const fCenter = positions.get("F").x + sizes.get("F").w / 2;
  const leftChild = Math.min(eCenter, fCenter);
  const rightChild = Math.max(eCenter, fCenter);
  assert.ok(
    dCenter >= leftChild - 20 && dCenter <= rightChild + 20,
    `D \u4E2D\u5FC3 ${dCenter} \u5E94\u5728 E(${eCenter}) \u548C F(${fCenter}) \u4E4B\u95F4`
  );
  const gCenter = positions.get("G").x + sizes.get("G").w / 2;
  assert.ok(
    gCenter >= leftChild - 20 && gCenter <= rightChild + 20,
    `G \u4E2D\u5FC3 ${gCenter} \u5E94\u5728 E(${eCenter}) \u548C F(${fCenter}) \u4E4B\u95F4`
  );
});
test("layoutNodes: \u5355\u8282\u70B9\u4E0D\u5D29", () => {
  const vertices = /* @__PURE__ */ new Map([
    ["A", { id: "A", labelType: "text", text: "Solo" }]
  ]);
  const { positions } = layoutNodes(vertices, [], "TB", sizesFor(vertices));
  assert.ok(positions.has("A"));
  assert.ok(positions.get("A").x >= 0);
  assert.ok(positions.get("A").y >= 0);
});
test("convertFlowchartToSnapshot: \u8282\u70B9\u5C3A\u5BF8\u5BB9\u7EB3 label\uFF0C\u5750\u6807\u4E0D\u91CD\u53E0", () => {
  const { vertices, edges } = makeUserExample();
  const data = { vertices, edges, subgraphs: [], direction: "TB" };
  const snap = convertFlowchartToSnapshot(data);
  assert.equal(snap.kind, "jgraph");
  assert.equal(snap.nodes.length, vertices.size);
  assert.equal(snap.edges.length, edges.length);
  for (const node of snap.nodes) {
    const m = measureLabel(node.label ?? "");
    if (node.shape === "rectangle" || node.shape === "rounded") {
      assert.ok(
        node.w - 32 >= m.maxWidth,
        `\u8282\u70B9 ${node.id} \u5BBD ${node.w} \u65E0\u6CD5\u5BB9\u7EB3\u6587\u672C\u5BBD ${m.maxWidth}`
      );
      assert.ok(node.h >= m.lineCount * 18, `\u8282\u70B9 ${node.id} \u9AD8 ${node.h} \u884C\u6570\u4E0D\u8DB3`);
    }
    assert.ok(node.x >= 0 && node.y >= 0);
  }
  for (let i = 0; i < snap.nodes.length; i++) {
    for (let j = i + 1; j < snap.nodes.length; j++) {
      const a = snap.nodes[i];
      const b = snap.nodes[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `\u8282\u70B9 ${a.id} \u4E0E ${b.id} \u4E0D\u5E94\u91CD\u53E0`);
    }
  }
});
function makeFourLayerArch() {
  const v = (id, text) => [
    id,
    { id, labelType: "text", text }
  ];
  const vertices = new Map([
    v("App", "\u79FB\u52A8App"),
    v("Web", "Web\u7AEF"),
    v("Mini", "\u5C0F\u7A0B\u5E8F"),
    v("GW", "\u7F51\u5173"),
    v("S1", "\u670D\u52A1A"),
    v("S2", "\u670D\u52A1B"),
    v("S3", "\u670D\u52A1C"),
    v("S4", "\u670D\u52A1D"),
    v("DB", "\u6570\u636E\u5E93"),
    v("Cache", "\u7F13\u5B58"),
    v("MQ", "\u6D88\u606F\u961F\u5217"),
    v("ES", "\u641C\u7D22")
  ]);
  const e = (start, end) => ({
    start,
    end,
    text: "",
    type: "arrow_point",
    labelType: "text",
    stroke: "normal"
  });
  const edges = [
    e("App", "GW"),
    e("Web", "GW"),
    e("Mini", "GW"),
    e("GW", "S1"),
    e("GW", "S2"),
    e("GW", "S3"),
    e("GW", "S4"),
    e("S1", "DB"),
    e("S2", "DB"),
    e("S2", "ES"),
    e("S3", "Cache"),
    e("S4", "MQ"),
    e("GW", "DB"),
    // 跨层长边 span=2
    e("App", "S4")
    // 跨层长边 span=2
  ];
  return { vertices, edges, subgraphs: [], direction: "TB" };
}
function segmentsCross(a, b, c, d) {
  const cross = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
function segIntersectsRect(p, q, n) {
  const inside = (pt) => pt.x > n.x && pt.x < n.x + n.w && pt.y > n.y && pt.y < n.y + n.h;
  if (inside(p) || inside(q)) return true;
  const tl = { x: n.x, y: n.y };
  const tr = { x: n.x + n.w, y: n.y };
  const bl = { x: n.x, y: n.y + n.h };
  const br = { x: n.x + n.w, y: n.y + n.h };
  return segmentsCross(p, q, tl, tr) || segmentsCross(p, q, tr, br) || segmentsCross(p, q, br, bl) || segmentsCross(p, q, bl, tl);
}
function edgePolyline(edge, nodeById, isHorizontal) {
  const s = nodeById.get(edge.source);
  const t = nodeById.get(edge.target);
  const exit = { x: s.x + edge.exit.x * s.w, y: s.y + edge.exit.y * s.h };
  const entry = { x: t.x + edge.entry.x * t.w, y: t.y + edge.entry.y * t.h };
  const pts = [exit];
  if (edge.waypoints && edge.waypoints.length > 0) {
    pts.push(...edge.waypoints);
  } else if (isHorizontal) {
    const midX = exit.x <= entry.x ? (s.x + s.w + t.x) / 2 : (s.x + t.x + t.w) / 2;
    pts.push({ x: midX, y: exit.y }, { x: midX, y: entry.y });
  } else {
    const midY = exit.y <= entry.y ? (s.y + s.h + t.y) / 2 : (s.y + t.y + t.h) / 2;
    pts.push({ x: exit.x, y: midY }, { x: entry.x, y: midY });
  }
  pts.push(entry);
  return pts.filter((p, i) => {
    const prev = pts[i - 1];
    return !prev || prev.x !== p.x || prev.y !== p.y;
  });
}
function assertNoEdgeCrossesNodes(snap, direction) {
  const nodeById = new Map(snap.nodes.map((n) => [n.id, n]));
  const isHorizontal = direction === "LR" || direction === "RL";
  for (const edge of snap.edges) {
    const pts = edgePolyline(edge, nodeById, isHorizontal);
    for (let i = 0; i < pts.length - 1; i++) {
      for (const node of snap.nodes) {
        if (node.id === edge.source || node.id === edge.target) continue;
        assert.ok(
          !segIntersectsRect(pts[i], pts[i + 1], node),
          `\u8FB9 ${edge.id} \u7EBF\u6BB5(${pts[i].x},${pts[i].y})->(${pts[i + 1].x},${pts[i + 1].y}) \u4E0D\u5E94\u7A7F\u8FC7\u8282\u70B9 ${node.id}`
        );
      }
    }
  }
}
test("snapshot: \u6240\u6709\u8FB9\u90FD\u5E26 exit/entry \u7AEF\u53E3\u7EA6\u675F", () => {
  const snap = convertFlowchartToSnapshot(makeFourLayerArch());
  for (const edge of snap.edges) {
    assert.ok(edge.exit, `\u8FB9 ${edge.id} \u5E94\u6709 exit \u7AEF\u53E3`);
    assert.ok(edge.entry, `\u8FB9 ${edge.id} \u5E94\u6709 entry \u7AEF\u53E3`);
  }
});
test("snapshot: \u8DE8\u5C42\u8FB9 waypoints \u9010\u6BB5\u6B63\u4EA4\uFF08\u76F8\u90BB\u70B9\u5171\u4EAB x \u6216 y\uFF09", () => {
  const snap = convertFlowchartToSnapshot(makeFourLayerArch());
  const withWp = snap.edges.filter((e) => e.waypoints && e.waypoints.length > 0);
  assert.ok(withWp.length >= 2, "\u5E94\u81F3\u5C11\u6709 2 \u6761\u8DE8\u5C42\u8FB9\u5E26\u822A\u70B9");
  for (const edge of withWp) {
    const s = snap.nodes.find((n) => n.id === edge.source);
    const t = snap.nodes.find((n) => n.id === edge.target);
    const pts = [
      { x: s.x + edge.exit.x * s.w, y: s.y + edge.exit.y * s.h },
      ...edge.waypoints,
      { x: t.x + edge.entry.x * t.w, y: t.y + edge.entry.y * t.h }
    ].filter((p, i, arr) => {
      const prev = arr[i - 1];
      return !prev || prev.x !== p.x || prev.y !== p.y;
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const ok = pts[i].x === pts[i + 1].x || pts[i].y === pts[i + 1].y;
      assert.ok(ok, `\u8FB9 ${edge.id} \u7B2C ${i} \u6BB5\u5E94\u6B63\u4EA4: (${pts[i].x},${pts[i].y})->(${pts[i + 1].x},${pts[i + 1].y})`);
    }
  }
});
test("snapshot: TB \u56DB\u5C42\u67B6\u6784\u56FE\u4EFB\u4F55\u8FB9\u7EBF\u6BB5\u4E0D\u7A7F\u8FC7\u975E\u7AEF\u70B9\u8282\u70B9", () => {
  const snap = convertFlowchartToSnapshot(makeFourLayerArch());
  assertNoEdgeCrossesNodes(snap, "TB");
});
test("snapshot: LR \u56DB\u5C42\u67B6\u6784\u56FE\u4EFB\u4F55\u8FB9\u7EBF\u6BB5\u4E0D\u7A7F\u8FC7\u975E\u7AEF\u70B9\u8282\u70B9", () => {
  const data = { ...makeFourLayerArch(), direction: "LR" };
  const snap = convertFlowchartToSnapshot(data);
  assertNoEdgeCrossesNodes(snap, "LR");
});
test("snapshot: \u7528\u6237\u793A\u4F8B\u56FE\u4EFB\u4F55\u8FB9\u7EBF\u6BB5\u4E0D\u7A7F\u8FC7\u975E\u7AEF\u70B9\u8282\u70B9", () => {
  const { vertices, edges } = makeUserExample();
  const snap = convertFlowchartToSnapshot({ vertices, edges, subgraphs: [], direction: "TB" });
  assertNoEdgeCrossesNodes(snap, "TB");
});
test("snapshot: \u5E73\u884C\u8FB9\u751F\u6210\u4E0D\u540C id", () => {
  const vertices = /* @__PURE__ */ new Map([
    ["A", { id: "A", labelType: "text", text: "A" }],
    ["B", { id: "B", labelType: "text", text: "B" }]
  ]);
  const e = () => ({
    start: "A",
    end: "B",
    text: "",
    type: "arrow_point",
    labelType: "text",
    stroke: "normal"
  });
  const snap = convertFlowchartToSnapshot({
    vertices,
    edges: [e(), e()],
    subgraphs: [],
    direction: "TB"
  });
  assert.equal(snap.edges.length, 2);
  assert.notEqual(snap.edges[0].id, snap.edges[1].id);
});
function makeFlowWithLoops() {
  const v = (id, text, type = "") => [
    id,
    { id, labelType: "text", text, type }
  ];
  const vertices = new Map([
    v("A", "\u9700\u6C42\u5206\u6790"),
    v("B", "\u7CFB\u7EDF\u8BBE\u8BA1"),
    v("C", "\u7F16\u7801\u5F00\u53D1"),
    v("D", "\u4EE3\u7801\u5BA1\u67E5"),
    v("E", "\u901A\u8FC7\u5BA1\u67E5?", "diamond"),
    v("F", "\u5355\u5143\u6D4B\u8BD5"),
    v("G", "\u6D4B\u8BD5\u901A\u8FC7?", "diamond"),
    v("H", "\u90E8\u7F72\u4E0A\u7EBF"),
    v("I", "\u8FD0\u7EF4\u76D1\u63A7"),
    v("J", "\u53D1\u73B0\u95EE\u9898?", "diamond"),
    v("K", "\u7A33\u5B9A\u8FD0\u884C")
  ]);
  const e = (start, end, text = "") => ({
    start,
    end,
    text,
    type: "arrow_point",
    labelType: "text",
    stroke: "normal"
  });
  const edges = [
    e("A", "B"),
    e("B", "C"),
    e("C", "D"),
    e("D", "E"),
    e("E", "F", "\u662F"),
    e("E", "C", "\u5426"),
    // 回边 span=2
    e("F", "G"),
    e("G", "H", "\u662F"),
    e("G", "C", "\u5426"),
    // 回边 span=4
    e("H", "I"),
    e("I", "J"),
    e("J", "D", "\u662F"),
    // 回边 span=6
    e("J", "K", "\u5426")
  ];
  return { vertices, edges, subgraphs: [], direction: "LR" };
}
test("snapshot: \u56DE\u8FB9\u4E0D\u53C2\u4E0E\u5E03\u5C40\u2014\u2014LR \u4E3B\u94FE\u6240\u6709\u8282\u70B9\u540C\u4E00\u884C", () => {
  const snap = convertFlowchartToSnapshot(makeFlowWithLoops());
  const cys = snap.nodes.map((n) => n.y + n.h / 2);
  const min = Math.min(...cys);
  const max = Math.max(...cys);
  assert.ok(max - min < 1, `\u4E3B\u94FE\u8282\u70B9\u4E2D\u5FC3 y \u5E94\u4E00\u81F4\uFF08\u5DEE ${max - min}\uFF09`);
});
test("snapshot: \u56DE\u8FB9\u8D70\u56FE\u5916\u4FA7\u73AF\u8DEF\uFF0C\u7EBF\u6BB5\u4E0D\u7A7F\u8FC7\u4EFB\u4F55\u8282\u70B9", () => {
  const snap = convertFlowchartToSnapshot(makeFlowWithLoops());
  assertNoEdgeCrossesNodes(snap, "LR");
  const maxBottom = Math.max(...snap.nodes.map((n) => n.y + n.h));
  const loops = snap.edges.filter((e) => e.waypoints && e.waypoints.length > 0);
  assert.equal(loops.length, 3, "\u5E94\u6709 3 \u6761\u56DE\u8FB9\u5E26\u73AF\u8DEF\u822A\u70B9");
  for (const e of loops) {
    const laneY = Math.max(...e.waypoints.map((p) => p.y));
    assert.ok(laneY > maxBottom, `\u56DE\u8FB9 ${e.id} \u8F66\u9053\u5E94\u5728\u56FE\u5916\uFF08${laneY} <= ${maxBottom}\uFF09`);
  }
  const laneYs = loops.map((e) => Math.max(...e.waypoints.map((p) => p.y)));
  assert.equal(new Set(laneYs).size, 3, "\u4E09\u6761\u73AF\u8DEF\u8F66\u9053\u5E94\u4E92\u4E0D\u91CD\u53E0");
});
test("snapshot: \u5171\u4EAB\u76EE\u6807\u9762\u7684\u56DE\u8FB9\u7AEF\u53E3\u644A\u5F00\uFF08\u4E0D\u5171\u7528\u540C\u4E00 entry \u70B9\uFF09", () => {
  const snap = convertFlowchartToSnapshot(makeFlowWithLoops());
  const intoC = snap.edges.filter((e) => e.target === "node-C" && e.entry.x === 1);
  assert.equal(intoC.length, 2);
  assert.ok(
    intoC[0].entry.y !== intoC[1].entry.y,
    `\u4E24\u6761\u56DE\u8FB9\u8FDB\u5165 C \u7684\u7AEF\u53E3 y \u5E94\u4E0D\u540C\uFF08${intoC[0].entry.y} vs ${intoC[1].entry.y}\uFF09`
  );
});
test("snapshot: \u56DE\u8FB9\u73AF\u8DEF\u9010\u6BB5\u6B63\u4EA4", () => {
  const snap = convertFlowchartToSnapshot(makeFlowWithLoops());
  for (const e of snap.edges) {
    if (!e.waypoints || e.waypoints.length === 0) continue;
    const s = snap.nodes.find((n) => n.id === e.source);
    const t = snap.nodes.find((n) => n.id === e.target);
    const pts = [
      { x: s.x + e.exit.x * s.w, y: s.y + e.exit.y * s.h },
      ...e.waypoints,
      { x: t.x + e.entry.x * t.w, y: t.y + e.entry.y * t.h }
    ];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.x === b.x && a.y === b.y) continue;
      assert.ok(
        a.x === b.x || a.y === b.y,
        `\u8FB9 ${e.id} \u7B2C ${i} \u6BB5\u5E94\u6B63\u4EA4: (${a.x},${a.y})->(${b.x},${b.y})`
      );
    }
  }
});
test("snapshot: TB \u65B9\u5411\u56DE\u8FB9\u73AF\u8DEF\u540C\u6837\u4E0D\u7A7F\u8FC7\u8282\u70B9", () => {
  const data = { ...makeFlowWithLoops(), direction: "TB" };
  const snap = convertFlowchartToSnapshot(data);
  assertNoEdgeCrossesNodes(snap, "TB");
  const maxRight = Math.max(...snap.nodes.map((n) => n.x + n.w));
  const loops = snap.edges.filter((e) => e.waypoints && e.waypoints.length > 0);
  assert.equal(loops.length, 3);
  for (const e of loops) {
    const laneX = Math.max(...e.waypoints.map((p) => p.x));
    assert.ok(laneX > maxRight, `\u56DE\u8FB9 ${e.id} \u8F66\u9053\u5E94\u5728\u56FE\u53F3\u4FA7\u5916`);
  }
});
