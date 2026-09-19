/**
 * Tests for mermaidLifelineFix - the workaround for mermaid's hardcoded
 * `y2="2000"` sequence lifelines (diagrams taller than 2000 user units render
 * with lifelines that stop mid-air).
 *
 * Fixtures mirror the real mermaid 11.x output shape (d3 attribute order:
 * x1/y1/x2/y2 precede class).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixSequenceLifelines } from './mermaidLifelineFix';

const actorLine = (y2: number | string, x = 106) =>
  `<line id="actor0" x1="${x}" y1="65" x2="${x}" y2="${y2}" class="actor-line 200" ` +
  `stroke-width="0.5px" stroke="#999" name="A" data-id="A"/>`;

const messageLine = (y2: number) =>
  `<line class="messageLine1" x1="106" y1="100" x2="520" y2="${y2}" stroke="#333"/>`;

test('extends lifelines that fall short of a tall viewBox bottom', () => {
  const svg =
    `<svg viewBox="-8 -8 1871 3432">${actorLine(2000)}${messageLine(3400)}</svg>`;
  const fixed = fixSequenceLifelines(svg);
  // viewBox bottom 3424 -> y2 becomes 3444 (bottom + overflow)
  assert.match(fixed, /y2="3444"/);
  assert.match(fixed, /class="actor-line 200"/);
});

test('leaves short-diagram lifelines untouched (overflow already clipped)', () => {
  const svg = `<svg viewBox="-8 -8 366 193">${actorLine(2000)}${messageLine(170)}</svg>`;
  assert.equal(fixSequenceLifelines(svg), svg);
});

test('leaves mirrored-actor renders untouched (designed gap below lifelines)', () => {
  // mirrorActors:true renders bottom actor boxes; lifelines end ~75 above
  // the viewBox bottom by design and must not be extended through them.
  const svg = `<svg viewBox="-8 -8 1121 1081">${actorLine(999)}${messageLine(950)}</svg>`;
  assert.equal(fixSequenceLifelines(svg), svg);
});

test('extends only the lifelines, not message lines', () => {
  const svg =
    `<svg viewBox="-8 -8 1871 3432">${actorLine(2000)}${messageLine(2000)}</svg>`;
  const fixed = fixSequenceLifelines(svg);
  assert.match(fixed, /messageLine1[^>]*y2="2000"/);
  assert.match(fixed, /y2="3444" class="actor-line 200"/);
});

test('extends each lifeline; already-long ones are kept', () => {
  const svg =
    `<svg viewBox="0 0 1000 3000">${actorLine(2000, 50)}${actorLine(2990, 400)}` +
    `${actorLine(2000, 700)}</svg>`;
  const fixed = fixSequenceLifelines(svg);
  assert.match(fixed, /x1="50"[^>]*y2="3020"/);
  assert.match(fixed, /x1="400"[^>]*y2="2990"/);
  assert.match(fixed, /x1="700"[^>]*y2="3020"/);
});

test('returns input unchanged when there is no usable viewBox', () => {
  const noViewBox = `<svg>${actorLine(2000)}</svg>`;
  assert.equal(fixSequenceLifelines(noViewBox), noViewBox);
  const malformed = `<svg viewBox="oops">${actorLine(2000)}</svg>`;
  assert.equal(fixSequenceLifelines(malformed), malformed);
});
