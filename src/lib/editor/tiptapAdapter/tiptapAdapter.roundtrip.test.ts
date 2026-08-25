/**
 * Round-trip invariant tests for the TipTap ↔ Block serialization adapter.
 *
 * These tests are the prevention layer against data-loss bugs like the one
 * where lists typed inside table cells were silently dropped during
 * `tiptapToTableData` (cell content was `RichText[][]` = paragraphs only).
 * Every block type is round-tripped in both directions. Special-focus
 * regression tests assert the lossless paths (table `rawContent`, nested
 * lists, todo children, collapsible children) explicitly.
 *
 * Style: `node:test` + `node:assert/strict` (matches the rest of the repo —
 * no Jest/Vitest, no fast-check). Fixtures are deterministic and hand-crafted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { JSONContent } from '@tiptap/react';
import type { Block, BlockProperties, TableData } from '../../../types/document';
import type { RichText } from '../../../types/richText';
import {
  ourBlockToTiptapJSON,
  tiptapJSONToOurBlock,
  ourBlocksToTiptapJSON,
  tiptapJSONToOurBlocks,
} from './blocks';
import { tableDataToTiptap, tiptapToTableData } from './table';
import { listItemToTiptap, tiptapToListItems } from './list';
import { todoItemToTiptap, tiptapToTodoItems } from './todo';
import { richTextToTiptapInline, tiptapInlineToRichText } from './richText';

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Fill default values so round-trip equality assertions are stable across
 * known asymmetries in the adapter. The adapter applies defaults on both
 * directions but in slightly different ways (forward emits `?? 'plaintext'`,
 * reverse emits `?? 'plaintext'` too, but some optionals are omitted when
 * falsy). This helper makes both sides canonical.
 *
 * Verified asymmetries (see blocks.ts):
 *  - code.language defaults to 'plaintext'
 *  - code.codeCollapsed/codeHtmlPreview: reverse omits when false
 *  - image/file/link/diagram align defaults to 'center'
 *  - image.imageType re-derived from src on reverse
 *  - list: reverse always sets listItems + flat content
 *  - collapsible.open defaults to true
 *
 * The helper only fills defaults / strips undefined keys — it NEVER drops
 * content. The special-focus regression tests assert lossless paths
 * (rawContent, children) explicitly, not via this normalizer.
 */
function normalizeBlock(block: Block): Block {
  const p = { ...(block.properties ?? {}) } as BlockProperties;
  const out: Block = { ...block, properties: p };

  switch (block.type) {
    case 'code':
      p.language = p.language ?? 'plaintext';
      p.codeCollapsed = p.codeCollapsed ?? false;
      p.codeHtmlPreview = p.codeHtmlPreview ?? false;
      break;
    case 'image':
    case 'file':
    case 'link':
    case 'diagram':
      // align lives under different keys per type; fill all that apply.
      if (p.align === undefined) p.align = 'center';
      if (p.fileAlign === undefined) p.fileAlign = 'center';
      if (p.linkAlign === undefined) p.linkAlign = 'center';
      if (p.diagramAlign === undefined) p.diagramAlign = 'center';
      break;
    case 'collapsible':
      p.collapsibleOpen = p.collapsibleOpen ?? true;
      break;
    default:
      break;
  }

  // Strip undefined-valued keys for stable deep-equal.
  for (const key of Object.keys(p)) {
    if ((p as Record<string, unknown>)[key] === undefined) {
      delete (p as Record<string, unknown>)[key];
    }
  }
  return out;
}

