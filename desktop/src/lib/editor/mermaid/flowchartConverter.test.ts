/**
 * flowchartConverter 的无头测试。
 *
 * 覆盖 Mermaid 导入布局的三块尺寸感知逻辑：
 *   - measureLabel：`<br/>` 切行 + CJK 宽度估算
 *   - wrapLabel：超宽单行折行
 *   - computeNodeSize：按内容定尺寸（菱形 > 矩形）
 *   - layoutNodes：真实尺寸布局无重叠、层级 y 递增
 *   - convertFlowchartToSnapshot：端到端，节点尺寸足以容纳 label
 *
 * 运行：npx tsx --test src/lib/editor/mermaid/flowchartConverter.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  measureLabel,
  wrapLabel,
  computeNodeSize,
  layoutNodes,
  convertFlowchartToSnapshot,
} from './flowchartConverter';
import type { FlowchartData, MermaidVertex, MermaidEdge } from './mermaidParser';
import type { GraphEdge, GraphNode } from '../../../components/editor/nodes/graph/graphSnapshot';

/* ------------------------------------------------------------------ */
/* measureLabel                                                        */
/* ------------------------------------------------------------------ */

test('measureLabel: <br/> 与 \\n 切行', () => {
  const r = measureLabel('format_condition<br/>身份 + condition');
  assert.equal(r.lineCount, 2);

  const r2 = measureLabel('a\nb<br>c');
  assert.equal(r2.lineCount, 3);
});

test('measureLabel: 单行至少 1 行，空串不崩', () => {
  assert.equal(measureLabel('').lineCount, 1);
  assert.equal(measureLabel('hello').lineCount, 1);
  assert.ok(measureLabel('hello').maxWidth > 0);
});

test('measureLabel: CJK 行宽大于同字符数 ASCII', () => {
  const cjk = measureLabel('账号级组织级').maxWidth; // 6 个宽字符
  const ascii = measureLabel('abcdef').maxWidth; // 6 个 ASCII
  assert.ok(cjk > ascii, `CJK ${cjk} 应大于 ASCII ${ascii}`);
});

/* ------------------------------------------------------------------ */
/* wrapLabel                                                           */
/* ------------------------------------------------------------------ */

test('wrapLabel: 短标签原样（<br/> 归一化）', () => {
  assert.equal(wrapLabel('短标签'), '短标签');
  assert.equal(wrapLabel('a<br>b'), 'a<br/>b');
});

test('wrapLabel: 超长单行被折断，每行宽度不超预算', () => {
  const long =
    'token uin=roleId ownerUin=角色归属账号 allow 是准入 gate policy filter deny 优先 SCP 三层串联组织级账号级边界策略';
  const wrapped = wrapLabel(long, 340);
  assert.ok(wrapped.includes('<br/>'), '应发生折行');
  const m = measureLabel(wrapped);
  assert.ok(m.maxWidth <= 340, `折行后最长行 ${m.maxWidth} 应 ≤ 340`);
});

/* ------------------------------------------------------------------ */
/* computeNodeSize                                                     */
/* ------------------------------------------------------------------ */

test('computeNodeSize: 长 label 节点大于默认尺寸', () => {
  const label =
    '③ SCP 三层 cOrganizationExtension<br/>uinType=2 账号级 / 3 组织级 / 1 OU级<br/>串联: 三层皆需 allow';
  const size = computeNodeSize('rectangle', label);
  assert.ok(size.w > 120, `宽 ${size.w} 应 > 120`);
  assert.ok(size.h > 60, `高 ${size.h} 应 > 60`);
  // 尺寸足以容纳文本：w ≥ 估算文本宽
  assert.ok(size.w - 32 >= measureLabel(label).maxWidth);
});

