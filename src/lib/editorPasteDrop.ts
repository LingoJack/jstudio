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

    // Plain text paste (has text, no file item) → let it pass through,
    // zero interference with normal typing.
    if (!hasFileItem && (plainText || htmlText)) return false;

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
      } else if (htmlText) {
        editor.chain().focus().insertContent(htmlText).run();
      } else if (plainText) {
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
