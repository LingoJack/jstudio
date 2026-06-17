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
import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '../lib/imageExtension';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';

import Color from '@tiptap/extension-color';
import { createLowlight, common } from 'lowlight';

import { useStore } from '../store/useStore';
import { storage } from '../lib/storage';
import {
  ourBlocksToTiptapJSON,
  tiptapJSONToOurBlocks,
} from '../lib/tiptapAdapter';
import { SlashMenuExtension } from '../lib/tiptapExtensions';
import { CodeBlockWithChrome } from '../lib/codeBlockExtension';
import { BlockNavigation } from '../lib/blockNavigation';
import type { Block } from '../types';

// ---------------------------------------------------------------------------
// Lowlight instance — register common languages for syntax highlighting
// ---------------------------------------------------------------------------
// Performance note:
//   When a code block has no `language` attribute (e.g. created via /code
//   slash command), CodeBlockLowlight falls back to `lowlight.highlightAuto()`,
//   which synchronously tries every registered grammar (37 languages) to
//   "guess" the language.  This is the #1 cause of cursor lag when pressing
//   Enter inside code blocks.
//
//   Two mitigations:
//     1. defaultLanguage: 'plaintext' — tells CodeBlockLowlight to use the
//        near-zero-cost `highlight('plaintext', …)` path instead of
//        highlightAuto for untyped code blocks.
//     2. Override `highlightAuto` on our lowlight instance as a safety net
//        so any other caller also takes the fast plaintext path instead of
//        the expensive auto-detection.
const lowlight = createLowlight(common);
lowlight.highlightAuto = (value: string) =>
  lowlight.highlight('plaintext', value) as ReturnType<typeof lowlight.highlight>;

// ---------------------------------------------------------------------------
// SelectAllText — overrides ProseMirror's default Mod-a keymap.
// The built-in "selectAll" command creates an AllSelection, whose DOM Range
// extends to the very end of the editor DOM (.ProseMirror).  When the last
// block is a <pre><code>…</code></pre>, WebKit paints the ::selection
// background across the full width of the <pre> element's bottom padding,
// producing a thick blue bar below the code.  By re-creating the selection as
// a TextSelection (from doc start to the last text position inside the last
// block), the DOM range stays within text nodes and the highlight renders
// correctly.
// ---------------------------------------------------------------------------
const SelectAllText = Extension.create({
  name: 'select-all-text',
  addKeyboardShortcuts() {
    return {
      'Mod-a': ({ editor }) => {
        const { state, view } = editor;
        const { tr, doc } = state;

        // Walk the document to find the end position of the very last text
        // node.  This keeps the DOM selection range inside text nodes,
        // avoiding the AllSelection bug where WebKit paints a full-width
        // ::selection bar across <pre> bottom padding.
        let lastTextEnd = -1;
        doc.descendants((node, pos) => {
          if (node.isText) lastTextEnd = pos + node.nodeSize;
          return true;
        });

        const end = lastTextEnd >= 0 ? lastTextEnd : doc.content.size;
        const selection = TextSelection.create(doc, 0, end);
        tr.setSelection(selection);
        view.dispatch(tr);
        return true;
      },
    };
  },
});

export default function BlockEditor() {
  // Only subscribe to the fields this component actually renders, so that
  // setActiveDocBlocks() (fires on every debounce tick) — which replaces the
  // activeDoc reference — does NOT trigger a re-render here.  Re-rendering the
  // component while ProseMirror is mid-transaction causes visible cursor lag,
  // especially inside code blocks.
  const activeDocId = useStore((s) => s.activeDocId);
  const activeDocTitle = useStore((s) => s.activeDoc?.title ?? '');
  const hasActiveDoc = useStore((s) => !!s.activeDoc);
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
  const focusTitleEnd = useCallback(() => {
    const el = titleInputRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // replaced by CodeBlockLowlight
      }),
      CodeBlockWithChrome.configure({
        lowlight,
        defaultLanguage: 'plaintext',
        exitOnTripleEnter: false,
      }),
      Placeholder.configure({
        placeholder: '输入 / 唤起命令菜单…',
      }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Underline,
      TextStyle,
      Color,
      SelectAllText,
      SlashMenuExtension,
      BlockNavigation.configure({
        onExitToTitle: () => focusTitleEnd(),
      }),
    ],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: handleChange,
    editorProps: {
      attributes: {
        class: 'max-w-none focus:outline-none',
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
    if (!hasActiveDoc) {
      loadedDocIdRef.current = null;
      return;
    }

    // Only reload if the document actually changed
    if (loadedDocIdRef.current === activeDocId) return;
    loadedDocIdRef.current = activeDocId;

    // Read blocks from the store directly (not via subscription) so
    // re-renders triggered by setActiveDocBlocks don't cause reload loops.
    const blocks = useStore.getState().activeDoc?.blocks ?? [];

    isReplacingRef.current = true;
    const tiptapContent = ourBlocksToTiptapJSON(blocks);
    editor.commands.setContent(tiptapContent);
    // Reset the guard after ProseMirror has processed the transaction
    requestAnimationFrame(() => {
      isReplacingRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocId, editor]);

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
  //
  // The document title is a plain <input> sitting above the TipTap editor.
  // These shortcuts bridge the gap between the two:
  //
  //   Enter / Cmd+Enter → insert a new empty paragraph at the very top of
  //                       the editor (i.e. below the title) and focus it.
  //   ArrowDown / →     → focus the first block (↓ at end-of-text, → at end).
  //   ArrowUp / ←       → native <input> caret movement (no cross-over).
  // ------------------------------------------------------------------
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!editor) return;
    const el = e.currentTarget;
    const len = el.value.length;
    const isAtEnd =
      el.selectionStart === len && el.selectionEnd === len;

    // Enter / Cmd+Enter — insert a fresh paragraph below the title and edit it.
    // (Title is the top-most element; there is no "insert above" here.)
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      (e.metaKey || e.ctrlKey ? true : !e.repeat)
    ) {
      e.preventDefault();
      e.stopPropagation();
      editor
        .chain()
        .focus()
        // Insert an empty paragraph at document position 0 (before the first
        // block) so the cursor lands on a blank line instead of diving into
        // an existing block (e.g. a code block).
        .insertContentAt(0, { type: 'paragraph' })
        // Position 1 is inside the newly inserted paragraph.
        .setTextSelection(1)
        .run();
      return;
    }

    // ArrowDown (anywhere) or ArrowRight (at end) → enter the editor.
    if (e.key === 'ArrowDown' || (e.key === 'ArrowRight' && isAtEnd)) {
      e.preventDefault();
      editor.commands.focus('start');
      return;
    }
  };

  if (!hasActiveDoc) return null;

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-20 pt-8 pb-8 md:pb-12 bg-[var(--vscode-editor-background)] select-text">
        {/* Document Title */}
        <div className="pb-4">
          <input
            ref={titleInputRef}
            type="text"
            value={activeDocTitle}
            onChange={(e) => updateDocumentMeta({ title: e.target.value })}
            onKeyDown={handleTitleKeyDown}
            placeholder="文档标题"
            className="text-4xl font-bold text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none w-full placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-40 pb-1"
          />
        </div>

        {/* TipTap Editor */}
        <div className="tiptap-editor-container min-h-[50vh]">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
