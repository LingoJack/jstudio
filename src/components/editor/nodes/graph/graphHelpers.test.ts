/**
 * graphHelpers.computeBracePlacement 的纯函数测试。
 *
 * 验证智能花括号的方向判断与落位：
 *   - 宽选区（width >= height）→ 下方水平括号（⏟），宽 = 选区宽
 *   - 高选区 → 右侧竖直括号（}），高 = 选区高
 *   - 宽高相等归入水平
 *
 * 运行：npx tsx --test src/components/editor/nodes/graph/graphHelpers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeBracePlacement } from './graphHelpers';
import { BRACE_GAP, BRACE_THICKNESS } from './graphConstants';

test('宽选区 → 下方水平括号', () => {
  const p = computeBracePlacement({ x: 100, y: 50, width: 300, height: 80 });
  assert.equal(p.orientation, 'horizontal');
  assert.equal(p.x, 100);
  assert.equal(p.y, 50 + 80 + BRACE_GAP);
  assert.equal(p.w, 300);
  assert.equal(p.h, BRACE_THICKNESS);
});

test('高选区 → 右侧竖直括号', () => {
  const p = computeBracePlacement({ x: 10, y: 20, width: 100, height: 250 });
  assert.equal(p.orientation, 'vertical');
  assert.equal(p.x, 10 + 100 + BRACE_GAP);
  assert.equal(p.y, 20);
  assert.equal(p.w, BRACE_THICKNESS);
  assert.equal(p.h, 250);
});

test('宽高相等归入水平', () => {
  const p = computeBracePlacement({ x: 0, y: 0, width: 120, height: 120 });
  assert.equal(p.orientation, 'horizontal');
});
