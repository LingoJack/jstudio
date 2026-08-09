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
