/**
 * Post-process parsed-Markdown JSON to upgrade table cells whose multi-line
 * `<br>`/`\n`-separated content was inline-tokenized back into real block
 * nodes (orderedList, bulletList, heading, blockquote, …).
 *
 * Why this exists: `marked`'s GFM table tokenizer only emits inline tokens
 * for cell content, and TipTap's stock `Table.parseMarkdown` wraps those in
 * a single paragraph. So a pasted cell like `1. a<br>2. b` lands as
 * `paragraph > text("1. a") + hardBreak + text("2. b")` instead of an
 * `orderedList`. The storage layer (`tiptapAdapter/table.ts` `rawContent`)
 * already handles block content in cells — this fills the only gap: the
 * paste parser not producing that structure.
 *
 * Strategy: walk every `table` in the parsed JSON, and for each cell that is
 * a single paragraph containing a `hardBreak`, reconstruct the inline
 * content as a multi-line Markdown string, re-parse it block-level, and
 * replace the cell's content ONLY when the re-parse actually produces block
 * nodes. The safety net prevents misfiring on plain multi-line text
 * (`line1<br>line2`) that should stay a single paragraph with a hardBreak.
 */

import type { JSONContent } from '@tiptap/core';
import { dedupeMarks, decodeMarkdownEntities } from './pasteMarkdown';

/**
 * Block node types that justify upgrading a cell's inline-only paragraph
 * into real block content. If the re-parsed cell JSON contains any of these
 * (at any depth), the upgrade is applied; otherwise the original paragraph
 * is preserved.
 */
const BLOCK_UPGRADE_TYPES = new Set([
  'orderedList',
  'bulletList',
  'taskList',
  'blockquote',
  'heading',
]);

/** Cell node types produced by TipTap's table parser. */
const TABLE_CELL_TYPES = new Set(['tableCell', 'tableHeader']);

/** Inline mark types we reverse-serialize when reconstructing cell Markdown. */
const BOLD_MARK = 'bold';
const ITALIC_MARK = 'italic';
const CODE_MARK = 'code';

/**
 * Patterns that indicate a reconstructed cell string should be re-parsed at
 * block level. Matched against each non-empty line's leading characters.
 */
const BLOCK_LINE_PATTERNS: RegExp[] = [
  /^\d+\.\s+\S/, // 1. ordered list
  /^[-*+]\s+\S/, // - / * / + unordered list
  /^#{1,6}\s+\S/, // # heading
  /^>\s+\S/, // > blockquote
  /^[-*+]\s+\[[ xX]\]\s+\S/, // - [ ] / - [x] task list item
];

function looksLikeBlockMarkdown(md: string): boolean {
  if (!md) return false;
  for (const line of md.split('\n')) {
    const trimmed = line.trimStart();
    for (const re of BLOCK_LINE_PATTERNS) {
      if (re.test(trimmed)) return true;
    }
  }
  return false;
}

/**
 * Reconstruct a paragraph's inline children as a Markdown string suitable
 * for block-level re-parsing.
 *
 * - `text` nodes are emitted with their marks re-applied (`bold` → `**..**`,
 *   `italic` → `*..*`, `code` → `` `..` ``). Other marks (link, underline,
 *   strike) are dropped — rare in this multi-line-cell context and not
 *   needed for the reported bug.
 * - `hardBreak` nodes become `\n` (the block separator that lets `marked`
 *   recognize list items / headings / blockquotes on subsequent lines).
 * - Other inline types (image, etc.) are skipped.
 *
 * Returns `''` if no reconstructable content was found.
 */
function inlineToMarkdownString(nodes: JSONContent[]): string {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text' && typeof n.text === 'string') {
      let text = n.text;
      if (Array.isArray(n.marks)) {
        // Apply marks so bold/italic/code survive the round-trip. Order is
        // not critical for non-overlapping marks.
        for (const m of n.marks) {
          if (m.type === BOLD_MARK) text = `**${text}**`;
          else if (m.type === ITALIC_MARK) text = `*${text}*`;
          else if (m.type === CODE_MARK) text = `\`${text}\``;
        }
      }
      out += text;
    } else if (n.type === 'hardBreak') {
      out += '\n';
    }
  }
  return out;
}

/** True if `json` contains any block-upgrade node type at any depth. */
function containsBlockNode(json: JSONContent): boolean {
  if (json.type && BLOCK_UPGRADE_TYPES.has(json.type)) return true;
  if (Array.isArray(json.content)) {
    for (const child of json.content) {
      if (containsBlockNode(child)) return true;
    }
  }
  return false;
}

/**
 * Walk the parsed JSON and upgrade eligible table cells in place.
 *
 * @param json         Output of `editor.markdown.parse(md)` to mutate.
 * @param parseMarkdown Block-level Markdown parser (typically
 *                      `(md) => editor.markdown.parse(md)`). Re-used so the
 *                      upgrade uses the same `marked` config as the outer
 *                      parse.
 * @returns The same `json` reference (mutated), for chaining.
 */
export function upgradeTableCells(
  json: JSONContent,
  parseMarkdown: (md: string) => JSONContent,
): JSONContent {
  walkAndUpgrade(json, parseMarkdown);
  return json;
}

function walkAndUpgrade(node: JSONContent, parseMarkdown: (md: string) => JSONContent): void {
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      walkAndUpgrade(child, parseMarkdown);
    }
  }
  if (node.type !== 'table') return;

  for (const row of node.content ?? []) {
    if (row.type !== 'tableRow' || !Array.isArray(row.content)) continue;
    for (const cell of row.content) {
      if (!cell.type || !TABLE_CELL_TYPES.has(cell.type)) continue;
      upgradeCell(cell, parseMarkdown);
    }
  }
}

function upgradeCell(cell: JSONContent, parseMarkdown: (md: string) => JSONContent): void {
  const children = cell.content;
  // Only the paste-produced shape: a single paragraph. Multi-block cells
  // (e.g. from internal paste) are left alone — they never reach this path
  // anyway because internal paste returns before `markdown.parse` runs.
  if (!Array.isArray(children) || children.length !== 1) return;
  const para = children[0];
  if (para.type !== 'paragraph' || !Array.isArray(para.content)) return;

  // Must contain at least one hardBreak — single-line cells stay as-is.
  if (!para.content.some((n) => n.type === 'hardBreak')) return;

  const md = inlineToMarkdownString(para.content);
  if (!md || !looksLikeBlockMarkdown(md)) return;

  let reparsed: JSONContent;
  try {
    reparsed = parseMarkdown(md);
  } catch {
    // If re-parse throws, keep the original cell content untouched.
    return;
  }

  // Safety net: only replace when the re-parse actually yielded block nodes.
  // Otherwise plain multi-line text (`line1<br>line2`) would be needlessly
  // re-wrapped — keep it as the original paragraph + hardBreak.
  if (!containsBlockNode(reparsed)) return;

  const newChildren = Array.isArray(reparsed.content) ? reparsed.content : [];
  if (newChildren.length === 0) return;

  // Apply the same post-processing the outer pipeline runs, so re-parsed
  // content enjoys the same dedupe / entity-decode guarantees.
  for (const child of newChildren) {
    dedupeMarks(child);
    decodeMarkdownEntities(child);
  }

  cell.content = newChildren;
}
