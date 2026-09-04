import { test } from "node:test";
import assert from "node:assert/strict";
import { INLINE_MATH_SOURCE_RE } from "./inlineMathExtension";

/** Extract the latex of the leftmost match, or null when no match. */
function latexOf(src: string): string | null {
  const m = INLINE_MATH_SOURCE_RE.exec(src);
  return m ? m[1] : null;
}

test("inline math regex matches simple formulas", () => {
  assert.equal(latexOf("$x$"), "x");
  assert.equal(latexOf("euler $e^{i\\pi}$ ok"), "e^{i\\pi}");
  assert.equal(latexOf("$a b$"), "a b", "inner spaces are allowed");
});

test("inline math regex ignores currency-like text", () => {
  // Single dangling $, no closer.
  assert.equal(latexOf("价格 $5"), null);
  // Currency pair: leftmost match must fail, no false positive.
  assert.equal(latexOf("价格 $5 和 $10"), null);
  // Formula later in the string still wins.
  assert.equal(latexOf("价格 $5 和 $10 所以 $x^2$"), "x^2");
  // Space directly after the opener.
  assert.equal(latexOf("$ x$"), null);
});

test("inline math regex does not swallow block-math delimiters", () => {
  // $$x$$ — the $ pairs must not match across the $$ delimiters.
  assert.equal(latexOf("$$x$$"), null);
  assert.equal(latexOf("$$"), null);
});

test("inline math regex honours escaped openers and adjacency", () => {
  assert.equal(latexOf("\\$x$"), null, "escaped opener must not match");
  // $a$$b$ is ambiguous: the first pair is rejected by the (?!\$) closer
  // guard, so the second pair wins and "$a$" stays literal text.
  assert.equal(latexOf("$a$$b$"), "b");
  // A trailing digit right after the closer keeps prose dollars inert.
  assert.equal(latexOf("成本 $x$10"), null);
});

test("inline math regex handles escaped chars inside latex", () => {
  assert.equal(latexOf("$\\alpha\\beta$"), "\\alpha\\beta");
});
