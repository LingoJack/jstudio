/**
 * PasteMarkdown — Tiptap Extension
 *
 * Intercepts the browser `paste` event and converts Markdown-formatted plain
 * text into structured editor content, following the pattern from the official
 * Tiptap Markdown documentation.
 *
 * Strategy (Notion-style):
 *
 *   1. Internal copy (from our own editor) → let ProseMirror handle it,
 *      preserving block structure.  Detected via the ProseMirror signature
 *      `data-pm-slice` in text/html.
 *
 *   2. External copy that carries substantive HTML (web, Word, …) → let
 *      ProseMirror's default handler deal with it. This covers rich content
 *      like pasted images embedded as <img>, and avoids misinterpreting
 *      ordinary rich text as Markdown.
 *
 *   3. External copy that carries ONLY text/plain (terminal, .md files,
 *      "copy as markdown" from other editors) → check if it looks like
 *      Markdown. If yes, parse to structured blocks. If no, insert as plain
 *      text.
 *
 * Requires the `@tiptap/markdown` extension to be registered on the same
 * editor (provides `editor.markdown.parse()`).
 */

import { Extension } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { isPlainTextPaste } from './plainTextPaste';

/**
 * Remove duplicate marks from text nodes in Tiptap JSON (in-place).
 *
 * Workaround for a `@tiptap/markdown` v3 bug: when parsing nested emphasis
 * (e.g. `*a *b* c*`), `applyMarkToContent` appends the outer mark to text
 * nodes that already carry the same mark from the inner token, producing
 * duplicate marks (e.g. two `italic` marks on one text node). ProseMirror
 * rejects this because every mark type excludes itself by default, throwing
 * `RangeError: invalid collection of marks for node text: italic`.
 */
