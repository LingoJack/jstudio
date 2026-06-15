/**
 * BlockEditor — the main document editing surface.
 *
 * This is a thin wrapper around BlockNote's `BlockNoteView`. BlockNote handles
 * all contentEditable complexity (cursor, selection, undo/redo, paste, slash
 * commands, drag-and-drop). We only manage:
 *
 *   1. Document title input
 *   2. Initial content loading when switching documents
 *   3. Debounced content sync back to our Zustand store
 *
 * Data flow:
 *
 *   store.activeDoc.blocks  →  ourBlocksToBlockNote()  →  editor initialContent
 *   editor.document         →  blockNoteToOurBlocks()  →  store.setActiveDocBlocks()
 *
 * The two systems are decoupled by the adapter layer (`lib/blockNoteAdapter`).
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  useCreateBlockNote,
  SuggestionMenuController,
} from '@blocknote/react';
import { getDefaultReactSlashMenuItems } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

import { useStore } from '../store/useStore';
import { storage } from '../lib/storage';
import {
  ourBlocksToBlockNote,
  blockNoteToOurBlocks,
} from '../lib/blockNoteAdapter';
import type { Block } from '../types';

export default function BlockEditor() {
  const activeDoc = useStore((s) => s.activeDoc);
  const updateDocumentMeta = useStore((s) => s.updateDocumentMeta);
  const isDarkMode = useStore((s) => s.isDarkMode);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  /** Tracks the document ID currently loaded into the editor to prevent
   *  reload loops. */
  const loadedDocIdRef = useRef<string | null>(null);
  /** Debounce timer for store sync. */
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Guard: skip onChange when we programmatically replace content. */
  const isReplacingRef = useRef(false);

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

      // BlockNote needs a displayable URL. We read it back as base64 data URL.
      const base64 = await storage.readDocAssetBase64(activeDocId, fileName);
      const mime = file.type || 'image/png';
      return `data:${mime};base64,${base64}`;
    },
    [],
  );

  // ------------------------------------------------------------------
  // Create the BlockNote editor instance (once)
  // ------------------------------------------------------------------
  const editor = useCreateBlockNote({
    initialContent: [
      { type: 'paragraph', content: [] },
    ],
    uploadFile,
  });

  // ------------------------------------------------------------------
  // Slash menu — only show items we support.
  // We disable BlockNote's default slash menu and render our own
  // SuggestionMenuController with a filtered item list.
  // ------------------------------------------------------------------
  const allowedKeys = [
    'heading',
    'heading_2',
    'heading_3',
    'code_block',
    'image',
  ];

  const getSlashMenuItems = useCallback(
    async (query: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all = getDefaultReactSlashMenuItems(editor as any);
      const filtered = all.filter((item: any) =>
        allowedKeys.includes(item.key),
      );
      // Simple client-side filtering by query
      if (!query) return filtered;
      const q = query.toLowerCase();
      return filtered.filter(
        (item: any) =>
          item.title?.toLowerCase().includes(q) ||
          item.aliases?.some((a: string) => a.toLowerCase().includes(q)),
      );
    },
    [editor],
  );

  // ------------------------------------------------------------------
  // Load content when switching documents
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!activeDoc) {
      loadedDocIdRef.current = null;
      return;
    }

    // Only reload if the document actually changed
    if (loadedDocIdRef.current === activeDoc.id) return;
    loadedDocIdRef.current = activeDoc.id;

    isReplacingRef.current = true;
    const bnBlocks = ourBlocksToBlockNote(activeDoc.blocks);
    editor.replaceBlocks(editor.document, bnBlocks);
    // Reset the guard after ProseMirror has processed the transaction
    requestAnimationFrame(() => {
      isReplacingRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDoc?.id]);

  // ------------------------------------------------------------------
  // Debounced content sync — editor → store
  // ------------------------------------------------------------------
  const handleChange = useCallback(() => {
    // Skip if this change was triggered by our own replaceBlocks
    if (isReplacingRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const blocks: Block[] = blockNoteToOurBlocks(editor.document);
      useStore.getState().setActiveDocBlocks(blocks);
    }, 300);
  }, [editor]);

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
    if (!activeDoc) return;
    const el = e.currentTarget;
    const isAtEnd =
      el.selectionStart === el.value.length &&
      el.selectionEnd === el.value.length;

    if (e.key === 'ArrowDown' && isAtEnd) {
      e.preventDefault();
      // Focus the first block in the editor
      editor.focus();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      editor.focus();
    }
  };

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

        {/* BlockNote Editor */}
        <div className="bn-editor-container min-h-[50vh]">
          <BlockNoteView
            editor={editor}
            onChange={handleChange}
            theme={isDarkMode ? "dark" : "light"}
            slashMenu={false}
          >
            <SuggestionMenuController
              triggerCharacter="/"
              getItems={getSlashMenuItems}
            />
          </BlockNoteView>
        </div>
      </div>
    </div>
  );
}
