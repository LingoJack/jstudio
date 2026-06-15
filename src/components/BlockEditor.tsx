/**
 * BlockEditor — the main document editing surface.
 *
 * This is a TipTap-based editor. TipTap (via ProseMirror) handles all
 * contentEditable complexity (cursor, selection, undo/redo, paste, slash
 * commands, drag-and-drop). We only manage:
 *
 *   1. Document title input
 *   2. Initial content loading when switching documents
 *   3. Debounced content sync back to our Zustand store
 *
 * Data flow:
 *
 *   store.activeDoc.blocks  →  ourBlocksToTiptapJSON()  →  editor.setContent()
 *   editor.getJSON()        →  tiptapJSONToOurBlocks()  →  store.setActiveDocBlocks()
 *
 * The two systems are decoupled by the adapter layer (`lib/tiptapAdapter`).
 */

import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';

import Color from '@tiptap/extension-color';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';

import { useStore } from '../store/useStore';
import { storage } from '../lib/storage';
import {
  ourBlocksToTiptapJSON,
  tiptapJSONToOurBlocks,
} from '../lib/tiptapAdapter';
import { SlashMenuExtension } from '../lib/tiptapExtensions';
import type { Block } from '../types';

// ---------------------------------------------------------------------------
// Lowlight instance — register common languages for syntax highlighting
// ---------------------------------------------------------------------------
const lowlight = createLowlight(common);

export default function BlockEditor() {
  const activeDoc = useStore((s) => s.activeDoc);
  const updateDocumentMeta = useStore((s) => s.updateDocumentMeta);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  /** Tracks the document ID currently loaded into the editor to prevent
   *  reload loops. */
  const loadedDocIdRef = useRef<string | null>(null);
  /** Debounce timer for store sync. */
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guard: skip onUpdate when we programmatically replace content. */
  const isReplacingRef = useRef(false);
  /** Stable ref to the editor for use in callbacks without re-creating editor. */
  const editorRef = useRef<Editor | null>(null);

  // ------------------------------------------------------------------
  // Image upload handler — saves to document's local assets folder
  // ------------------------------------------------------------------
  const uploadFile = useCallback(
    async (file: File): Promise<string> => {
      const activeDocId = useStore.getState().activeDocId;
      if (!activeDocId) {
        // Fallback: return a data URL if no active doc
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }

      const ext = file.type.split('/')[1] || 'png';
      const fileName = `image-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));
      await storage.saveDocAsset(activeDocId, fileName, bytes);

      // Read it back as base64 data URL for display.
      const base64 = await storage.readDocAssetBase64(activeDocId, fileName);
      const mime = file.type || 'image/png';
      return `data:${mime};base64,${base64}`;
    },
    [],
  );

  // ------------------------------------------------------------------
  // Debounced content sync — editor → store
  // ------------------------------------------------------------------
  const handleChange = useCallback(({ editor }: { editor: Editor }) => {
    // Skip if this change was triggered by our own setContent
    if (isReplacingRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const json = editor.getJSON();
      const blocks: Block[] = tiptapJSONToOurBlocks(json.content ?? []);
      useStore.getState().setActiveDocBlocks(blocks);
    }, 300);
  }, []);

  // ------------------------------------------------------------------
  // Create the TipTap editor instance (once)
  // ------------------------------------------------------------------
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // replaced by CodeBlockLowlight
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Placeholder.configure({
        placeholder: '输入 / 唤起命令菜单…',
      }),
      Image.configure({ inline: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Underline,
      TextStyle,
      Color,
      SlashMenuExtension,
    ],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: handleChange,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none',
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (!file) continue;

            event.preventDefault();
            // Upload then insert — async, so we use the editor ref
            uploadFile(file).then((src) => {
              editorRef.current
                ?.chain()
                .focus()
                .setImage({ src, alt: '' })
                .run();
            });
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        for (const file of Array.from(files)) {
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            uploadFile(file).then((src) => {
              editorRef.current
                ?.chain()
                .focus()
                .setImage({ src, alt: '' })
                .run();
            });
            return true;
          }
        }
        return false;
      },
    },
  });

  // Keep editor ref in sync for async callbacks (paste/drop handlers)
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // ------------------------------------------------------------------
  // Load content when switching documents
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!editor) return;
    if (!activeDoc) {
      loadedDocIdRef.current = null;
      return;
    }

    // Only reload if the document actually changed
    if (loadedDocIdRef.current === activeDoc.id) return;
    loadedDocIdRef.current = activeDoc.id;

    isReplacingRef.current = true;
    const tiptapContent = ourBlocksToTiptapJSON(activeDoc.blocks);
    editor.commands.setContent(tiptapContent);
    // Reset the guard after ProseMirror has processed the transaction
    requestAnimationFrame(() => {
      isReplacingRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDoc?.id, editor]);

  // ------------------------------------------------------------------
  // Cleanup debounce timer on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // ------------------------------------------------------------------
  // Title keydown — Enter / Arrow navigation
  // ------------------------------------------------------------------
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeDoc || !editor) return;
    const el = e.currentTarget;
    const isAtEnd =
      el.selectionStart === el.value.length &&
      el.selectionEnd === el.value.length;

    if (e.key === 'ArrowDown' && isAtEnd) {
      e.preventDefault();
      // Focus the editor and place cursor at the start
      editor.commands.focus('start');
    } else if (e.key === 'Enter' && !e.shiftKey) {
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      editor.commands.focus('start');
    }
  };

  // ------------------------------------------------------------------
  // Ctrl+A — select all in the editor
  // TipTap's default Ctrl+A only selects within the current contentEditable,
  // but the experience is improved by explicitly selecting the entire doc.
  // ------------------------------------------------------------------
  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!editor) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        editor.chain().focus().selectAll().run();
      }
    },
    [editor],
  );

  if (!activeDoc) return null;

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-20 py-8 md:py-12 bg-[var(--vscode-editor-background)] select-text">
        {/* Document Title */}
        <div className="pb-4">
          <input
            ref={titleInputRef}
            type="text"
            value={activeDoc.title}
            onChange={(e) => updateDocumentMeta({ title: e.target.value })}
            onKeyDown={handleTitleKeyDown}
            placeholder="文档标题"
            className="text-4xl font-bold text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none w-full placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-40 pb-1"
          />
        </div>

        {/* TipTap Editor */}
        <div
          className="tiptap-editor-container min-h-[50vh]"
          onKeyDown={handleEditorKeyDown}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