test('computeNodeSize: 同 label 下菱形比矩形大（内接区域补偿）', () => {
  const label = '_has_policy_filter?<br/>type4 + hasPolicyFilter==1';
  const rect = computeNodeSize('rectangle', label);
  const diamond = computeNodeSize('diamond', label);
  assert.ok(diamond.w > rect.w);
  assert.ok(diamond.h > rect.h);
});

test('computeNodeSize: 空 label 回退默认尺寸', () => {
  const size = computeNodeSize('rectangle', '');
  assert.deepEqual(size, { w: 120, h: 60 });
});

/* ------------------------------------------------------------------ */
/* layoutNodes — 用户截图同款 13 节点链式+分支图                          */
/* ------------------------------------------------------------------ */

function makeUserExample(): {
  vertices: Map<string, MermaidVertex>;
  edges: MermaidEdge[];
} {
  const v = (
    id: string,
    text: string,
    type = '',
  ): [string, MermaidVertex] => [
    id,
    { id, labelType: 'text', text, type },
  ];
  const vertices = new Map<string, MermaidVertex>([
    v('FC', 'format_condition<br/>身份 + condition'),
    v('V', 'verifyPermission OV:3480<br/>toVerifyPermission :3500'),
    v(
      'S1',
      '① 身份策略 cExtension<br/>token uin=roleId / ownerUin=角色归属账号<br/>allow 是准入 gate',
    ),
    v('S2', '_has_policy_filter?<br/>type4 + hasPolicyFilter==1', 'diamond'),
    v('S3', '② policyFilter<br/>token 自带策略 · deny 优先'),
    v('S4', 'SCP 路径?<br/>scpAuthCoro :2159', 'diamond'),
    v(
      'S5',
      '③ SCP 三层 cOrganizationExtension<br/>uinType=2 账号级 / 3 组织级 / 1 OU级<br/>串联: 三层皆需 allow',
    ),
    v('S6', '边界策略?<br/>mode 8/16/24', 'diamond'),
    v('S7', '④ cBoundaryExtension<br/>边界策略串联'),
    v('S8', '匿名二次?<br/>checkAuth :1254', 'diamond'),
    v('S9', '⑤ cAnonymousExtension<br/>uin=0 并联 merge'),
    v('R', '交集求值<br/>身份allow ∧ ¬filter_deny ∧ SCP_all_allow ∧ 边界allow'),
    v('O', 'allow / deny · 11008'),
  ]);
  const e = (start: string, end: string, text = ''): MermaidEdge => ({
    start,
    end,
    text,
    type: 'arrow_point',
    labelType: 'text',
    stroke: 'normal',
  });
  const edges: MermaidEdge[] = [
    e('FC', 'V'),
    e('V', 'S1'),
    e('S1', 'S2'),
    e('S2', 'S3', '是'),
    e('S2', 'S4', '否'),
    e('S3', 'S4'),
    e('S4', 'S5', '是'),
    e('S4', 'S6', '否'),
    e('S5', 'S6'),
    e('S6', 'S7', '是'),
    e('S6', 'S8', '否'),
    e('S7', 'S8'),
    e('S8', 'S9', '是 cos/gstor 等'),
    e('S8', 'R', '否'),
    e('S9', 'R'),
    e('R', 'O'),
  ];
  return { vertices, edges };
}

function sizesFor(vertices: Map<string, MermaidVertex>) {
  const sizes = new Map<string, { w: number; h: number }>();
  for (const [id, vertex] of vertices) {
    const shape = vertex.type === 'diamond' ? 'diamond' : 'rectangle';
    sizes.set(id, computeNodeSize(shape, wrapLabel(vertex.text)));
  }
  return sizes;
}

test('layoutNodes: 用户示例图任意两节点不重叠', () => {
  const { vertices, edges } = makeUserExample();
  const sizes = sizesFor(vertices);
  const { positions } = layoutNodes(vertices, edges, 'TB', sizes);

  const ids = Array.from(vertices.keys());
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = { ...positions.get(ids[i])!, ...sizes.get(ids[i])! };
      const b = { ...positions.get(ids[j])!, ...sizes.get(ids[j])! };
      const overlap =
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `节点 ${ids[i]} 与 ${ids[j]} 不应重叠`);
    }
  }
});