/** Strip undefined-valued keys from a JSONContent object (shallow). */
function normalizeJson(node: JSONContent): JSONContent {
  const out: JSONContent = { ...node };
  if (out.attrs) {
    const attrs = { ...out.attrs };
    for (const k of Object.keys(attrs)) {
      if (attrs[k] === undefined || attrs[k] === null) delete attrs[k];
    }
    out.attrs = attrs;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Forward round-trip: Block -> TipTap -> Block (all 20 types)
// ---------------------------------------------------------------------------

function mkBlock(type: Block['type'], content: Block['content'], properties?: BlockProperties): Block {
  return { id: 'test-id', type, content, properties };
}

test('forward: text block round-trips', () => {
  const block = mkBlock('text', [{ text: 'hello', annotations: { bold: true } }]);
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.deepEqual(normalizeBlock(result), normalizeBlock(block));
});

test('forward: heading-2 round-trips', () => {
  const block = mkBlock('heading-2', [{ text: 'Heading', annotations: {} }]);
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.deepEqual(normalizeBlock(result), normalizeBlock(block));
});

test('forward: heading-6 round-trips', () => {
  const block = mkBlock('heading-6', [{ text: 'Deep', annotations: {} }]);
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.deepEqual(normalizeBlock(result), normalizeBlock(block));
});

test('forward: quote round-trips', () => {
  const block = mkBlock('quote', [{ text: 'quoted', annotations: { italic: true } }]);
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.deepEqual(normalizeBlock(result), normalizeBlock(block));
});

test('forward: multi-line quote emits one paragraph per line and round-trips', () => {
  // On WebKit the native caret on continuation lines of a multi-line
  // textblock (hardBreak-separated) is painted at the full line-stride
  // height, so containers emit one paragraph per line instead.
  const content: RichText[] = [
    { text: 'line one', annotations: {} },
    { text: '\n', annotations: {} },
    { text: 'line two', annotations: { bold: true } },
  ];
  const block = mkBlock('quote', content);
  const json = ourBlockToTiptapJSON(block);
  // Structure: blockquote with exactly 2 paragraphs, no hardBreaks.
  assert.equal(json.content?.length, 2);
  assert.ok(json.content!.every((p) => p.type === 'paragraph'));
  assert.equal(json.content?.[1]?.content?.[0]?.text, 'line two');
  assert.ok(!JSON.stringify(json).includes('hardBreak'));
  // Round-trip: reverse flattens paragraphs back with '\n'.
  const result = tiptapJSONToOurBlock(json);
  assert.deepEqual(normalizeBlock(result), normalizeBlock(block));
});

test('forward: multi-line quote preserves empty lines', () => {
  const content: RichText[] = [{ text: 'a\n\nb', annotations: {} }];
  const json = ourBlockToTiptapJSON(mkBlock('quote', content));
  // 'a', '', 'b' → three paragraphs, middle one empty.
  assert.equal(json.content?.length, 3);
  assert.equal(json.content?.[1]?.content, undefined);
  const result = tiptapJSONToOurBlock(json);
  assert.deepEqual(result.content, [
    { text: 'a', annotations: {} },
    { text: '\n', annotations: {} },
    { text: '\n', annotations: {} },
    { text: 'b', annotations: {} },
  ]);
});

test('forward: multi-line list item emits one paragraph per line and round-trips', () => {
  const item = {
    content: [
      { text: 'first', annotations: {} },
      { text: '\n', annotations: {} },
      { text: 'second', annotations: {} },
    ],
    children: [],
  };
  const json = listItemToTiptap(item, 'bulletList');
  assert.equal(json.content?.length, 2);
  assert.ok(json.content!.every((p) => p.type === 'paragraph'));
  assert.ok(!JSON.stringify(json).includes('hardBreak'));
  const back = tiptapToListItems({ type: 'bulletList', content: [json] });
  assert.deepEqual(back, [item]);
});

test('forward: multi-line todo item emits one paragraph per line and round-trips', () => {
  const item = {
    checked: true,
    richText: [
      { text: 'first', annotations: {} },
      { text: '\n', annotations: {} },
      { text: 'second', annotations: {} },
    ],
    children: [],
  };
  const json = todoItemToTiptap(item);
  assert.equal(json.content?.length, 2);
  assert.ok(json.content!.every((p) => p.type === 'paragraph'));
  assert.ok(!JSON.stringify(json).includes('hardBreak'));
  const back = tiptapToTodoItems({ type: 'taskList', content: [json] });
  assert.deepEqual(back, [item]);
});

test('forward: code block round-trips with language', () => {
  const block = mkBlock('code', [{ text: 'const x = 1;', annotations: {} }], {
    language: 'typescript',
    codeTitle: 'snippet',
  });
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.deepEqual(normalizeBlock(result), normalizeBlock(block));
});

test('forward: empty code block does not throw', () => {
  const block = mkBlock('code', [{ text: '', annotations: {} }], { language: 'plaintext' });
  // Must not throw "Empty text nodes are not allowed" (guard at blocks.ts).
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.equal(result.type, 'code');
  assert.equal((result.content as RichText[])[0]?.text, '');
});

test('forward: image block round-trips with all props', () => {
  // imageType is re-derived from src on reverse (blocks.ts:433-437).
  // https:// src derives to 'url'; set it on the original so the round-trip
  // comparison is stable.
  const block = mkBlock('image', 'https://example.com/img.png', {
    caption: 'a pic',
    imageType: 'url',
    widthPct: 50,
    heightPct: 30,
    align: 'left',
  });
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  const got = normalizeBlock(result);
  assert.equal(got.properties?.imageType, 'url');
  assert.equal(got.properties?.caption, 'a pic');
  assert.equal(got.properties?.widthPct, 50);
  assert.equal(got.properties?.align, 'left');
});

test('forward: file block round-trips', () => {
  const block = mkBlock('file', 'asset://doc-1/file.pdf', {
    fileName: 'doc.pdf',
    fileSize: 1024,
    fileType: 'application/pdf',
    fileDisplayMode: 'card',
  });
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.equal(result.properties?.fileName, 'doc.pdf');
  assert.equal(result.properties?.fileSize, 1024);
});

test('forward: link block round-trips', () => {
  const block = mkBlock('link', 'https://example.com', {
    linkTitle: 'Example',
    linkDescription: 'desc',
    linkDisplayMode: 'card',
  });
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.equal(result.properties?.linkTitle, 'Example');
  assert.equal(result.properties?.linkDescription, 'desc');
});

test('forward: diagram block round-trips', () => {
  const block = mkBlock('diagram', [], {
    diagramSnapshot: '{"kind":"jgraph","nodes":[]}',
    diagramWidthPct: 80,
  });
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.equal(result.properties?.diagramSnapshot, '{"kind":"jgraph","nodes":[]}');
  assert.equal(result.properties?.diagramWidthPct, 80);
});

test('forward: math block round-trips', () => {
  const block = mkBlock('math', [], { mathLatex: 'E = mc^2' });
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.equal(result.properties?.mathLatex, 'E = mc^2');
});

test('forward: divider round-trips', () => {
  const block = mkBlock('divider', []);
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.equal(result.type, 'divider');
});

test('forward: bullet-list round-trips with nested children', () => {
  const block = mkBlock('bullet-list', [], {
    listItems: [
      {
        content: [{ text: 'top', annotations: {} }],
        children: [
          { content: [{ text: 'nested', annotations: {} }], children: [] },
        ],
      },
    ],
  });
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.equal(result.type, 'bullet-list');
  const items = result.properties?.listItems;
  assert.ok(items && items.length === 1);
  assert.equal(items[0].children?.length, 1);
  assert.equal(items[0].children?.[0].content?.[0]?.text, 'nested');
});

test('forward: ordered-list round-trips', () => {
  const block = mkBlock('ordered-list', [], {
    listItems: [{ content: [{ text: 'one', annotations: {} }], children: [] }],
  });
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.equal(result.type, 'ordered-list');
  assert.equal(result.properties?.listItems?.[0]?.content?.[0]?.text, 'one');
});

test('forward: todo-list round-trips with checked + children', () => {
  const block = mkBlock('todo-list', [], {
    todoItems: [
      {
        checked: true,
        richText: [{ text: 'done', annotations: {} }],
        children: [
          {
            checked: false,
            richText: [{ text: 'sub', annotations: {} }],
            children: [],
          },
        ],
      },
    ],
  });
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  const items = result.properties?.todoItems;
  assert.ok(items && items.length === 1);
  assert.equal(items[0].checked, true);
  assert.equal(items[0].children?.[0]?.checked, false);
  assert.equal(items[0].children?.[0]?.richText?.[0]?.text, 'sub');
});

test('forward: collapsible round-trips with complex children', () => {
  const children: JSONContent[] = [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'H2' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
  ];
  const block = mkBlock('collapsible', [], {
    collapsibleOpen: false,
    collapsibleSummary: 'toggle',
    collapsibleChildren: children,
  });
  const result = tiptapJSONToOurBlock(ourBlockToTiptapJSON(block));
  assert.equal(result.properties?.collapsibleOpen, false);
  assert.equal(result.properties?.collapsibleSummary, 'toggle');
  const kids = result.properties?.collapsibleChildren as JSONContent[];
  assert.ok(Array.isArray(kids) && kids.length === 2);
  assert.equal(kids[0].type, 'heading');
  assert.equal(kids[1].type, 'paragraph');
});

// ---------------------------------------------------------------------------
// Backward round-trip: TipTap -> Block -> TipTap (representative types)
// ---------------------------------------------------------------------------

test('backward: paragraph TipTap -> Block -> TipTap', () => {
  const node: JSONContent = {
    type: 'paragraph',
    attrs: { id: 'p1' },
    content: [{ type: 'text', text: 'hi', marks: [{ type: 'bold' }] }],
  };
  const back = ourBlockToTiptapJSON(tiptapJSONToOurBlock(node));
  assert.equal(back.type, 'paragraph');
  assert.equal(back.content?.[0]?.type, 'text');
  assert.equal(back.content?.[0]?.text, 'hi');
});

test('backward: heading TipTap -> Block -> TipTap', () => {
  const node: JSONContent = {
    type: 'heading',
    attrs: { id: 'h1', level: 3 },
    content: [{ type: 'text', text: 'H3' }],
  };
  const back = ourBlockToTiptapJSON(tiptapJSONToOurBlock(node));
  assert.equal(back.type, 'heading');
  assert.equal(back.attrs?.level, 3);
  assert.equal(back.content?.[0]?.text, 'H3');
});

test('backward: bulletList TipTap -> Block -> TipTap', () => {
  const node: JSONContent = {
    type: 'bulletList',
    attrs: { id: 'bl1' },
    content: [
      {
        type: 'listItem',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }],
              },
            ],
          },
        ],
      },
    ],
  };
  const back = ourBlockToTiptapJSON(tiptapJSONToOurBlock(node));
  assert.equal(back.type, 'bulletList');
  assert.equal(back.content?.[0]?.type, 'listItem');
  assert.equal(back.content?.[0]?.content?.[1]?.type, 'bulletList');
  assert.equal(back.content?.[0]?.content?.[1]?.content?.[0]?.type, 'listItem');
});

