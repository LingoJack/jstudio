import assert from 'node:assert/strict';
import test from 'node:test';

import { unescapeMarkdownSyntax } from './serializeSliceToMarkdown';

test('unescapeMarkdownSyntax strips the serializer backslash escapes', () => {
  // What @tiptap/markdown 3.27 emits for `a*b_c`d[e]f~g~ 还有 \`:
  // every one of \ ` * _ [ ] ~ is escaped, and the literal backslash is
  // escaped twice (once by encodeHtmlEntities, once by escapeMarkdownSyntax).
  assert.equal(
    unescapeMarkdownSyntax('a\\*b\\_c\\`d\\[e\\]f\\~g\\~ 还有 \\\\'),
    'a*b_c`d[e]f~g~ 还有 \\',
  );
});

test('unescapeMarkdownSyntax leaves block structure and marks alone', () => {
  // Block prefixes and emphasis delimiters are emitted by the serializer
  // itself, never as escapes — they must survive untouched.
  const md = '## 标题\n\n**粗** 与 *斜*\n\n- 项 *1*';
  assert.equal(unescapeMarkdownSyntax(md), md);
});

test('unescapeMarkdownSyntax handles adjacent escapes', () => {
  assert.equal(unescapeMarkdownSyntax('\\*\\*not bold\\*\\*'), '**not bold**');
  assert.equal(unescapeMarkdownSyntax('\\\\\\*'), '\\*');
});

test('unescapeMarkdownSyntax is a no-op on plain prose', () => {
  const md = '一段普通文字，没有需要处理的字符';
  assert.equal(unescapeMarkdownSyntax(md), md);
});
