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
 *
 * When called with `{ doc, readOnly }` props the editor renders as a static,
 * non-editable document — used by HelpSection. This guarantees that any change
 * to the rendering extensions / styles here is automatically reflected in the
 * help document.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '../lib/imageExtension';
import { FileExtension } from '../lib/fileExtension';
import { LinkExtension } from '../lib/linkExtension';
import { CollapsibleExtension } from '../lib/collapsibleExtension';
import { DiagramExtension } from '../lib/diagramExtension';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TextAlign from '@tiptap/extension-text-align';
import { Markdown } from '@tiptap/markdown';

import Color from '@tiptap/extension-color';

import { useStore } from '../store/useStore';
import { useI18n } from '../lib/i18n';
import {
  ourBlocksToTiptapJSON,
  tiptapJSONToOurBlocks,
} from '../lib/tiptapAdapter';
import { SlashMenuExtension } from '../lib/tiptapExtensions';
import { CodeBlockWithChrome } from '../lib/codeBlockExtension';
import { BlockNavigation } from '../lib/blockNavigation';
import { BlockIdExtension } from '../lib/blockIdExtension';
import { lowlight } from '../lib/extensions/lowlight';
import { SelectAllText } from '../lib/extensions/selectAllText';
import { createPasteHandler, createDropHandler } from '../lib/editorPasteDrop';
import TableControls from './TableControls';
import FormatBubbleMenu from './FormatBubbleMenu';
import DocumentOutline from './DocumentOutline';
import { EditorCursorTrail } from './EditorCursorTrail';
import type { Block } from '../types';
import { ListTree } from 'lucide-react';

export interface BlockEditorProps {
  /** When provided, the editor renders this static document instead of the
   *  store's active document. Used by HelpSection. */
  doc?: { title: string; blocks: Block[] };
  /** Render in read-only mode (no editing, no toolbar, no cursor trail). */
  readOnly?: boolean;
}