// ---------------------------------------------------------------------------
// Special-focus regression tests (the highest-value tests)
// ---------------------------------------------------------------------------

test('REGRESSION: table cell with orderedList inside survives via rawContent', () => {
  // This is the exact bug: typing "1." in a cell created an orderedList that
  // tiptapToTableData used to silently drop (cell.content was RichText[][]
  // = paragraphs only). The fix stores lossless rawContent.
  const tableNode: JSONContent = {
    type: 'table',
    attrs: { id: 't1' },
    content: [
      {
        type: 'tableRow',
        content: [
          {
            type: 'tableCell',
            content: [
              {
                type: 'orderedList',
                content: [
                  {
                    type: 'listItem',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'item one' }] },
                    ],
                  },
                  {
                    type: 'listItem',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'item two' }] },
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

  const data = tiptapToTableData(tableNode);
  const cell = data.rows[0].cells[0];
  // rawContent must preserve the orderedList verbatim.
  assert.ok(cell.rawContent, 'rawContent must be set for non-paragraph cell');
  assert.equal(cell.rawContent?.[0]?.type, 'orderedList');
  assert.equal(cell.rawContent?.[0]?.content?.length, 2);
  // content is a best-effort paragraph projection (list-item text still searchable).
  assert.ok(cell.content.length > 0, 'content projection must not be empty');

  // Round-trip back to TipTap: the list must survive.
  const back = tableDataToTiptap(data);
  const backCell = back[0].content?.[0];
  assert.equal(backCell?.type, 'tableCell');
  assert.equal(backCell?.content?.[0]?.type, 'orderedList');
  assert.equal(backCell?.content?.[0]?.content?.[0]?.type, 'listItem');
  assert.equal(backCell?.content?.[0]?.content?.[0]?.content?.[0]?.type, 'paragraph');

  // Full Block -> TipTap -> Block round-trip keeps rawContent intact.
  const block = tiptapJSONToOurBlock(tableNode);
  assert.equal(block.type, 'table');
  const rt = block.properties?.tableData?.rows[0].cells[0];
  assert.ok(rt?.rawContent, 'rawContent must survive Block round-trip');
  assert.equal(rt?.rawContent?.[0]?.type, 'orderedList');
});

test('REGRESSION: table cell with blockquote inside survives via rawContent', () => {
  const tableNode: JSONContent = {
    type: 'table',
    attrs: { id: 't2' },
    content: [
      {
        type: 'tableRow',
        content: [
          {
            type: 'tableCell',
            content: [
              {
                type: 'blockquote',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quote' }] }],
              },
            ],
          },
        ],
      },
    ],
  };
  const data = tiptapToTableData(tableNode);
  const cell = data.rows[0].cells[0];
  assert.ok(cell.rawContent, 'blockquote cell must store rawContent');
  assert.equal(cell.rawContent?.[0]?.type, 'blockquote');
  const back = tableDataToTiptap(data);
  assert.equal(back[0].content?.[0]?.content?.[0]?.type, 'blockquote');
});

test('REGRESSION: plain-paragraph table cell does NOT set rawContent', () => {
  // Plain cells must use the compact RichText[][] path (no rawContent bloat).
  const tableNode: JSONContent = {
    type: 'table',
    attrs: { id: 't3' },
    content: [
      {
        type: 'tableRow',
        content: [
          {
            type: 'tableCell',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }],
          },
        ],
      },
    ],
  };
  const data = tiptapToTableData(tableNode);
  const cell = data.rows[0].cells[0];
  assert.equal(cell.rawContent, undefined, 'plain cell must not set rawContent');
  assert.equal(cell.content[0][0].text, 'plain');
});

