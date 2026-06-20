/**
 * Editor clipboard (paste) and drag-and-drop (drop) handlers.
 *
 * These are pure functions that return ProseMirror EditorProps handlers.
 * They depend on an editor ref (so async callbacks can access the latest
 * editor instance) and the upload helpers.
 */

import type { Editor } from '@tiptap/react';
import type { EditorView } from '@tiptap/pm/view';
import { uploadImage, uploadAttachment } from './editorUpload';
import { getClipboardImageAsFile } from './clipboardImage';
import { markdownToBlocks, isLikelyMarkdown } from './markdown';
import { ourBlocksToTiptapJSON } from './tiptapAdapter';

/**
 * Create the `handlePaste` callback for ProseMirror editorProps.
 *
 * Returns `true` if we handled the paste (preventing default), `false` to
 * let ProseMirror's built-in paste run.
 */
export function createPasteHandler(
  editorRef: React.MutableRefObject<Editor | null>,
) {
  return (_view: EditorView, event: ClipboardEvent): boolean => {
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
    //    To avoid interfering with normal text pastes, we split into two
    //    sub-cases based on whether there is "spill" text we must suppress:
    const hasFileItem = Array.from(items).some((i) => i.kind === 'file');
    const plainText = event.clipboardData?.getData('text/plain') ?? '';
    const htmlText = event.clipboardData?.getData('text/html') ?? '';

    // ────────────────────────────────────────────────────────────────
    // Text paste (has text/plain, no file item)
    //
    // Strategy (Notion-style):
    //   1. Internal copy (from our own editor) → let ProseMirror handle,
    //      preserving block structure.  We detect this via the ProseMirror
    //      signature `data-pm-slice` in text/html.
    //   2. External copy (web, Word, other apps) → ALWAYS discard
    //      text/html to prevent foreign styles from bleeding in.  Work
    //      exclusively from text/plain:
    //        • Looks like Markdown → parse to structured blocks.
    //        • Otherwise           → insert as clean, unstyled text.
    // ────────────────────────────────────────────────────────────────
    if (!hasFileItem && plainText) {
      const isInternal = !!htmlText && htmlText.includes('data-pm-slice');

      if (isInternal) {
        // Same-editor paste: preserve structure.
        return false;
      }

      // External paste: strip all HTML, work from plain text only.
      event.preventDefault();

      if (isLikelyMarkdown(plainText)) {
        const blocks = markdownToBlocks(plainText);
        const tiptapJSON = ourBlocksToTiptapJSON(blocks);
        editorRef.current
          ?.chain()
          .focus()
          .insertContent(tiptapJSON)
          .run();
      } else {
        // Clean text: insert as paragraphs, no foreign styles.
        editorRef.current
          ?.chain()
          .focus()
          .insertContent(plainText)
          .run();
      }
      return true;
    }

    // Here: either a file-kind item is present (Finder copy / drag), or
    // clipboardData is completely empty (pure screenshot to clipboard).
    // In both cases we probe the native clipboard. preventDefault now in
    // case there is spill text; if no image is found we restore the text.
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