export function dedupeMarks(json: JSONContent): JSONContent {
  if (json.type === 'text' && Array.isArray(json.marks) && json.marks.length > 1) {
    const seen = new Set<string>();
    json.marks = json.marks.filter((m) => {
      const key = m.type ?? '';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (json.marks.length === 0) delete json.marks;
  }
  if (Array.isArray(json.content)) {
    json.content.forEach(dedupeMarks);
  }
  return json;
}

/**
 * Named HTML entities that `@tiptap/markdown` leaves undecoded, mapped to
 * Unicode code points.
 *
 * `marked` keeps entity references raw in text tokens, and `@tiptap/core`'s
 * `decodeHtmlEntities` only handles `&lt;` `&gt;` `&quot;` `&amp;` — so a
 * table cell copied from the web with `&nbsp;&nbsp;&nbsp;&nbsp;a. …` would
 * land in the document as the literal 6 characters "&nbsp;".
 *
 * The four entities already decoded upstream are deliberately EXCLUDED:
 * decoding them again here would double-decode sequences like `&amp;lt;`
 * (which upstream correctly turned into the literal text "&lt;").
 */
const MARKDOWN_ENTITY_CODE_POINTS: Record<string, number> = {
  apos: 0x0027,
  nbsp: 0x00a0,
  ensp: 0x2002,
  emsp: 0x2003,
  thinsp: 0x2009,
  ndash: 0x2013,
  mdash: 0x2014,
  lsquo: 0x2018,
  rsquo: 0x2019,
  ldquo: 0x201c,
  rdquo: 0x201d,
  hellip: 0x2026,
  middot: 0x00b7,
  bull: 0x2022,
  dagger: 0x2020,
  Dagger: 0x2021,
  permil: 0x2030,
  laquo: 0x00ab,
  raquo: 0x00bb,
  copy: 0x00a9,
  reg: 0x00ae,
  trade: 0x2122,
  deg: 0x00b0,
  plusmn: 0x00b1,
  times: 0x00d7,
  divide: 0x00f7,
  sect: 0x00a7,
  para: 0x00b6,
  micro: 0x00b5,
  iexcl: 0x00a1,
  iquest: 0x00bf,
  cent: 0x00a2,
  pound: 0x00a3,
  yen: 0x00a5,
  euro: 0x20ac,
};

const MAX_UNICODE_CODE_POINT = 0x10ffff;

// Matches numeric (&#160; &#xA0;) and named (&nbsp;) entity references.
const ENTITY_REFERENCE_PATTERN = /&(#(?:x[0-9a-fA-F]+|\d+)|[a-zA-Z][a-zA-Z0-9]+);/g;

function decodeEntityReferences(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(ENTITY_REFERENCE_PATTERN, (match, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x';
      const codePoint = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isNaN(codePoint) || codePoint > MAX_UNICODE_CODE_POINT) {
        return match;
      }
      return String.fromCodePoint(codePoint);
    }
    const codePoint = MARKDOWN_ENTITY_CODE_POINTS[body];
    return codePoint === undefined ? match : String.fromCodePoint(codePoint);
  });
}

/**
 * Decode leftover HTML entities in parsed-Markdown JSON text nodes (in-place).
 *
 * Companion to `dedupeMarks`: run on the output of `editor.markdown.parse()`
 * before inserting/importing. Skips codeBlock nodes and inline-code text,
 * where entity references must stay literal (CommonMark: no entity decoding
 * inside code).
 */
export function decodeMarkdownEntities(json: JSONContent): JSONContent {
  if (json.type === 'codeBlock') return json;
  if (json.type === 'text') {
    const inInlineCode = json.marks?.some((m) => m.type === 'code') ?? false;
    if (!inInlineCode && typeof json.text === 'string') {
      json.text = decodeEntityReferences(json.text);
    }
    return json;
  }
  if (Array.isArray(json.content)) {
    json.content.forEach(decodeMarkdownEntities);
  }
  return json;
}

export interface PasteMarkdownOptions {
  /** Enable / disable the extension. @default true */
  enabled: boolean;
}

/** Decides whether a plain-text string looks like Markdown. */
export function looksLikeMarkdown(text: string): boolean {
  if (!text || text.length < 2) return false;

  // Block-level patterns that indicate true Markdown structure.
  // Inline patterns like **bold** or [link](url) are excluded because
  // they cause false positives (e.g., "This is **important**" would trigger
  // Markdown parsing, which with breaks:true converts every \n to <br>,
  // producing extra blank lines when pasting back).
  const blockPatterns: RegExp[] = [
    /^#{1,6}\s+\S/m, // # Heading
    /^>\s+\S/m, // > Blockquote
    /^[-*+]\s+\S/m, // - Unordered list
    /^\d+\.\s+\S/m, // 1. Ordered list
    /```[\s\S]*?```/, // ``` Fenced code block
    /^\|.+\|.*\n\|[-:\s|]+\|/m, // | GFM table |
    /^-{3,}$|^\*{3,}$/m, // --- Horizontal rule
    /^!\[.*\]\(.*\)/m, // ![alt](url) image
    /^\$\$[\s\S]+?\$\$/m, // $$ Math block $$
  ];

  return blockPatterns.some((re) => re.test(text));
}

export const PasteMarkdown = Extension.create<PasteMarkdownOptions>({
  name: 'pasteMarkdown',

  addOptions() {
    return {
      enabled: true,
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const enabled = this.options.enabled;

    return [
      new Plugin({
        props: {
          handlePaste(view, event: ClipboardEvent): boolean {
            // Cmd/Ctrl+Shift+V: defer to the main paste handler which strips
            // all formatting and inserts raw text only. Peek (don't consume)
            // so the flag survives for the editorProps.handlePaste.
            if (isPlainTextPaste()) return false;

            if (!enabled || !editor.markdown) return false;

            const clipboardData = event.clipboardData;
            if (!clipboardData) return false;

            const htmlText = clipboardData.getData('text/html') ?? '';
            const plainText = clipboardData.getData('text/plain') ?? '';

            // Case 1: Internal copy — ProseMirror signature in HTML.
            if (htmlText.includes('data-pm-slice')) return false;

            // Case 2: External copy WITH substantive HTML content.
            // Let ProseMirror handle rich content (images, formatting, etc.)
            if (htmlText.trim().length > 0) return false;

            // Case 3: External copy with ONLY plain text.
            if (!plainText || !looksLikeMarkdown(plainText)) return false;

            // Parse Markdown → Tiptap JSON and insert.
            event.preventDefault();
            const json = editor.markdown.parse(plainText);
            dedupeMarks(json);
            editor.commands.insertContent(json);
            return true;
          },
        },
      }),
    ];
  },
});
