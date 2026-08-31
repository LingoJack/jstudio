/**
 * graphHelpers 花括号相关纯函数测试。
 *
 * 验证智能花括号的朝向选择与落位：
 *   - computeBracePlacement：四个朝向的落位几何
 *   - chooseBraceDirection：默认侧被占时翻转到对侧；两侧都被占保持默认
 *   - rectsOverlap：矩形重叠判定
 *
 * 运行：npx tsx --test src/components/editor/nodes/graph/graphHelpers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  chooseBraceDirection,
  computeBracePlacement,
  rectsOverlap,
} from './graphHelpers';
import { BRACE_GAP, BRACE_THICKNESS } from './graphConstants';

test('down：宽选区下方水平括号', () => {
  const p = computeBracePlacement({ x: 100, y: 50, width: 300, height: 80 }, 'down');
  assert.equal(p.dir, 'down');
  assert.equal(p.x, 100);
  assert.equal(p.y, 50 + 80 + BRACE_GAP);
  assert.equal(p.w, 300);
  assert.equal(p.h, BRACE_THICKNESS);
});

test('up：宽选区上方水平括号', () => {
  const p = computeBracePlacement({ x: 100, y: 50, width: 300, height: 80 }, 'up');
  assert.equal(p.dir, 'up');
  assert.equal(p.x, 100);
  assert.equal(p.y, 50 - BRACE_GAP - BRACE_THICKNESS);
  assert.equal(p.w, 300);
  assert.equal(p.h, BRACE_THICKNESS);
});

test('right：高选区右侧竖直括号', () => {
  const p = computeBracePlacement({ x: 10, y: 20, width: 100, height: 250 }, 'right');
  assert.equal(p.dir, 'right');
  assert.equal(p.x, 10 + 100 + BRACE_GAP);
  assert.equal(p.y, 20);
  assert.equal(p.w, BRACE_THICKNESS);
  assert.equal(p.h, 250);
});

test('left：高选区左侧竖直括号', () => {
  const p = computeBracePlacement({ x: 10, y: 20, width: 100, height: 250 }, 'left');
  assert.equal(p.dir, 'left');
  assert.equal(p.x, 10 - BRACE_GAP - BRACE_THICKNESS);
  assert.equal(p.y, 20);
  assert.equal(p.w, BRACE_THICKNESS);
  assert.equal(p.h, 250);
});

test('chooseBraceDirection：默认侧空闲时用默认侧', () => {
  const dir = chooseBraceDirection(
    { x: 0, y: 0, width: 200, height: 60 },
    () => false,
  );
  assert.equal(dir, 'down');
});

test('chooseBraceDirection：默认侧被占时翻到对侧', () => {
  // 下方被占（如已有另一个花括号）→ 宽选区应翻到 up。
  const dir = chooseBraceDirection(
    { x: 0, y: 0, width: 200, height: 60 },
    (rect) => rect.dir === 'down',
  );
  assert.equal(dir, 'up');
});

test('chooseBraceDirection：两侧都被占保持默认侧', () => {
  const dir = chooseBraceDirection(
    { x: 0, y: 0, width: 200, height: 60 },
    () => true,
  );
  assert.equal(dir, 'down');
});

test('chooseBraceDirection：高选区默认 right，被占翻 left', () => {
  const bounds = { x: 0, y: 0, width: 60, height: 200 };
  assert.equal(chooseBraceDirection(bounds, () => false), 'right');
  assert.equal(
    chooseBraceDirection(bounds, (rect) => rect.dir === 'right'),
    'left',
  );
});

test('rectsOverlap：相交/不相交/边界相接', () => {
  const a = { x: 0, y: 0, width: 100, height: 100 };
  assert.equal(rectsOverlap(a, { x: 50, y: 50, width: 100, height: 100 }), true);
  assert.equal(rectsOverlap(a, { x: 200, y: 0, width: 50, height: 50 }), false);
  // 边界相接（a 右边贴 b 左边）不算重叠
  assert.equal(rectsOverlap(a, { x: 100, y: 0, width: 50, height: 50 }), false);
});
