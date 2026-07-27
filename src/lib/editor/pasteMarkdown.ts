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