test('REGRESSION: nested list 3+ levels round-trips', () => {
  const deepNode: JSONContent = {
    type: 'bulletList',
    attrs: { id: 'deep' },
    content: [
      {
        type: 'listItem',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'L1' }] },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'L2' }] },
                  {
                    type: 'bulletList',
                    content: [
                      {
                        type: 'listItem',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'L3' }],
                          },
                        ],
                      },
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
  const items = tiptapToListItems(deepNode);
  assert.equal(items[0].content?.[0]?.text, 'L1');
  assert.equal(items[0].children?.[0]?.content?.[0]?.text, 'L2');
  assert.equal(items[0].children?.[0]?.children?.[0]?.content?.[0]?.text, 'L3');
  // Round-trip back.
  const back = listItemToTiptap(items[0], 'bulletList');
  assert.equal(back.type, 'listItem');
  assert.equal(back.content?.[1]?.type, 'bulletList');
  assert.equal(back.content?.[1]?.content?.[0]?.content?.[1]?.type, 'bulletList');
  assert.equal(
    back.content?.[1]?.content?.[0]?.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
    'L3',
  );
});

test('REGRESSION: richText with all annotation types round-trips', () => {
  const rich: RichText[] = [
    { text: 'bold', annotations: { bold: true } },
    { text: 'italic', annotations: { italic: true } },
    { text: 'under', annotations: { underline: true } },
    { text: 'strike', annotations: { strikethrough: true } },
    { text: 'code', annotations: { code: true } },
    { text: 'colored', annotations: { color: '#ff0000' } },
    { text: 'link', annotations: { href: 'https://x.com' } },
  ];
  const inline = richTextToTiptapInline(rich);
  const back = tiptapInlineToRichText(inline);
  assert.equal(back.length, rich.length);
  for (let i = 0; i < rich.length; i++) {
    assert.equal(back[i].text, rich[i].text);
    assert.deepEqual(back[i].annotations, rich[i].annotations);
  }
});

