/**
 * Repro: markdown table paste issues.
 * 1) &nbsp; left as literal text
 * 2) second paste inside table cell -> mangled duplicate table?
 */
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const key of ['window', 'document', 'DOMParser', 'Node', 'HTMLElement', 'Element', 'DocumentFragment', 'XMLSerializer']) {
  (globalThis as any)[key] = (dom.window as any)[key];
}

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';
import { readFileSync } from 'node:fs';
import { tiptapJSONToOurBlocks } from './src/lib/editor/tiptapAdapter/index';

const md = readFileSync('/tmp/repro-table.md', 'utf8');

function makeEditor() {
  return new Editor({
    element: undefined,
    extensions: [
      StarterKit.configure({ codeBlock: false, code: false, link: false }),
      Code.extend({ excludes: '' }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: true, cellMinWidth: 100 }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
    ],
    content: '',
  });
}

function summarizeCell(cell: any): string {
  const para = cell.content?.[0];
  if (!para) return '(no para)';
  return (para.content ?? [])
    .map((n: any) => (n.type === 'text' ? JSON.stringify(n.text) : `<${n.type}>`))
    .join(' ');
}

const editor = makeEditor();
const parsed = (editor as any).markdown.parse(md);

console.log('=== A. parse: top-level nodes ===');
for (const n of parsed.content ?? []) console.log(' ', n.type);

const tables = (parsed.content ?? []).filter((n: any) => n.type === 'table');
console.log('table count:', tables.length);

if (tables[0]) {
  const rows = tables[0].content ?? [];
  console.log('rows:', rows.length);
  // Row 2 (index 2), cell 2 — contains &nbsp; lines
  const cell = rows[2]?.content?.[1];
  console.log('=== B. row3 cell2 (contains &nbsp;) inline nodes ===');
  console.log(summarizeCell(cell));
  const hasNbsp = JSON.stringify(cell).includes('&nbsp;');
  console.log('literal "&nbsp;" present in parsed JSON:', hasNbsp);
}

console.log('=== C. blocks via tiptapJSONToOurBlocks ===');
const blocks = tiptapJSONToOurBlocks(parsed.content ?? []);
console.log('block types:', blocks.map((b) => b.type).join(', '));
const tableBlock = blocks.find((b) => b.type === 'table');
if (tableBlock) {
  const data = (tableBlock.properties as any).tableData;
  console.log('table rows:', data?.rows?.length);
  const c = data?.rows?.[2]?.cells?.[1];
  console.log('row3 cell2 rawContent?', !!c?.rawContent, ' paragraphs:', c?.content?.length);
  console.log('row3 cell2 first para segments:', JSON.stringify(c?.content?.[0]?.slice(0, 6)));
}

console.log('=== D. simulate SECOND paste with cursor inside last cell ===');
editor.commands.setContent(parsed);
// find last paragraph pos
let lastPara = 0;
editor.state.doc.descendants((node, pos) => {
  if (node.type.name === 'paragraph') lastPara = pos;
  return true;
});
editor.commands.setTextSelection(lastPara + 1);
editor.commands.insertContent(parsed);
const json2 = editor.getJSON();
console.log('top-level nodes after 2nd paste:', (json2.content ?? []).map((n) => n.type).join(', '));
const tables2 = (json2.content ?? []).filter((n: any) => n.type === 'table');
console.log('table count:', tables2.length);
tables2.forEach((t: any, i: number) => {
  const rows = t.content ?? [];
  console.log(`table[${i}] rows=${rows.length}`);
  rows.forEach((r: any, ri: number) => {
    const cells = (r.content ?? []).map((c: any) => {
      const txt = summarizeCell(c);
      return txt.length > 40 ? txt.slice(0, 40) + '…' : txt;
    });
    console.log(`  row${ri}:`, JSON.stringify(cells));
  });
});

console.log('=== E. mangled doc -> blocks (round trip of 2nd paste) ===');
const blocks2 = tiptapJSONToOurBlocks(json2.content ?? []);
console.log('block types:', blocks2.map((b) => b.type).join(', '));
blocks2.forEach((b, i) => {
  if (b.type !== 'table') return;
  const data = (b.properties as any).tableData;
  console.log(`tableBlock[${i}] rows=${data?.rows?.length}`);
  data?.rows?.forEach((r: any, ri: number) => {
    const cells = r.cells.map((c: any) => {
      const flat = (c.content ?? []).map((p: any[]) => p.map((s: any) => s.text).join('')).join('\\n');
      const t2 = flat.length > 30 ? flat.slice(0, 30) + '…' : flat;
      return c.rawContent ? `[raw ${c.rawContent.length} children] ${t2}` : t2;
    });
    console.log(`  row${ri}:`, JSON.stringify(cells));
  });
});
