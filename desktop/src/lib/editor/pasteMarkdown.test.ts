import assert from 'node:assert/strict';
import test from 'node:test';

import type { JSONContent } from '@tiptap/core';

import { decodeMarkdownEntities } from './pasteMarkdown';

test('decodeMarkdownEntities decodes named and numeric entities in text', () => {
  const json: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a&nbsp;b &#160; &#x41; &hellip; &mdash;' },
        ],
      },
    ],
  };
  decodeMarkdownEntities(json);
  assert.equal(
    json.content?.[0]?.content?.[0]?.text,
    'a\u00A0b \u00A0 A … —',
  );
});

test('decodeMarkdownEntities recurses into table cells', () => {
  const json: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: '&nbsp;&nbsp;a. indented' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  decodeMarkdownEntities(json);
  const cell = json.content?.[0]?.content?.[0]?.content?.[0];
  const paragraph = cell?.content?.[0];
  assert.equal(paragraph?.content?.[0]?.text, '\u00A0\u00A0a. indented');
});

test('decodeMarkdownEntities leaves unknown entities untouched', () => {
  const json: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '&foobar; &notanentity' }],
      },
    ],
  };
  decodeMarkdownEntities(json);
  assert.equal(
    json.content?.[0]?.content?.[0]?.text,
    '&foobar; &notanentity',
  );
});

test('decodeMarkdownEntities never double-decodes lt/gt/quot/amp', () => {
  // Upstream (@tiptap/core) already decoded these once (e.g. `&amp;lt;`
  // became the literal text "&lt;"). Decoding again would corrupt it.
  const json: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '&lt; &gt; &quot; &amp;' }],
      },
    ],
  };
  decodeMarkdownEntities(json);
  assert.equal(
    json.content?.[0]?.content?.[0]?.text,
    '&lt; &gt; &quot; &amp;',
  );
});

test('decodeMarkdownEntities skips codeBlock content', () => {
  const json: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'codeBlock',
        content: [{ type: 'text', text: '&nbsp;&nbsp;stay literal' }],
      },
    ],
  };
  decodeMarkdownEntities(json);
  assert.equal(
    json.content?.[0]?.content?.[0]?.text,
    '&nbsp;&nbsp;stay literal',
  );
});

test('decodeMarkdownEntities skips inline code marks', () => {
  const json: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '&nbsp;',
            marks: [{ type: 'code' }],
          },
          { type: 'text', text: '&nbsp;' },
        ],
      },
    ],
  };
  decodeMarkdownEntities(json);
  const [codeText, plainText] = json.content?.[0]?.content ?? [];
  assert.equal(codeText?.text, '&nbsp;');
  assert.equal(plainText?.text, '\u00A0');
});

test('decodeMarkdownEntities leaves out-of-range numeric references as-is', () => {
  const json: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '&#x110000; &#99999999;' }],
      },
    ],
  };
  decodeMarkdownEntities(json);
  assert.equal(
    json.content?.[0]?.content?.[0]?.text,
    '&#x110000; &#99999999;',
  );
});
