/**
 * Editor clipboard (paste) and drag-and-drop (drop) handlers.
 *
 * These are pure functions that return ProseMirror EditorProps handlers.
 * They depend on an editor ref (so async callbacks can access the latest
 * editor instance) and the upload helpers.
 */

import type { Editor, JSONContent } from '@tiptap/react';
import type { EditorView } from '@tiptap/pm/view';
import { uploadImage, uploadAttachment } from './editorUpload';
import { getClipboardImageAsFile } from './clipboardImage';
import { looksLikeMarkdown, dedupeMarks } from './pasteMarkdown';

/**
 * Strip inline styles and style-only tags from external HTML while preserving
 * semantic structure (bold, italic, links, lists, headings, etc).
 *
 * Strategy: parse HTML in a temporary DOM, remove style/class attributes and
 * certain style-only tags (<font>, <span> without semantic role), then return
 * the cleaned HTML for ProseMirror's parser.
 */
function cleanExternalHtml(html: string): string {
  // Quick check: if the HTML has no style/class, return as-is (no overhead).
  if (!html.includes('style=') && !html.includes('class=') && !html.includes('<font') && !html.includes('<span')) {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;

  // Walk all elements and strip style/class attributes.
  const walk = (el: Element) => {
    el.removeAttribute('style');
    el.removeAttribute('class');
    // Remove other styling attributes common in foreign HTML.
    el.removeAttribute('width');
    el.removeAttribute('height');
    el.removeAttribute('bgcolor');
    el.removeAttribute('color');
    el.removeAttribute('face'); // font face
    el.removeAttribute('size'); // font size

    // Unwrap <font> tags (pure style, no semantic meaning).
    if (el.tagName === 'FONT') {
      const parent = el.parentNode;
      while (el.firstChild) {
        parent?.insertBefore(el.firstChild, el);
      }
      parent?.removeChild(el);
      return; // Don't recurse into removed element.
    }

    // Unwrap <span> tags that have no semantic role.
    // Keep spans that might be used for marks (e.g. with data attributes),
    // but unwrap pure styling spans.
    if (el.tagName === 'SPAN' && !el.hasAttributes()) {
      const parent = el.parentNode;
      while (el.firstChild) {
        parent?.insertBefore(el.firstChild, el);
      }
      parent?.removeChild(el);
      return;
    }

    // Recurse into children.
    for (const child of Array.from(el.children)) {
      walk(child);
    }
  };

  walk(body);
  return body.innerHTML;
}

/**
 * Detect whether plain text looks like a TSV (tab-separated values) table.
 *
 * Criteria:
 * - At least 2 non-empty lines
 * - Every non-empty line contains at least one tab (≥ 2 columns)
 * - All non-empty lines have the same number of tab-separated fields
 *
 * This catches data copied from spreadsheets, terminals, or rendered tables
 * where cells are separated by tabs. It deliberately rejects lines without
 * tabs (e.g. code indentation) and single-line snippets.
 */
function looksLikeTSVTable(text: string): boolean {
  if (!text) return false;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;

  // Every non-empty line must contain at least one tab.
  if (!lines.every((l) => l.includes('\t'))) return false;

  // Count fields (tab-separated) in each line.
  const counts = lines.map((l) => l.split('\t').length);
  const first = counts[0];
  if (first < 2) return false; // Need at least 2 columns.

  // All lines should have the same column count.
  return counts.every((c) => c === first);
}

/**
 * Convert TSV (tab-separated values) text to a Tiptap table JSON node.
 *
 * The first row becomes the header row (tableHeader cells); subsequent
 * rows are body rows (tableCell cells). Each cell is trimmed and placed
 * in a paragraph.
 */
function tsvToTableJSON(text: string): JSONContent {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const rows: JSONContent[] = lines.map((line, rowIdx) => {
    const cells = line.split('\t');
    const cellType = rowIdx === 0 ? 'tableHeader' : 'tableCell';

    return {
      type: 'tableRow',
      content: cells.map((cellText) => ({
        type: cellType,
        content: [
          {
            type: 'paragraph',
            content: cellText.trim()
              ? [{ type: 'text', text: cellText.trim() }]
              : [],
          },
        ],
      })),
    };
  });

  return {
    type: 'table',
    content: rows,
  };
}

/**
 * Create the `handlePaste` callback for ProseMirror editorProps.
 *
 * Returns `true` if we handled the paste (preventing default), `false` to
 * let ProseMirror's built-in paste run.
 */
export function createPasteHandler(
  editorRef: React.MutableRefObject<Editor | null>,
) {
  return (view: EditorView, event: ClipboardEvent): boolean => {
    const items = event.clipboardData?.items;
    if (!items) return false;

    // 1. Browser clipboard has image → use it directly (standard path)
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;

        event.preventDefault();
        uploadImage(file).then((src) => {
          editorRef.current
            ?.chain()
            .focus()
            .setImage({ src, alt: '' })
            .run();
        });
        return true;
      }
    }

    // 2. Tauri WebView fallback: system-level image copies (screenshots,
    //    Finder file copies) may NOT appear as image/* in clipboardData.
    //    We probe the native clipboard via Tauri's clipboard-manager plugin.
    //
    //    IMPORTANT: Text paste (plain text, markdown, html) is NOT handled
    //    here. The PasteMarkdown plugin handles markdown detection/parsing,
    //    and ProseMirror's default handles everything else. This function
    //    only intercepts clipboard items with a `file` kind.
    const hasFileItem = Array.from(items).some((i) => i.kind === 'file');

    if (!hasFileItem) {
      // Pure text paste — handle Markdown or let ProseMirror handle the rest.
      const editor = editorRef.current;
      const clipboardData = event.clipboardData;
      const htmlText = clipboardData?.getData('text/html') ?? '';
      const plainText = clipboardData?.getData('text/plain') ?? '';

      // Internal copy (from our own editor) → preserve structure.
      if (htmlText.includes('data-pm-slice')) return false;

      // Inside a code block: always insert as plain text. Never parse
      // Markdown or foreign HTML inside a code block - "# heading" must
      // stay literal code, not become a heading node that breaks out of
      // the block.
      if (plainText) {
        const { selection } = view.state;
        let inCodeBlock = false;
        for (let d = selection.$head.depth; d > 0; d--) {
          if (selection.$head.node(d).type.name === 'codeBlock') {
            inCodeBlock = true;
            break;
          }
        }
        if (inCodeBlock) {
          event.preventDefault();
          const { from, to } = selection;
          const tr = view.state.tr;
          tr.insertText(plainText, from, to);
          tr.scrollIntoView();
          view.dispatch(tr);
          return true;
        }
      }

      // TSV (tab-separated values) table detection.
      // Must run BEFORE the Markdown check: TSV content whose first column
      // starts with "#" (e.g. a row-number header) would otherwise be
      // misidentified as a Markdown heading.
      //
      // When the clipboard also carries HTML containing a <table>, we defer
      // to the HTML path (below) which preserves richer table structure
      // (colspan, alignment, etc.). Only convert TSV when there's no HTML
      // table.
      const isTSV = !!(plainText && looksLikeTSVTable(plainText));
      const hasHtmlTable = !!(htmlText && /<table[\s>]/i.test(htmlText));

      if (isTSV && !hasHtmlTable && editor) {
        event.preventDefault();
        const tableJSON = tsvToTableJSON(plainText);
        editor.commands.insertContent(tableJSON);
        return true;
      }

      // External text paste: if it looks like Markdown, ALWAYS parse it
      // as Markdown regardless of whether HTML is also present.  Many
      // sources (GitHub, VS Code, Typora) put rendered HTML alongside
      // the Markdown plain text, but the HTML is often lossy (missing
      // marks, stripped formatting).  The Markdown text is the source
      // of truth.
      //
      // Skip Markdown parsing when TSV was detected but deferred to the
      // HTML table path — the "#" in TSV data is a column header, not a
      // Markdown heading.
      if (!isTSV && editor?.markdown && plainText && looksLikeMarkdown(plainText)) {
        event.preventDefault();
        const json = editor.markdown.parse(plainText);
        dedupeMarks(json);
        editor.commands.insertContent(json);
        return true;
      }

      // External HTML paste (non-Markdown) → strip styles, keep semantic structure.
      // ProseMirror's default would preserve foreign HTML styles (fonts, colors),
      // which is undesirable for a local note app. We clean the HTML first.
      if (htmlText && !htmlText.includes('data-pm-slice')) {
        event.preventDefault();
        const cleanHtml = cleanExternalHtml(htmlText);
        editor?.chain().focus().insertContent(cleanHtml).run();
        return true;
      }

      // No HTML or internal paste — let ProseMirror handle.
      return false;
    }

    const plainText = event.clipboardData?.getData('text/plain') ?? '';

    // File-kind item present (Finder copy / drag) or clipboardData is
    // completely empty (pure screenshot to clipboard).
    // Probe the native clipboard. preventDefault now in case there is spill
    // text; if no image is found we restore the text.
    event.preventDefault();
    getClipboardImageAsFile().then((file) => {
      const editor = editorRef.current;
      if (!editor) return;

      if (file) {
        uploadImage(file).then((src) => {
          editor.chain().focus().setImage({ src, alt: '' }).run();
        });
      } else if (plainText) {
        // No image found — restore as clean plain text (never foreign HTML).
        editor.chain().focus().insertContent(plainText).run();
      }
    });

    return true;
  };
}

/**
 * Create the `handleDrop` callback for ProseMirror editorProps.
 *
 * Handles image files (→ image node) and other files (→ fileBlock node).
 */
export function createDropHandler(
  editorRef: React.MutableRefObject<Editor | null>,
) {
  return (_view: EditorView, event: DragEvent): boolean => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return false;

    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        event.preventDefault();
        uploadImage(file).then((src) => {
          editorRef.current
            ?.chain()
            .focus()
            .setImage({ src, alt: '' })
            .run();
        });
        return true;
      }
    }

    // Non-image files → insert as file attachment blocks
    for (const file of Array.from(files)) {
      event.preventDefault();
      uploadAttachment(file).then((attrs) => {
        editorRef.current?.chain().focus().setFile(attrs).run();
      });
    }
    return true;
  };
}