export default function BlockEditor({ doc, readOnly }: BlockEditorProps = {}) {
  // ── Read-only / static-document mode ──────────────────────────────
  const isStatic = !!doc;

  // Only subscribe to the fields this component actually renders, so that
  // setActiveDocBlocks() (fires on every debounce tick) — which replaces the
  // activeDoc reference — does NOT trigger a re-render here.  Re-rendering the
  // component while ProseMirror is mid-transaction causes visible cursor lag,
  // especially inside code blocks.
  const activeDocId = useStore((s) => s.activeDocId);
  const activeDocTitle = useStore((s) => s.activeDoc?.title ?? '');
  const hasActiveDoc = useStore((s) => !!s.activeDoc);
  const updateDocumentMeta = useStore((s) => s.updateDocumentMeta);
  const isOutlineOpen = useStore((s) => s.isOutlineOpen);
  const toggleOutline = useStore((s) => s.toggleOutline);
  const editorCursorStyle = useStore((s) => s.editorCursorStyle);
  const { t } = useI18n();

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
  /** Overlay div for the GPU cursor trail canvas. */
  const trailOverlayRef = useRef<HTMLDivElement | null>(null);
  /** The EditorCursorTrail instance. */
  const trailRef = useRef<EditorCursorTrail | null>(null);

  // ------------------------------------------------------------------
  // Debounced content sync: editor → store
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
  // Focus the title input at end (used by BlockNavigation extension)
  // ------------------------------------------------------------------
  const focusTitleEnd = useCallback(() => {
    const el = titleInputRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        codeBlock: false, // replaced by CodeBlockLowlight
        code: false,      // replaced by custom Code below (allows coexistence
                          // with bold/italic for Markdown import compatibility)
      }),
      // Custom Code mark: the default Code extension sets `excludes: '_'`
      // which makes inline code mutually exclusive with every other mark.
      // That causes `RangeError: Invalid collection of marks for node text:
      // bold,code` when Markdown like **`code`** is parsed. We allow code to
      // coexist with other marks.
      Code.extend({ excludes: '' }),
      CodeBlockWithChrome.configure({
        lowlight,
        defaultLanguage: 'plaintext',
        exitOnTripleEnter: false,
      }),
      Placeholder.configure({
        placeholder: t('editor.placeholder'),
      }),
      Image.configure({ inline: false, allowBase64: true }),
      FileExtension,
      LinkExtension,
      CollapsibleExtension,
      DiagramExtension,
      Link.configure({
        openOnClick: readOnly, // allow link clicks in read-only mode
        autolink: true,
      }),
      Underline,
      TextStyle,
      Color,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({
        types: ['paragraph', 'heading', 'blockquote'],
      }),
      BlockIdExtension,
      SelectAllText,
      SlashMenuExtension,
      BlockNavigation.configure({
        onExitToTitle: () => focusTitleEnd(),
      }),
      Markdown.configure({
        markedOptions: { gfm: true, breaks: true },
      }),
    ],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: readOnly ? undefined : handleChange,
    editorProps: {
      attributes: {
        class: 'max-w-none focus:outline-none',
      },
      handlePaste: readOnly ? undefined : createPasteHandler(editorRef),
      handleDrop: readOnly ? undefined : createDropHandler(editorRef),
    },
  });

  // Keep editor ref in sync for async callbacks (paste/drop handlers)
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // ------------------------------------------------------------------
  // Load content when switching documents, or once for a static doc
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!editor) return;

    // Static document mode — load once
    if (isStatic && doc) {
      loadedDocIdRef.current = '__static__';
      isReplacingRef.current = true;
      const tiptapContent = ourBlocksToTiptapJSON(doc.blocks);
      editor.commands.setContent(tiptapContent);
      // DEBUG: verify content loaded
      console.log('[Help] static content loaded, heading count:', tiptapContent.filter(n => n.type === 'heading').length);
      console.log('[Help] doc child count after setContent:', editor.state.doc.childCount);
      requestAnimationFrame(() => {
        isReplacingRef.current = false;
      });
      return;
    }

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
  }, [activeDocId, editor, isStatic, doc]);

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
  // GPU cursor trail — kitty-style comet-tail animation
  //
  // A WebGL2 overlay canvas sits above the editor (pointer-events: none).
  // It reads the browser caret position via the Selection API each frame
  // and renders a smooth trailing quad that chases the caret with
  // exponential ease-out.  Pure visual — no interaction interception.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!editor) return;
    if (readOnly) return; // no cursor trail in read-only mode

    const overlay = trailOverlayRef.current;
    if (!overlay) return;

    // Wait for the ProseMirror DOM to be mounted
    const editorEl = overlay.parentElement?.querySelector('.ProseMirror') as HTMLElement | null;
    const scrollContainer = overlay.parentElement;
    if (!editorEl || !scrollContainer) return;

    // Resolve trail color from CSS variables, with fallbacks
    const cssColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--vscode-editorCursor-foreground')
        .trim() ||
      getComputedStyle(document.documentElement)
        .getPropertyValue('--vscode-focusBorder')
        .trim() ||
      '#007fd4';

    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    });
    overlay.appendChild(canvas);

    let trail: EditorCursorTrail;
    try {
      trail = new EditorCursorTrail(canvas, cssColor, editorEl, scrollContainer);
    } catch {
      // WebGL2 not available — silently skip the trail.
      overlay.removeChild(canvas);
      return;
    }

    trail.resize();
    trail.start();
    trailRef.current = trail;

    // Resize observer to keep canvas in sync with container size
    const resizeObserver = new ResizeObserver(() => {
      trail.resize();
    });
    resizeObserver.observe(scrollContainer);

    return () => {
      resizeObserver.disconnect();
      trail.dispose();
      trailRef.current = null;
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [editor]);

  // ------------------------------------------------------------------
  // Sync cursor style → trail geometry + native caret visibility
  //
  // Same approach as the terminal: the trail only renders the comet-tail
  // animation (cutout mode).  The actual cursor shape for 'bar' is the
  // browser's native caret; for 'block'/'underline' the native caret is
  // hidden and a solid cursor is drawn by the trail's fill geometry.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (readOnly) return; // no cursor style manipulation in read-only mode
    trailRef.current?.setCursorStyle(editorCursorStyle);
    const editorDom = editorRef.current?.view?.dom as HTMLElement | undefined;
    if (editorDom) {
      // 'bar' uses the native caret (thin vertical line).
      // 'block'/'underline' hide the native caret; the trail renders a
      // solid cursor at the caret position (no blink, like xterm).
      editorDom.style.caretColor =
        editorCursorStyle === 'bar' ? '' : 'transparent';
    }
  }, [editorCursorStyle]);

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

  // ------------------------------------------------------------------
  // Click on blank area below editor content — focus end of document
  // ------------------------------------------------------------------
  const handleBlankAreaClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!editor) return;
      const target = e.target as HTMLElement;
      // Skip if clicking inside ProseMirror (editor handles its own clicks)
      if (target.closest('.ProseMirror')) return;
      // Skip if clicking the title input
      if (target.tagName === 'INPUT') return;
      // Focus to end of document (works even if last block is an empty paragraph)
      editor.chain().focus('end').run();
    },
    [editor],
  );

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  // ── Static / read-only mode ──
  if (isStatic && doc) {
    return (
      <div className="flex h-full bg-transparent overflow-hidden relative">
        <div className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-20 pt-8 pb-8 md:pb-12 bg-[var(--vscode-editor-background)] select-text">
          {/* Document Title (static text, not editable) */}
          <div className="pb-4">
            <h1 className="text-4xl font-bold text-[var(--vscode-editor-foreground)] pb-1">
              {doc.title}
            </h1>
          </div>

          {/* TipTap Editor (read-only) */}
          <div className="tiptap-editor-container min-h-[50vh] relative">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Outline panel (conditional) — same as editing mode */}
        {editor && isOutlineOpen && <DocumentOutline editor={editor} />}

        {/* Outline toggle icon */}
        {editor && (
          isOutlineOpen ? (
            <button
              onClick={toggleOutline}
              title={t('outline.hide')}
              className="absolute top-2.5 right-2 z-30 p-1.5 rounded-md transition-colors duration-150 cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
            >
              <ListTree className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={toggleOutline}
              title={t('outline.show')}
              className="absolute top-3 right-3 z-30 p-1.5 rounded-md transition-colors duration-150 cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
            >
              <ListTree className="w-4 h-4" />
            </button>
          )
        )}
      </div>
    );
  }

  // ── Normal editing mode ──
  if (!hasActiveDoc) return null;

  return (
    <div className="flex h-full bg-transparent overflow-hidden relative">
      <div
        className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-20 pt-8 pb-8 md:pb-12 bg-[var(--vscode-editor-background)] select-text"
        onClick={handleBlankAreaClick}
      >
        {/* Document Title */}
        <div className="pb-4">
          <input
            ref={titleInputRef}
            type="text"
            value={activeDocTitle}
            onChange={(e) => updateDocumentMeta({ title: e.target.value })}
            onKeyDown={handleTitleKeyDown}
            placeholder={t('editor.titlePlaceholder')}
            className="text-4xl font-bold text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none w-full placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-40 pb-1"
          />
        </div>

        {/* TipTap Editor */}
        <div className="tiptap-editor-container min-h-[50vh] relative">
          <EditorContent editor={editor} />

          {/* GPU cursor trail overlay */}
          <div
            ref={trailOverlayRef}
            className="absolute inset-0"
            style={{ pointerEvents: 'none', zIndex: 5 }}
          />
        </div>

        {/* Selection-triggered formatting toolbar (Bold/Italic/Strike/Code) */}
        {editor && <FormatBubbleMenu editor={editor} />}

        {/* Table hover controls + context menu */}
        {editor && <TableControls editor={editor} />}
      </div>

      {/* Outline panel (conditional) */}
      {editor && isOutlineOpen && <DocumentOutline editor={editor} />}

      {/* Outline toggle icon
          - When outline is CLOSED: floats at top-right of editor area
          - When outline is OPEN: sits inside outline header, no overlap */}
      {isOutlineOpen ? (
        <button
          onClick={toggleOutline}
          title={t('outline.hide')}
          className="absolute top-2.5 right-2 z-30 p-1.5 rounded-md transition-colors duration-150 cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
        >
          <ListTree className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={toggleOutline}
          title={t('outline.show')}
          className="absolute top-3 right-3 z-30 p-1.5 rounded-md transition-colors duration-150 cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
        >
          <ListTree className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