test('layoutNodes: TB 布局 y 随拓扑层级递增', () => {
  const { vertices, edges } = makeUserExample();
  const sizes = sizesFor(vertices);
  const { positions } = layoutNodes(vertices, edges, 'TB', sizes);

  // 主链上每条边（非跨层跳过边）的 target.y > source.y
  const chain: Array<[string, string]> = [
    ['FC', 'V'],
    ['V', 'S1'],
    ['S1', 'S2'],
    ['S3', 'S4'],
    ['S5', 'S6'],
    ['S7', 'S8'],
    ['S9', 'R'],
    ['R', 'O'],
  ];
  for (const [from, to] of chain) {
    assert.ok(
      positions.get(to)!.y > positions.get(from)!.y,
      `${to}.y 应大于 ${from}.y`,
    );
  }
});

test('layoutNodes: LR 布局 x 随拓扑层级递增', () => {
  const { vertices, edges } = makeUserExample();
  const sizes = sizesFor(vertices);
  const { positions } = layoutNodes(vertices, edges, 'LR', sizes);
  assert.ok(positions.get('O')!.x > positions.get('FC')!.x);
  assert.ok(positions.get('R')!.x > positions.get('S9')!.x);
});

test('layoutNodes: 环形图不死循环且全部节点有坐标', () => {
  const vertices = new Map<string, MermaidVertex>([
    ['A', { id: 'A', labelType: 'text', text: 'A' }],
    ['B', { id: 'B', labelType: 'text', text: 'B' }],
    ['C', { id: 'C', labelType: 'text', text: 'C' }],
  ]);
  const edges: MermaidEdge[] = [
    { start: 'A', end: 'B', text: '', type: 'arrow_point', labelType: 'text', stroke: 'normal' },
    { start: 'B', end: 'C', text: '', type: 'arrow_point', labelType: 'text', stroke: 'normal' },
    { start: 'C', end: 'A', text: '', type: 'arrow_point', labelType: 'text', stroke: 'normal' },
  ];
  const { positions } = layoutNodes(vertices, edges, 'TB', sizesFor(vertices));
  assert.equal(positions.size, 3);
});

/* ------------------------------------------------------------------ */
/* Sugiyama 布局质量测试                                                 */
/* ------------------------------------------------------------------ */

test('layoutNodes: 长边跨层--中间层节点不挡在长边路径上', () => {
  // A -> D 跨 2 层（A layer0, B/C layer1, D layer2）
  // B 和 C 在中间层，不应被长边 A->D 直接穿过
  const vertices = new Map<string, MermaidVertex>([
    ['A', { id: 'A', labelType: 'text', text: 'Start' }],
    ['B', { id: 'B', labelType: 'text', text: 'Branch B' }],
    ['C', { id: 'C', labelType: 'text', text: 'Branch C' }],
    ['D', { id: 'D', labelType: 'text', text: 'End' }],
  ]);
  const edges: MermaidEdge[] = [
    { start: 'A', end: 'B', text: '', type: 'arrow_point', labelType: 'text', stroke: 'normal' },
    { start: 'A', end: 'C', text: '', type: 'arrow_point', labelType: 'text', stroke: 'normal' },
    { start: 'A', end: 'D', text: '', type: 'arrow_point', labelType: 'text', stroke: 'normal' },
    { start: 'B', end: 'D', text: '', type: 'arrow_point', labelType: 'text', stroke: 'normal' },
    { start: 'C', end: 'D', text: '', type: 'arrow_point', labelType: 'text', stroke: 'normal' },
  ];
  const sizes = sizesFor(vertices);
  const { positions } = layoutNodes(vertices, edges, 'TB', sizes);

  // 所有节点都有坐标
  for (const id of ['A', 'B', 'C', 'D']) {
    assert.ok(positions.has(id), `节点 ${id} 应有坐标`);
  }

  // A 在最顶层，D 在最底层
  assert.ok(positions.get('A')!.y < positions.get('B')!.y, 'A 应在 B 上方');
  assert.ok(positions.get('A')!.y < positions.get('C')!.y, 'A 应在 C 上方');
  assert.ok(positions.get('D')!.y > positions.get('B')!.y, 'D 应在 B 下方');
  assert.ok(positions.get('D')!.y > positions.get('C')!.y, 'D 应在 C 下方');

  // 无重叠
  const ids = ['A', 'B', 'C', 'D'];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = { ...positions.get(ids[i])!, ...sizes.get(ids[i])! };
      const b = { ...positions.get(ids[j])!, ...sizes.get(ids[j])! };
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `节点 ${ids[i]} 与 ${ids[j]} 不应重叠`);
    }
  }
});

