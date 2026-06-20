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
import { looksLikeMarkdown } from './pasteMarkdown';

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

      // External text paste: if it looks like Markdown, ALWAYS parse it
      // as Markdown regardless of whether HTML is also present.  Many
      // sources (GitHub, VS Code, Typora) put rendered HTML alongside
      // the Markdown plain text, but the HTML is often lossy (missing
      // marks, stripped formatting).  The Markdown text is the source
      // of truth.
      if (editor?.markdown && plainText && looksLikeMarkdown(plainText)) {
        event.preventDefault();
        const json = editor.markdown.parse(plainText);
        editor.commands.insertContent(json);
        return true;
      }

      // Non-Markdown external paste with HTML → let ProseMirror handle.
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
