import test from 'node:test'
import assert from 'node:assert/strict'

import { parseSequenceDiagram, type SeqItem } from './sequenceParser'
import { layoutSequenceDiagram } from './sequenceLayout'

/** 参考截图里的 Token 申请时序图（autonumber + 实线请求 + 虚线返回 + 自环）。 */
const TOKEN_SAMPLE = [
  'sequenceDiagram',
  '    autonumber',
  '    participant A as 客户端',
  '    participant P as APISIX',
  '    participant S as iam-sts',
  '    A->>P: client_id / client_key / uid',
  '    P->>S: 转发票请求',
  '    S->>S: 校验 client_id 与 client_key',
  '    S->>S: 查询 client_id 的授权访问范围',
  '    S-->>P: 返回 token',
  '    P-->>A: 返回 token',
].join('\n')

function flattenItems(items: SeqItem[]): SeqItem[] {
  const out: SeqItem[] = []
  for (const item of items) {
    out.push(item)
    if (item.kind === 'frame') {
      for (const branch of item.frame.branches) out.push(...flattenItems(branch.items))
    }
  }
  return out
}

test('parseSequenceDiagram: 参与者按首次出现顺序，显示名取 as 别名', () => {
  const model = parseSequenceDiagram(TOKEN_SAMPLE)
  assert.ok(model)
  assert.deepEqual(model.actors.map((a) => [a.id, a.display]), [
    ['A', '客户端'],
    ['P', 'APISIX'],
    ['S', 'iam-sts'],
  ])
})

test('parseSequenceDiagram: 消息线型与 autonumber 编号', () => {
  const model = parseSequenceDiagram(TOKEN_SAMPLE)
  assert.ok(model)
  const messages = flattenItems(model.items)
    .filter((i): i is Extract<SeqItem, { kind: 'message' }> => i.kind === 'message')
    .map((i) => i.message)
  assert.equal(messages.length, 6)
  assert.deepEqual(messages.map((m) => m.number), [1, 2, 3, 4, 5, 6])
  assert.equal(messages[0].dashed, false)
  assert.equal(messages[0].arrow, 'filled')
  assert.equal(messages[4].dashed, true)
  assert.equal(messages[4].from, 'S')
  assert.equal(messages[4].to, 'P')
  assert.equal(messages[2].from, messages[2].to)
})

test('parseSequenceDiagram: 非时序图 / 无消息 / 缺头返回 null', () => {
  assert.equal(parseSequenceDiagram('flowchart TD\n    A-->B'), null)
  assert.equal(parseSequenceDiagram('sequenceDiagram\n    participant A'), null)
  assert.equal(parseSequenceDiagram('A->>B: hi'), null)
})

test('parseSequenceDiagram: 激活简写（+B 激活目标，-B 关闭发送方）', () => {
  const model = parseSequenceDiagram([
    'sequenceDiagram',
    '    A->>+B: hello',
    '    B-->>-A: hi',
  ].join('\n'))
  assert.ok(model)
  const messages = flattenItems(model.items)
    .filter((i): i is Extract<SeqItem, { kind: 'message' }> => i.kind === 'message')
    .map((i) => i.message)
  assert.deepEqual(messages[0].activations, [{ actorId: 'B', activate: true }])
  // jison case 71：- 夹在箭头与目标之间时关闭的是 from（这里 from 是 B）。
  assert.deepEqual(messages[1].activations, [{ actorId: 'B', activate: false }])
})

test('parseSequenceDiagram: 帧嵌套与分段（alt/else、loop）', () => {
  const model = parseSequenceDiagram([
    'sequenceDiagram',
    '    A->>B: q',
    '    alt ok',
    '      B-->>A: yes',
    '      loop every 5s',
    '        A->>B: ping',
      '    end',
    '    else bad',
    '      B-->>A: no',
    '    end',
  ].join('\n'))
  assert.ok(model)
  const frames = flattenItems(model.items)
    .filter((i): i is Extract<SeqItem, { kind: 'frame' }> => i.kind === 'frame')
    .map((i) => i.frame)
  assert.equal(frames.length, 2)
  const alt = frames.find((f) => f.kind === 'alt')
  assert.ok(alt)
  assert.equal(alt.branches.length, 2)
  assert.equal(alt.branches[0].label, 'ok')
  assert.equal(alt.branches[1].label, 'bad')
  assert.equal(alt.branches[1].items[0].kind, 'message')
  const loop = frames.find((f) => f.kind === 'loop')
  assert.ok(loop)
  assert.equal(loop.branches[0].label, 'every 5s')
})