test('layoutNodes: 钻石分支--父节点居中于子节点之间', () => {
  // 菱形 D 有两个分支 D->E(是) D->F(否)，D 应大致居中于 E 和 F 之间
  const vertices = new Map<string, MermaidVertex>([
    ['S', { id: 'S', labelType: 'text', text: 'Start' }],
    ['D', { id: 'D', labelType: 'text', text: 'cond?', type: 'diamond' }],
    ['E', { id: 'E', labelType: 'text', text: 'Yes' }],
    ['F', { id: 'F', labelType: 'text', text: 'No' }],
    ['G', { id: 'G', labelType: 'text', text: 'End' }],
  ]);
  const edges: MermaidEdge[] = [
    { start: 'S', end: 'D', text: '', type: 'arrow_point', labelType: 'text', stroke: 'normal' },
    { start: 'D', end: 'E', text: '是', type: 'arrow_point', labelType: 'text', stroke: 'normal' },
    { start: 'D', end: 'F', text: '否', type: 'arrow_point', labelType: 'text', stroke: 'normal' },
    { start: 'E', end: 'G', text: '', type: 'arrow_point', labelType: 'text', stroke: 'normal' },
    { start: 'F', end: 'G', text: '', type: 'arrow_point', labelType: 'text', stroke: 'normal' },
  ];
  const sizes = sizesFor(vertices);
  const { positions } = layoutNodes(vertices, edges, 'TB', sizes);

  const dCenter = positions.get('D')!.x + sizes.get('D')!.w / 2;
  const eCenter = positions.get('E')!.x + sizes.get('E')!.w / 2;
  const fCenter = positions.get('F')!.x + sizes.get('F')!.w / 2;

  // D 的中心应在 E 和 F 的中心之间
  const leftChild = Math.min(eCenter, fCenter);
  const rightChild = Math.max(eCenter, fCenter);
  assert.ok(
    dCenter >= leftChild - 20 && dCenter <= rightChild + 20,
    `D 中心 ${dCenter} 应在 E(${eCenter}) 和 F(${fCenter}) 之间`,
  );

  // G 也应居中于 E 和 F 之间
  const gCenter = positions.get('G')!.x + sizes.get('G')!.w / 2;
  assert.ok(
    gCenter >= leftChild - 20 && gCenter <= rightChild + 20,
    `G 中心 ${gCenter} 应在 E(${eCenter}) 和 F(${fCenter}) 之间`,
  );
});

test('layoutNodes: 单节点不崩', () => {
  const vertices = new Map<string, MermaidVertex>([
    ['A', { id: 'A', labelType: 'text', text: 'Solo' }],
  ]);
  const { positions } = layoutNodes(vertices, [], 'TB', sizesFor(vertices));
  assert.ok(positions.has('A'));
  assert.ok(positions.get('A')!.x >= 0);
  assert.ok(positions.get('A')!.y >= 0);
});

/* ------------------------------------------------------------------ */
/* convertFlowchartToSnapshot 端到端                                     */
/* ------------------------------------------------------------------ */

