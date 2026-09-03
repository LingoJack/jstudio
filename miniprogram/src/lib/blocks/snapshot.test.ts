import test from 'node:test'
import assert from 'node:assert/strict'

import { flattenTiptapText, parseSnapshotBody } from './snapshot'
import type { Block, RichText } from './types'

const text = (t: string): RichText => ({ text: t, annotations: {} })

test('parseSnapshotBody: 顶层 Block 数组', () => {
  const blocks: Block[] = [
    { id: 'b1', type: 'text', content: [text('hello')] },
  ]
  const got = parseSnapshotBody(blocks)
  assert.equal(got.kind, 'blocks')
  if (got.kind === 'blocks') {
    assert.equal(got.blocks.length, 1)
    assert.equal(got.blocks[0].type, 'text')
  }
})

test('parseSnapshotBody: 文档对象 { blocks }', () => {
  const body = { title: 't', emoji: 'e', blocks: [{ id: 'b1', type: 'divider', content: '' }] }
  const got = parseSnapshotBody(body)
  assert.equal(got.kind, 'blocks')
})

test('parseSnapshotBody: JSON 字符串递归一次', () => {
  const body = JSON.stringify({ blocks: [{ id: 'b1', type: 'text', content: [text('x')] }] })
  const got = parseSnapshotBody(body)
  assert.equal(got.kind, 'blocks')
})

test('parseSnapshotBody: 其他形态降级为 raw 并截断', () => {
  const got = parseSnapshotBody({ whatever: 'x'.repeat(5000) })
  assert.equal(got.kind, 'raw')
  if (got.kind === 'raw') {
    assert.ok(got.text.length < 5000)
    assert.ok(got.text.includes('内容过长'))
  }
})

test('parseSnapshotBody: null 降级为空快照提示', () => {
  const got = parseSnapshotBody(null)
  assert.equal(got.kind, 'raw')
})

test('flattenTiptapText: 段落 + 标题 + marks', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: '标题' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '普通' },
          { type: 'text', text: '加粗', marks: [{ type: 'bold' }] },
          { type: 'text', text: '链接', marks: [{ type: 'link', attrs: { href: 'https://a' } }] },
        ],
      },
    ],
  }
  const lines = flattenTiptapText(doc)
  assert.equal(lines.length, 2)
  assert.equal(lines[0].level, 2)
  assert.equal(lines[1].richText[1].annotations.bold, true)
  assert.equal(lines[1].richText[2].annotations.href, 'https://a')
})

test('flattenTiptapText: 列表内容按段落降级', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '条目' }] }] },
        ],
      },
    ],
  }
  const lines = flattenTiptapText(doc)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].richText[0].text, '条目')
})