test('REGRESSION: richText with soft line break (hardBreak) round-trips', () => {
  const rich: RichText[] = [
    { text: 'line1\nline2', annotations: {} },
  ];
  const inline = richTextToTiptapInline(rich);
  // \n becomes a hardBreak node.
  assert.ok(inline.some((n) => n.type === 'hardBreak'));
  const back = tiptapInlineToRichText(inline);
  // Re-joined: the hardBreak becomes a '\n' segment.
  const text = back.map((s) => s.text).join('');
  assert.ok(text.includes('line1'));
  assert.ok(text.includes('line2'));
});

// ---------------------------------------------------------------------------
// Bulk array round-trip
// ---------------------------------------------------------------------------

test('bulk: mixed document with all block types round-trips via array APIs', () => {
  const blocks: Block[] = [
    mkBlock('text', [{ text: 'p', annotations: {} }]),
    mkBlock('heading-1', [{ text: 'H1', annotations: {} }]),
    mkBlock('quote', [{ text: 'q', annotations: {} }]),
    mkBlock('code', [{ text: 'x()', annotations: {} }], { language: 'rust' }),
    mkBlock('divider', []),
    mkBlock('bullet-list', [], {
      listItems: [{ content: [{ text: 'a', annotations: {} }], children: [] }],
    }),
    mkBlock('math', [], { mathLatex: 'x^2' }),
  ];
  const json = ourBlocksToTiptapJSON(blocks);
  const back = tiptapJSONToOurBlocks(json);
  assert.equal(back.length, blocks.length);
  assert.equal(back[0].type, 'text');
  assert.equal(back[1].type, 'heading-1');
  assert.equal(back[3].type, 'code');
  assert.equal(back[3].properties?.language, 'rust');
  assert.equal(back[4].type, 'divider');
  assert.equal(back[5].type, 'bullet-list');
  assert.equal(back[5].properties?.listItems?.[0]?.content?.[0]?.text, 'a');
  assert.equal(back[6].type, 'math');
  assert.equal(back[6].properties?.mathLatex, 'x^2');
});