test('convertFlowchartToSnapshot: 节点尺寸容纳 label，坐标不重叠', () => {
  const { vertices, edges } = makeUserExample();
  const data: FlowchartData = { vertices, edges, subgraphs: [], direction: 'TB' };
  const snap = convertFlowchartToSnapshot(data);

  assert.equal(snap.kind, 'jgraph');
  assert.equal(snap.nodes.length, vertices.size);
  assert.equal(snap.edges.length, edges.length);

  for (const node of snap.nodes) {
    const m = measureLabel(node.label ?? '');
    // 矩形/圆角：w - 32 padding 应容纳最长行；菱形有 1.4 系数，仅断言下限
    if (node.shape === 'rectangle' || node.shape === 'rounded') {
      assert.ok(
        node.w - 32 >= m.maxWidth,
        `节点 ${node.id} 宽 ${node.w} 无法容纳文本宽 ${m.maxWidth}`,
      );
      assert.ok(node.h >= m.lineCount * 18, `节点 ${node.id} 高 ${node.h} 行数不足`);
    }
    // 坐标在正区域
    assert.ok(node.x >= 0 && node.y >= 0);
  }

  // 无重叠
  for (let i = 0; i < snap.nodes.length; i++) {
    for (let j = i + 1; j < snap.nodes.length; j++) {
      const a = snap.nodes[i];
      const b = snap.nodes[j];
      const overlap =
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `节点 ${a.id} 与 ${b.id} 不应重叠`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* 路由不变量：烘焙端口 + 通道航点后，任何边线段不穿过非端点节点            */
/* ------------------------------------------------------------------ */

/** 用户截图同款四层架构拓扑：12 节点 / 14 边，含 2 条跨层长边 */
function makeFourLayerArch(): FlowchartData {
  const v = (id: string, text: string): [string, MermaidVertex] => [
    id,
    { id, labelType: 'text', text },
  ];
  const vertices = new Map<string, MermaidVertex>([
    v('App', '移动App'),
    v('Web', 'Web端'),
    v('Mini', '小程序'),
    v('GW', '网关'),
    v('S1', '服务A'),
    v('S2', '服务B'),
    v('S3', '服务C'),
    v('S4', '服务D'),
    v('DB', '数据库'),
    v('Cache', '缓存'),
    v('MQ', '消息队列'),
    v('ES', '搜索'),
  ]);
  const e = (start: string, end: string): MermaidEdge => ({
    start,
    end,
    text: '',
    type: 'arrow_point',
    labelType: 'text',
    stroke: 'normal',
  });
  const edges: MermaidEdge[] = [
    e('App', 'GW'),
    e('Web', 'GW'),
    e('Mini', 'GW'),
    e('GW', 'S1'),
    e('GW', 'S2'),
    e('GW', 'S3'),
    e('GW', 'S4'),
    e('S1', 'DB'),
    e('S2', 'DB'),
    e('S2', 'ES'),
    e('S3', 'Cache'),
    e('S4', 'MQ'),
    e('GW', 'DB'), // 跨层长边 span=2
    e('App', 'S4'), // 跨层长边 span=2
  ];
  return { vertices, edges, subgraphs: [], direction: 'TB' };
}

type Pt = { x: number; y: number };

/** 两线段严格相交（共线/端点接触不算，避免擦边误判） */
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const cross = (o: Pt, p: Pt, q: Pt) =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** 线段是否与矩形内部相交（严格：贴边/擦角不算） */
function segIntersectsRect(p: Pt, q: Pt, n: GraphNode): boolean {
  const inside = (pt: Pt) =>
    pt.x > n.x && pt.x < n.x + n.w && pt.y > n.y && pt.y < n.y + n.h;
  if (inside(p) || inside(q)) return true;
  const tl = { x: n.x, y: n.y };
  const tr = { x: n.x + n.w, y: n.y };
  const bl = { x: n.x, y: n.y + n.h };
  const br = { x: n.x + n.w, y: n.y + n.h };
  return (
    segmentsCross(p, q, tl, tr) ||
    segmentsCross(p, q, tr, br) ||
    segmentsCross(p, q, br, bl) ||
    segmentsCross(p, q, bl, tl)
  );
}

/**
 * 还原一条边的运行时折线：
 *  - 跨层边：exit 端口点 -> 烘焙航点 -> entry 端口点
 *  - 相邻层边：模拟内置 OrthogonalConnector 的 Z 形路由，
 *    水平段落在相邻层缝隙中点
 */
function edgePolyline(
  edge: GraphEdge,
  nodeById: Map<string, GraphNode>,
  isHorizontal: boolean,
): Pt[] {
  const s = nodeById.get(edge.source)!;
  const t = nodeById.get(edge.target)!;
  const exit: Pt = { x: s.x + edge.exit!.x * s.w, y: s.y + edge.exit!.y * s.h };
  const entry: Pt = { x: t.x + edge.entry!.x * t.w, y: t.y + edge.entry!.y * t.h };
  const pts: Pt[] = [exit];
  if (edge.waypoints && edge.waypoints.length > 0) {
    pts.push(...edge.waypoints);
  } else if (isHorizontal) {
    const midX =
      exit.x <= entry.x ? (s.x + s.w + t.x) / 2 : (s.x + t.x + t.w) / 2;
    pts.push({ x: midX, y: exit.y }, { x: midX, y: entry.y });
  } else {
    const midY =
      exit.y <= entry.y ? (s.y + s.h + t.y) / 2 : (s.y + t.y + t.h) / 2;
    pts.push({ x: exit.x, y: midY }, { x: entry.x, y: midY });
  }
  pts.push(entry);
  // 去除连续重复点（零长线段不参与相交判断）
  return pts.filter((p, i) => {
    const prev = pts[i - 1];
    return !prev || prev.x !== p.x || prev.y !== p.y;
  });
}

/** 核心断言：每条边折线的任何线段不与任何非端点节点的 bbox 相交 */
function assertNoEdgeCrossesNodes(snap: { nodes: GraphNode[]; edges: GraphEdge[] }, direction: string) {
  const nodeById = new Map(snap.nodes.map((n) => [n.id, n]));
  const isHorizontal = direction === 'LR' || direction === 'RL';
  for (const edge of snap.edges) {
    const pts = edgePolyline(edge, nodeById, isHorizontal);
    for (let i = 0; i < pts.length - 1; i++) {
      for (const node of snap.nodes) {
        if (node.id === edge.source || node.id === edge.target) continue;
        assert.ok(
          !segIntersectsRect(pts[i], pts[i + 1], node),
          `边 ${edge.id} 线段(${pts[i].x},${pts[i].y})->(${pts[i + 1].x},${pts[i + 1].y}) 不应穿过节点 ${node.id}`,
        );
      }
    }
  }
}

test('snapshot: 所有边都带 exit/entry 端口约束', () => {
  const snap = convertFlowchartToSnapshot(makeFourLayerArch());
  for (const edge of snap.edges) {
    assert.ok(edge.exit, `边 ${edge.id} 应有 exit 端口`);
    assert.ok(edge.entry, `边 ${edge.id} 应有 entry 端口`);
  }
});

test('snapshot: 跨层边 waypoints 逐段正交（相邻点共享 x 或 y）', () => {
  const snap = convertFlowchartToSnapshot(makeFourLayerArch());
  const withWp = snap.edges.filter((e) => e.waypoints && e.waypoints.length > 0);
  assert.ok(withWp.length >= 2, '应至少有 2 条跨层边带航点');
  for (const edge of withWp) {
    const s = snap.nodes.find((n) => n.id === edge.source)!;
    const t = snap.nodes.find((n) => n.id === edge.target)!;
    const pts: Pt[] = [
      { x: s.x + edge.exit!.x * s.w, y: s.y + edge.exit!.y * s.h },
      ...edge.waypoints!,
      { x: t.x + edge.entry!.x * t.w, y: t.y + edge.entry!.y * t.h },
    ].filter((p, i, arr) => {
      const prev = arr[i - 1];
      return !prev || prev.x !== p.x || prev.y !== p.y;
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const ok = pts[i].x === pts[i + 1].x || pts[i].y === pts[i + 1].y;
      assert.ok(ok, `边 ${edge.id} 第 ${i} 段应正交: (${pts[i].x},${pts[i].y})->(${pts[i + 1].x},${pts[i + 1].y})`);
    }
  }
});

test('snapshot: TB 四层架构图任何边线段不穿过非端点节点', () => {
  const snap = convertFlowchartToSnapshot(makeFourLayerArch());
  assertNoEdgeCrossesNodes(snap, 'TB');
});

test('snapshot: LR 四层架构图任何边线段不穿过非端点节点', () => {
  const data = { ...makeFourLayerArch(), direction: 'LR' };
  const snap = convertFlowchartToSnapshot(data);
  assertNoEdgeCrossesNodes(snap, 'LR');
});

test('snapshot: 用户示例图任何边线段不穿过非端点节点', () => {
  const { vertices, edges } = makeUserExample();
  const snap = convertFlowchartToSnapshot({ vertices, edges, subgraphs: [], direction: 'TB' });
  assertNoEdgeCrossesNodes(snap, 'TB');
});

test('snapshot: 平行边生成不同 id', () => {
  const vertices = new Map<string, MermaidVertex>([
    ['A', { id: 'A', labelType: 'text', text: 'A' }],
    ['B', { id: 'B', labelType: 'text', text: 'B' }],
  ]);
  const e = (): MermaidEdge => ({
    start: 'A',
    end: 'B',
    text: '',
    type: 'arrow_point',
    labelType: 'text',
    stroke: 'normal',
  });
  const snap = convertFlowchartToSnapshot({
    vertices,
    edges: [e(), e()],
    subgraphs: [],
    direction: 'TB',
  });
  assert.equal(snap.edges.length, 2);
  assert.notEqual(snap.edges[0].id, snap.edges[1].id);
});

/* ------------------------------------------------------------------ */
/* 回边外侧环路：截图同款 LR 主链 + 多条回边                                */
/* ------------------------------------------------------------------ */

/** 截图同款：LR 软件流程主链 + 3 条回边（否/否/是） */
function makeFlowWithLoops(): FlowchartData {
  const v = (id: string, text: string, type = ''): [string, MermaidVertex] => [
    id,
    { id, labelType: 'text', text, type },
  ];
  const vertices = new Map<string, MermaidVertex>([
    v('A', '需求分析'),
    v('B', '系统设计'),
    v('C', '编码开发'),
    v('D', '代码审查'),
    v('E', '通过审查?', 'diamond'),
    v('F', '单元测试'),
    v('G', '测试通过?', 'diamond'),
    v('H', '部署上线'),
    v('I', '运维监控'),
    v('J', '发现问题?', 'diamond'),
    v('K', '稳定运行'),
  ]);
  const e = (start: string, end: string, text = ''): MermaidEdge => ({
    start,
    end,
    text,
    type: 'arrow_point',
    labelType: 'text',
    stroke: 'normal',
  });
  const edges: MermaidEdge[] = [
    e('A', 'B'),
    e('B', 'C'),
    e('C', 'D'),
    e('D', 'E'),
    e('E', 'F', '是'),
    e('E', 'C', '否'), // 回边 span=2
    e('F', 'G'),
    e('G', 'H', '是'),
    e('G', 'C', '否'), // 回边 span=4
    e('H', 'I'),
    e('I', 'J'),
    e('J', 'D', '是'), // 回边 span=6
    e('J', 'K', '否'),
  ];
  return { vertices, edges, subgraphs: [], direction: 'LR' };
}

test('snapshot: 回边不参与布局——LR 主链所有节点同一行', () => {
  const snap = convertFlowchartToSnapshot(makeFlowWithLoops());
  const cys = snap.nodes.map((n) => n.y + n.h / 2);
  const min = Math.min(...cys);
  const max = Math.max(...cys);
  assert.ok(max - min < 1, `主链节点中心 y 应一致（差 ${max - min}）`);
});

test('snapshot: 回边走图外侧环路，线段不穿过任何节点', () => {
  const snap = convertFlowchartToSnapshot(makeFlowWithLoops());
  assertNoEdgeCrossesNodes(snap, 'LR');

  // 三条回边（E->C, G->C, J->D）应有烘焙航点且车道在所有节点下方
  const maxBottom = Math.max(...snap.nodes.map((n) => n.y + n.h));
  const loops = snap.edges.filter((e) => e.waypoints && e.waypoints.length > 0);
  assert.equal(loops.length, 3, '应有 3 条回边带环路航点');
  for (const e of loops) {
    const laneY = Math.max(...e.waypoints!.map((p) => p.y));
    assert.ok(laneY > maxBottom, `回边 ${e.id} 车道应在图外（${laneY} <= ${maxBottom}）`);
  }
  // 三条环路车道互不相同的 y（外圈堆叠）
  const laneYs = loops.map((e) => Math.max(...e.waypoints!.map((p) => p.y)));
  assert.equal(new Set(laneYs).size, 3, '三条环路车道应互不重叠');
});

test('snapshot: 共享目标面的回边端口摊开（不共用同一 entry 点）', () => {
  const snap = convertFlowchartToSnapshot(makeFlowWithLoops());
  // E->C 与 G->C 都进入 C 的右侧面（LR 回边 entry x=1；B->C 是前向边 entry x=0）
  const intoC = snap.edges.filter((e) => e.target === 'node-C' && e.entry!.x === 1);
  assert.equal(intoC.length, 2);
  assert.ok(
    intoC[0].entry!.y !== intoC[1].entry!.y,
    `两条回边进入 C 的端口 y 应不同（${intoC[0].entry!.y} vs ${intoC[1].entry!.y}）`,
  );
});

test('snapshot: 回边环路逐段正交', () => {
  const snap = convertFlowchartToSnapshot(makeFlowWithLoops());
  for (const e of snap.edges) {
    if (!e.waypoints || e.waypoints.length === 0) continue;
    const s = snap.nodes.find((n) => n.id === e.source)!;
    const t = snap.nodes.find((n) => n.id === e.target)!;
    const pts = [
      { x: s.x + e.exit!.x * s.w, y: s.y + e.exit!.y * s.h },
      ...e.waypoints,
      { x: t.x + e.entry!.x * t.w, y: t.y + e.entry!.y * t.h },
    ];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.x === b.x && a.y === b.y) continue; // 零长段
      assert.ok(
        a.x === b.x || a.y === b.y,
        `边 ${e.id} 第 ${i} 段应正交: (${a.x},${a.y})->(${b.x},${b.y})`,
      );
    }
  }
});

test('snapshot: TB 方向回边环路同样不穿过节点', () => {
  const data = { ...makeFlowWithLoops(), direction: 'TB' };
  const snap = convertFlowchartToSnapshot(data);
  assertNoEdgeCrossesNodes(snap, 'TB');
  // TB 环路车道在所有节点右侧
  const maxRight = Math.max(...snap.nodes.map((n) => n.x + n.w));
  const loops = snap.edges.filter((e) => e.waypoints && e.waypoints.length > 0);
  assert.equal(loops.length, 3);
  for (const e of loops) {
    const laneX = Math.max(...e.waypoints!.map((p) => p.x));
    assert.ok(laneX > maxRight, `回边 ${e.id} 车道应在图右侧外`);
  }
});