test('parseSequenceDiagram: Note over / left of', () => {
  const model = parseSequenceDiagram([
    'sequenceDiagram',
    '    A->>B: q',
    '    Note over A,B: both',
    '    Note left of B: alone',
  ].join('\n'))
  assert.ok(model)
  const notes = flattenItems(model.items)
    .filter((i): i is Extract<SeqItem, { kind: 'note' }> => i.kind === 'note')
    .map((i) => i.note)
  assert.equal(notes.length, 2)
  assert.deepEqual(notes[0], { actorIds: ['A', 'B'], placement: 'over', text: 'both' })
  assert.deepEqual(notes[1], { actorIds: ['B'], placement: 'left', text: 'alone' })
})

test('parseSequenceDiagram: 空白实体解码后不再截断语句', () => {
  const model = parseSequenceDiagram('sequenceDiagram\n    A->>B: a&nbsp;b')
  assert.ok(model)
  const msg = flattenItems(model.items)[0]
  assert.ok(msg.kind === 'message')
  assert.equal(msg.message.text, 'a\u00a0b')
})

test('layoutSequenceDiagram: 参考截图样例的基础几何', () => {
  const model = parseSequenceDiagram(TOKEN_SAMPLE)
  assert.ok(model)
  const layout = layoutSequenceDiagram(model)
  // 三条生命线，x 单调递增；上下两排参与者盒子。
  assert.equal(layout.lifelines.length, 3)
  const xs = layout.lifelines.map((l) => l.x)
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2])
  // 消息 y 严格递增，线端钉在生命线上。
  for (let i = 1; i < layout.messages.length; i++) {
    assert.ok(layout.messages[i].y > layout.messages[i - 1].y)
  }
  const xsSet = new Set(xs)
  for (const msg of layout.messages) {
    if (msg.self) continue
    assert.ok(xsSet.has(msg.x1) && xsSet.has(msg.x2))
  }
  // 自环回路向右伸出。
  const self = layout.messages.find((m) => m.self)
  assert.ok(self?.self)
  assert.ok(self.self.loopW > 0 && self.self.loopH > 0)
  // 返回消息（S->P、P->A）从右往左。
  assert.ok(layout.messages[4].x1 > layout.messages[4].x2)
  // 生命线贯穿顶部盒底到底部盒顶，底部盒子复用同一组 x/w。
  assert.equal(layout.actors.length, 3)
  assert.ok(layout.lifelines[0].bottom > layout.lifelines[0].top)
  assert.equal(layout.bottomY, layout.lifelines[0].bottom)
  assert.ok(layout.height > layout.bottomY)
  assert.ok(layout.width > layout.lifelines[2].x)
})

test('layoutSequenceDiagram: 帧盒子包住内容并带分段虚线', () => {
  const model = parseSequenceDiagram([
    'sequenceDiagram',
    '    A->>B: q',
    '    alt ok',
    '      B-->>A: yes',
    '    else bad',
    '      B-->>A: no',
    '    end',
  ].join('\n'))
  assert.ok(model)
  const layout = layoutSequenceDiagram(model)
  assert.equal(layout.frames.length, 1)
  const frame = layout.frames[0]
  assert.equal(frame.label, 'alt ok')
  assert.equal(frame.dividers.length, 1)
  assert.equal(frame.dividers[0].label, 'bad')
  // messages[0] 是帧外的 q，帧内是 yes / no 两条回复。
  const inner = layout.messages.slice(1)
  assert.equal(inner.length, 2)
  assert.ok(frame.x <= Math.min(...inner.map((msg) => Math.min(msg.x1, msg.x2))))
  assert.ok(frame.y < inner[0].y)
  for (const msg of inner) {
    assert.ok(frame.y + frame.h > msg.y)
  }
})

test('layoutSequenceDiagram: over 注释盒居中于参与者之间', () => {
  const model = parseSequenceDiagram([
    'sequenceDiagram',
    '    A->>B: q',
    '    Note over A,B: both',
  ].join('\n'))
  assert.ok(model)
  const layout = layoutSequenceDiagram(model)
  assert.equal(layout.notes.length, 1)
  const note = layout.notes[0]
  const mid = (layout.lifelines[0].x + layout.lifelines[1].x) / 2
  assert.ok(Math.abs(note.x + note.w / 2 - mid) < 1)
})