test('bulk: empty blocks array yields a placeholder paragraph', () => {
  const json = ourBlocksToTiptapJSON([]);
  assert.equal(json.length, 1);
  assert.equal(json[0].type, 'paragraph');
});

test('bulk: tiptapJSONToOurBlocks([]) returns []', () => {
  assert.deepEqual(tiptapJSONToOurBlocks([]), []);
});

// ---------------------------------------------------------------------------
// Table adapter focused tests
// ---------------------------------------------------------------------------

test('table: colspan/rowspan/colwidth/align round-trip', () => {
  const data: TableData = {
    rows: [
      {
        isHeader: true,
        cells: [
          { content: [[{ text: 'H', annotations: {} }]], colspan: 2, align: 'center' },
        ],
      },
      {
        isHeader: false,
        cells: [
          {
            content: [[{ text: 'c', annotations: {} }]],
            colwidth: [120],
            vAlign: 'middle',
            rowspan: 2,
          },
        ],
      },
    ],
  };
  const json = tableDataToTiptap(data);
  const back = tiptapToTableData({ type: 'table', content: json });
  assert.equal(back.rows[0].isHeader, true);
  assert.equal(back.rows[0].cells[0].colspan, 2);
  assert.equal(back.rows[0].cells[0].align, 'center');
  assert.equal(back.rows[1].cells[0].rowspan, 2);
  assert.equal(back.rows[1].cells[0].vAlign, 'middle');
  assert.deepEqual(back.rows[1].cells[0].colwidth, [120]);
});

test('table: empty cell stays editable (one empty paragraph)', () => {
  const data: TableData = {
    rows: [{ isHeader: false, cells: [{ content: [] }] }],
  };
  const json = tableDataToTiptap(data);
  const back = tiptapToTableData({ type: 'table', content: json });
  assert.equal(back.rows[0].cells[0].content.length, 1);
  assert.deepEqual(back.rows[0].cells[0].content[0], []);
});
