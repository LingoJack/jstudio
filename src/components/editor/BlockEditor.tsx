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

import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '../../lib/editor/extensions/imageExtension';
import { FileExtension } from '../../lib/editor/extensions/fileExtension';
import { LinkExtension } from '../../lib/editor/extensions/linkExtension';
import { CollapsibleExtension } from '../../lib/editor/extensions/collapsibleExtension';
import { DiagramExtension } from '../../lib/editor/extensions/diagramExtension';
import Link from '@tiptap/extension-link';
import { customLinkAutolink } from '../../lib/editor/extensions/customLinkAutolink';
import { TextStyle } from '@tiptap/extension-text-style';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TextAlign from '@tiptap/extension-text-align';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';

import Color from '@tiptap/extension-color';

import { useStore } from '../../store/useStore';
import { flushDocumentSaves } from '../../store/storeHelpers';
import { useI18n } from '../../lib/core/i18n';
import {
  ourBlocksToTiptapJSON,
  tiptapJSONToOurBlocks,
} from '../../lib/editor/tiptapAdapter';
import { SlashMenuExtension } from '../../lib/editor/slashMenu';
import { CodeBlockWithChrome } from '../../lib/editor/extensions/codeBlockExtension';
import { BlockNavigation } from '../../lib/editor/blockNavigation';
import { BlockIdExtension } from '../../lib/editor/extensions/blockIdExtension';
import { lowlight } from '../../lib/editor/extensions/lowlight';
import { SelectAllText } from '../../lib/editor/extensions/selectAllText';
import { ImeCapsLockFix } from '../../lib/editor/extensions/imeCapsLockFix';
import { TaskListMarkdown } from '../../lib/editor/extensions/taskListMarkdown';
import { createPasteHandler, createDropHandler } from '../../lib/editor/editorPasteDrop';
import TableControls from './nodes/TableControls';
import FormatBubbleMenu from './FormatBubbleMenu';
import DocumentOutline from './DocumentOutline';
import { EditorCursorTrail } from '../ui/cursor/EditorCursorTrail';
import { CursorTrailProvider } from './CursorTrailContext';
import type { Block } from '../../types';
import { ListTree } from 'lucide-react';

export interface BlockEditorProps {
  /** When provided, the editor renders this static document instead of the
   *  store's active document. Used by HelpSection. */
  doc?: { title: string; blocks: Block[] };
  /** Render in read-only mode (no editing, no toolbar, no cursor trail). */
  readOnly?: boolean;
}

/**
 * Placeholder shown while a document's body is being committed into the
 * editor (or after a failed load). It is an OPAQUE overlay sitting on top of
 * the still-mounted editor, so the user never glimpses the outgoing
 * document's content under the incoming document's title. Its horizontal
 * padding mirrors the editor so the bars line up with where real text lands.
 */
function EditorSkeleton() {
  return (
    <div
      className="absolute inset-0 z-10 overflow-hidden px-4 md:px-12 lg:px-20 pt-2 bg-[var(--vscode-editor-background)]"
      aria-hidden="true"
    >
      <div className="space-y-3 animate-pulse">
        <div className="h-4 w-3/4 rounded bg-[var(--vscode-input-background)]" />
        <div className="h-4 w-11/12 rounded bg-[var(--vscode-input-background)]" />
        <div className="h-4 w-2/3 rounded bg-[var(--vscode-input-background)]" />
        <div className="h-4 w-5/6 rounded bg-[var(--vscode-input-background)]" />
        <div className="mt-8 h-24 w-full rounded bg-[var(--vscode-input-background)]" />
        <div className="mt-8 h-4 w-1/2 rounded bg-[var(--vscode-input-background)]" />
        <div className="h-4 w-4/5 rounded bg-[var(--vscode-input-background)]" />
        <div className="h-4 w-3/5 rounded bg-[var(--vscode-input-background)]" />
      </div>
    </div>
  );
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
  // Font settings — subscribed only to invalidate the cursor trail's cached
  // font metrics when any of them change (the trail caches font-size /
  // line-height per element for performance; these are the events that make
  // those values stale).
  const fontId = useStore((s) => s.fontId);
  const cjkFontId = useStore((s) => s.cjkFontId);
  const fontSize = useStore((s) => s.fontSize);
  const editorLineHeight = useStore((s) => s.editorLineHeight);
  const { t } = useI18n();

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  /** Tracks the document ID currently loaded into the editor to prevent
   *  reload loops. */
  const loadedDocIdRef = useRef<string | null>(null);
  /** Tracks WHICH editor instance loaded `loadedDocIdRef`. If the editor is
   *  recreated (TipTap StrictMode 1ms-destroy race, HMR, etc.) the new instance
   *  has NOT had the content loaded even though loadedDocIdRef matches — so we
   *  must force a reload. Without this, a recreated (empty) editor + the guard
   *  below would skip the reload and leave stale content showing. */
  const loadedEditorRef = useRef<Editor | null>(null);
  /** Debounce timer for store sync. */
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Handle for the idle callback that runs the heavy serialize/convert. */
  const idleHandleRef = useRef<number | null>(null);
  /** Guard: skip onUpdate when we programmatically replace content. */
  const isReplacingRef = useRef(false);
  /** Stable ref to the editor for use in callbacks without re-creating editor. */
  const editorRef = useRef<Editor | null>(null);
  /** Overlay div for the GPU cursor trail canvas. */
  const trailOverlayRef = useRef<HTMLDivElement | null>(null);
  /** The EditorCursorTrail instance. */
  const trailRef = useRef<EditorCursorTrail | null>(null);
  /**
   * The document id whose content is actually committed inside the editor.
   * The TITLE renders synchronously from `activeDoc.title` on every render,
   * but the BODY is set into ProseMirror from a `useEffect` (after paint) and
   * can lag — or, on a failed `setContent`, never catch up. Whenever this
   * lags behind `activeDocId` we render a skeleton instead of the previous
   * document's body, so the user never sees content that doesn't match the
   * title.
   */
  const [renderedDocId, setRenderedDocId] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Debounced content sync: editor → store
  //
  // The heavy part — editor.getJSON() (serializes the WHOLE ProseMirror
  // doc) + tiptapJSONToOurBlocks() (an O(blocks) deep conversion) — is
  // proportional to document size.  For large documents (thousands of
  // blocks) running it synchronously can drop a frame.  We therefore:
  //
  //   1. Debounce 300ms so it runs once per typing pause, not per keypress.
  //   2. Run the conversion in an IDLE callback so it yields to input/paint
  //      instead of blocking the keystroke that ended the debounce window.
  //
  // requestIdleCallback is only available in WKWebView since Safari 16.4,
  // so we feature-detect and fall back to a microtask-ish setTimeout(0).
  // ------------------------------------------------------------------
  const handleChange = useCallback(({ editor }: { editor: Editor }) => {
    // Skip if this change was triggered by our own setContent
    if (isReplacingRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      // Cancel any idle conversion still queued from a previous pause so we
      // never run two overlapping full conversions.
      if (idleHandleRef.current !== null) {
        if (typeof cancelIdleCallback !== 'undefined') {
          cancelIdleCallback(idleHandleRef.current);
        } else {
          clearTimeout(idleHandleRef.current);
        }
        idleHandleRef.current = null;
      }

      const runConvert = () => {
        idleHandleRef.current = null;
        const json = editor.getJSON();
        const blocks: Block[] = tiptapJSONToOurBlocks(json.content ?? []);
        // Tag the edits with the document they were serialized from, so the
        // store can drop them if the active document changed meanwhile.
        useStore.getState().setActiveDocBlocks(blocks, loadedDocIdRef.current ?? undefined);
      };

      if (typeof requestIdleCallback !== 'undefined') {
        // Cap the wait so a busy main thread can't starve the save forever.
        idleHandleRef.current = requestIdleCallback(runConvert, { timeout: 1000 });
      } else {
        idleHandleRef.current = window.setTimeout(runConvert, 0);
      }
    }, 300);
  }, []);

  // ------------------------------------------------------------------
  // Flush any pending (debounced/idle) edits SYNCHRONOUSLY to a given
  // document id. Cancels the outstanding timers, serializes the current
  // editor content, and persists it against `docId` (which may no longer be
  // the active document — e.g. when switching docs). Returns true if it ran.
  // ------------------------------------------------------------------
  const flushPendingEdits = useCallback((docId: string | null): boolean => {
    const pendingDebounce = saveTimeoutRef.current !== null;
    const pendingIdle = idleHandleRef.current !== null;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (idleHandleRef.current !== null) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(idleHandleRef.current);
      } else {
        clearTimeout(idleHandleRef.current);
      }
      idleHandleRef.current = null;
    }

    const ed = editorRef.current;
    if (
      !ed ||
      readOnly ||
      isReplacingRef.current ||
      !docId ||
      !(pendingDebounce || pendingIdle)
    ) {
      return false;
    }

    const json = ed.getJSON();
    const blocks: Block[] = tiptapJSONToOurBlocks(json.content ?? []);
    useStore.getState().flushBlocksToDoc(docId, blocks);
    return true;
  }, [readOnly]);

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
        // TipTap v3 StarterKit now bundles `Link` and `Underline` by default.
        // We disable StarterKit's `link` here because we configure our own
        // `Link` below (to force `inclusive() === false`, see the comment
        // there). Without `link: false` there would be TWO `link` marks
        // registered → TipTap "Duplicate extension names" warning + schema
        // ambiguity. (`Underline` we leave enabled in StarterKit and do NOT
        // re-add it explicitly below, for the same reason.)
        link: false,
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
      // The upstream Link extension defines `inclusive() { return this.options.autolink }`,
      // so with autolink on the link mark becomes *inclusive* — typing right
      // before/after a link (e.g. after pasting a URL) extends the link mark
      // onto the newly typed text. Force it non-inclusive so the link only
      // covers its own text; autolink detection still works because it re-scans
      // text via an appendTransaction plugin, independent of `inclusive`.
      Link.extend({
        inclusive() {
          return false;
        },
        addProseMirrorPlugins() {
          return [
            customLinkAutolink({
              type: this.type,
              defaultProtocol: 'https',
            }),
          ];
        },
      }).configure({
        openOnClick: readOnly, // allow link clicks in read-only mode
        autolink: false,
      }),
      // NOTE: `Underline` is provided by StarterKit v3 — do NOT add it
      // explicitly, or you get a "Duplicate extension names" warning + two
      // underline marks.
      TextStyle,
      Color,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      TaskListMarkdown,
      TextAlign.configure({
        types: ['paragraph', 'heading', 'blockquote'],
      }),
      BlockIdExtension,
      SelectAllText,
      ImeCapsLockFix,
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
        class: 'max-w-none focus:outline-none px-4 md:px-12 lg:px-20',
      },
      handlePaste: readOnly ? undefined : createPasteHandler(editorRef),
      handleDrop: readOnly ? undefined : createDropHandler(editorRef),
    },
  });

  // Keep editor ref in sync for async callbacks (paste/drop handlers)
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // -----------------------------------------------------------------
  // Cmd/Ctrl + ArrowLeft / ArrowRight → jump to block start / end
  //
  // macOS WKWebView (Tauri's webview) intercepts Cmd+Arrow at the
  // native level and calls preventDefault() before the event reaches
  // ProseMirror's handleKeyDown. So we must listen at the window
  // capture phase — the earliest point we can see the event — and
  // handle it ourselves.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (readOnly) return;

    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      // Cmd+Option+Arrow is the workspace tab-cycle shortcut — let it
      // pass through to the global handler in App.tsx.
      if (e.altKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      // ── Title <input> branch ──
      // When the title input is focused, Cmd/Ctrl+Arrow should jump to the
      // start / end of the title text (it is a single line), optionally
      // extending the selection with Shift — NOT move the editor below.
      // WKWebView intercepts Cmd+Arrow natively (see AGENTS.md trap #1), so
      // we must drive the input's selection ourselves here at the window
      // capture phase. preventDefault/stopPropagation keep the event from
      // reaching the input's own onKeyDown (which would treat a bare
      // ArrowRight at end-of-text as "enter the editor").
      const titleEl = titleInputRef.current;
      if (titleEl && document.activeElement === titleEl) {
        const toStart = e.key === 'ArrowLeft';
        const len = titleEl.value.length;
        const target = toStart ? 0 : len;
        if (e.shiftKey) {
          // Keep the fixed (anchor) end and move the caret end to the edge.
          const s = titleEl.selectionStart ?? 0;
          const en = titleEl.selectionEnd ?? 0;
          const anchor = titleEl.selectionDirection === 'backward' ? en : s;
          titleEl.setSelectionRange(
            Math.min(anchor, target),
            Math.max(anchor, target),
            target < anchor ? 'backward' : 'forward',
          );
        } else {
          titleEl.setSelectionRange(target, target);
        }
        // The trail re-measures on the input's 'select' event; nudge it too
        // in case the selection didn't actually change (already at the edge).
        trailRef.current?.markDirty();
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (!editor) return;

      const view = editor.view;
      const { state } = view;
      const { selection } = state;
      const $head = selection.$head;
      if ($head.depth < 1) return;

      const toStart = e.key === 'ArrowLeft';
      const extend = e.shiftKey;
      // Use $head.start() / $head.end() (defaults to $head.depth) so that we
      // always resolve to the **text block** boundary (paragraph/heading)
      // rather than the top-level node. For list items the paragraph lives at
      // depth 3 (doc > bulletList > listItem > paragraph); using depth 1 would
      // jump to the start/end of the *entire list* instead of the current item.
      const edge = toStart ? $head.start() : $head.end();

      const tr = extend
        ? state.tr.setSelection(
            TextSelection.create(state.doc, selection.$anchor.pos, edge),
          )
        : state.tr.setSelection(TextSelection.create(state.doc, edge));
      tr.setMeta('addToHistory', false);
      view.dispatch(tr);
      view.focus();
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [editor, readOnly]);

  // ------------------------------------------------------------------
  // Load content when switching documents, or once for a static doc
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!editor) return;

    // Static document mode — load once
    if (isStatic && doc) {
      loadedDocIdRef.current = '__static__';
      loadedEditorRef.current = editor;
      setRenderedDocId('__static__');
      const targetEditor = editor;
      const tiptapContent = ourBlocksToTiptapJSON(doc.blocks);
      // Defer to next macrotask to avoid flushSync-during-commit error.
      const loadTimer = setTimeout(() => {
        if (targetEditor.isDestroyed) return;
        isReplacingRef.current = true;
        try {
          targetEditor.commands.setContent(tiptapContent, { emitUpdate: false });
        } catch (e) {
          console.error('[BlockEditor] setContent failed for static doc:', e);
          console.error('[BlockEditor] tiptapContent that failed:', JSON.stringify(tiptapContent, null, 2));
        }
        requestAnimationFrame(() => {
          isReplacingRef.current = false;
        });
      }, 0);
      return () => clearTimeout(loadTimer);
    }

    if (!hasActiveDoc) {
      loadedDocIdRef.current = null;
      loadedEditorRef.current = null;
      setRenderedDocId(null);
      return;
    }

    // Only reload if BOTH the document id AND the editor instance match.
    //
    // The editor-instance check is essential in dev (StrictMode): TipTap's
    // `useEditor` can recreate the editor instance (its `scheduleDestroy`
    // 1ms timeout can fire before the post-paint effect cancels it), and the
    // recreated instance has NOT had any content loaded even though
    // loadedDocIdRef still matches the active doc. Without this check the
    // guard would skip the reload and leave a freshly-created (empty / stale)
    // editor showing the wrong content under the new document's title.
    if (
      loadedDocIdRef.current === activeDocId &&
      loadedEditorRef.current === editor
    ) {
      // Content is already the active doc's — just make sure the skeleton is
      // cleared (e.g. after a re-render where renderedDocId fell behind).
      if (renderedDocId !== activeDocId) setRenderedDocId(activeDocId);
      return;
    }

    // Before swapping content, flush the OUTGOING document's pending edits
    // against its own id, so switching docs within the debounce window does
    // not drop or misattribute the last edits.
    flushPendingEdits(loadedDocIdRef.current);

    // Capture the target id locally; it must not change under us mid-load.
    const targetDocId = activeDocId;

    // Read blocks from the store, keyed by activeDocId (this effect's dep) for
    // robustness — guarantees we never read a previous doc's blocks even if
    // activeDoc were to lag activeDocId by a render. (They are set atomically
    // by openDocument, but keying by the effect dep removes all doubt.)
    const blocks =
      useStore.getState().documents.find((d) => d.id === activeDocId)?.blocks ??
      [];

    // Mark as "loading in progress" synchronously so a concurrent effect run
    // doesn't also try to setContent. The actual markers (loadedDocIdRef etc.)
    // are committed inside the microtask after setContent succeeds.
    loadedDocIdRef.current = targetDocId;

    // Defer the setContent dispatch OUT of React's commit phase. When called
    // synchronously inside a useEffect, ProseMirror's updateChildren may mount
    // React NodeViews (code blocks, images, etc.) → TipTap calls flushSync →
    // "flushSync was called from inside a lifecycle method" error → transaction
    // interrupted → stale content.
    //
    // IMPORTANT: queueMicrotask is NOT sufficient — React 19 runs passive effects
    // via processRootScheduleInMicrotask, so a queued microtask can still fire
    // inside React's commit phase. setTimeout(0) defers to the NEXT macrotask,
    // guaranteeing React has finished its commit.
    const targetEditor = editor;
    const tiptapContent = ourBlocksToTiptapJSON(blocks);
    const loadTimer = setTimeout(() => {
      if (targetEditor.isDestroyed) return;
      isReplacingRef.current = true;
      try {
        // emitUpdate:false is CRITICAL. In TipTap v3 `setContent` defaults
        // emitUpdate to TRUE, so loading a document would fire onUpdate
        // (handleChange) and could serialize transitional/empty content back
        // into the store — i.e. one document's body leaking into another.
        targetEditor.commands.setContent(tiptapContent, { emitUpdate: false });
        loadedEditorRef.current = targetEditor;
        setRenderedDocId(targetDocId);
      } catch (e) {
        console.error('[BlockEditor] setContent failed for doc', targetDocId, e);
        // Recover to an empty body rather than displaying another document's
        // content. The title belongs to targetDocId, so a blank body is the
        // only non-misleading fallback. The user's data on disk is untouched.
        try {
          targetEditor.commands.setContent(
            { type: 'doc', content: [{ type: 'paragraph' }] },
            { emitUpdate: false },
          );
        } catch {
          // ignore — nothing more we can do
        }
        loadedEditorRef.current = targetEditor;
        setRenderedDocId(targetDocId);
      }

      // Reset the guard after ProseMirror has processed the transaction
      requestAnimationFrame(() => {
        isReplacingRef.current = false;
      });
    }, 0);
    // Cancel the deferred load if the effect re-runs before it fires (e.g.
    // editor recreated, or doc switched again during the 0ms window).
    return () => clearTimeout(loadTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocId, editor, isStatic, doc]);

  // ------------------------------------------------------------------
  // Cleanup on unmount (e.g. leaving the editor entirely)
  //
  // Flush any pending conversion SYNCHRONOUSLY so the last edits made in
  // the final debounce/idle window are not lost when the editor unmounts.
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      flushPendingEdits(loadedDocIdRef.current);
    };
  }, [flushPendingEdits]);

  // ------------------------------------------------------------------
  // App-close / window-hide safety net
  //
  // The editor→store sync (300ms) and store→disk save (500ms) are both
  // debounced, leaving up to an ~800ms window where the latest edits live
  // only in the editor. If the window closes in that window the edits are
  // lost. On pagehide/beforeunload we synchronously (a) push the editor's
  // pending content into the store, then (b) fire every pending document
  // save immediately. Fire-and-forget — a WebView can't await async IPC
  // here, but the synchronous invoke dispatch is enough in practice.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (readOnly) return;
    const handleClose = () => {
      flushPendingEdits(loadedDocIdRef.current);
      flushDocumentSaves();
    };
    window.addEventListener('pagehide', handleClose);
    window.addEventListener('beforeunload', handleClose);
    return () => {
      window.removeEventListener('pagehide', handleClose);
      window.removeEventListener('beforeunload', handleClose);
    };
  }, [readOnly, flushPendingEdits]);

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

    // The overlay now lives on the non-scrolling root (so the canvas stays
    // viewport-sized). Find the editor DOM within that root, and the editor's
    // nearest scrollable ancestor — that is the element whose `scroll` we must
    // watch to re-measure the caret (the overlay's parent does NOT scroll).
    const root = overlay.parentElement;
    const editorEl = root?.querySelector('.ProseMirror') as HTMLElement | null;
    if (!editorEl || !root) return;

    const getScrollParent = (el: HTMLElement | null): HTMLElement => {
      let n: HTMLElement | null = el?.parentElement ?? null;
      while (n) {
        const oy = getComputedStyle(n).overflowY;
        if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return n;
        n = n.parentElement;
      }
      return root;
    };
    const scrollContainer = getScrollParent(editorEl);

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

    // ── Event-driven caret re-measurement ──
    // The trail animation runs every frame, but the caret GEOMETRY only
    // changes on these events.  We mark the trail "dirty" so it re-measures
    // exactly once per change instead of probing the DOM 60×/second.
    const markDirty = () => trail.markDirty();
    editor.on('selectionUpdate', markDirty);
    editor.on('update', markDirty);
    editor.on('focus', markDirty);
    editor.on('blur', markDirty);

    // The document title is a native <input> OUTSIDE ProseMirror, so its
    // caret changes raise none of the editor events above. Register it with
    // the trail (so it can measure the title caret via its mirror) and wire
    // its own caret-moving events to the same markDirty.
    const titleInput = titleInputRef.current;
    trail.setTitleEl(titleInput);
    const titleEvents = ['input', 'keyup', 'click', 'focus', 'blur', 'select', 'scroll'] as const;
    if (titleInput) {
      for (const ev of titleEvents) titleInput.addEventListener(ev, markDirty);
    }
    // Scrolling shifts the caret within the canvas-local coordinate space.
    // Use the CAPTURE phase: `scroll` does NOT bubble, so a listener on the
    // outer scrollContainer would miss inner scroll containers (e.g. a code
    // block's `<pre overflow:auto>`). The capture phase runs on ancestors on
    // the way down to the target, so it still catches descendant scrolls.
    scrollContainer.addEventListener('scroll', markDirty, {
      passive: true,
      capture: true,
    });

    // Safety net: some reflows raise none of the above events (e.g. an
    // async-loaded image pushing content down, web-font swap).  A low-
    // frequency poll catches those without reintroducing per-frame cost.
    //
    // Gate it on focus: a blurred editor has no caret, so nothing can
    // reflow *under the cursor* — and markDirty() now wakes the parked rAF
    // loop (see EditorCursorTrail.markDirty → BaseCursorTrail.wake).  Polling
    // unconditionally would therefore resurrect the loop every 400ms even
    // when the editor is unfocused and the trail has correctly parked,
    // defeating the idle-parking optimization.  Only poll while focused.
    const safetyTick = window.setInterval(() => {
      if (editor.isFocused) markDirty();
    }, 400);

    // Resize observer to keep canvas in sync with the viewport-sized overlay.
    const resizeObserver = new ResizeObserver(() => {
      trail.resize();
    });
    resizeObserver.observe(overlay);

    return () => {
      window.clearInterval(safetyTick);
      scrollContainer.removeEventListener('scroll', markDirty, { capture: true });
      editor.off('selectionUpdate', markDirty);
      editor.off('update', markDirty);
      editor.off('focus', markDirty);
      editor.off('blur', markDirty);
      if (titleInput) {
        for (const ev of titleEvents) titleInput.removeEventListener(ev, markDirty);
      }
      resizeObserver.disconnect();
      trail.dispose();
      trailRef.current = null;
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [editor]);

  // ── Live theme update for cursor trail ──
  // When the app theme changes, update the cursor trail color from CSS variables.
  useEffect(() => {
    if (readOnly) return;
    const trail = trailRef.current;
    if (!trail) return;

    const updateColor = () => {
      const cssColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--vscode-editorCursor-foreground')
          .trim() ||
        getComputedStyle(document.documentElement)
          .getPropertyValue('--vscode-focusBorder')
          .trim() ||
        '#007fd4';
      trail.setColor(cssColor);
    };

    // Initial update
    updateColor();

    // Observe CSS variable changes on <html>
    const observer = new MutationObserver(() => {
      updateColor();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });

    return () => observer.disconnect();
  }, [readOnly]);

  // ------------------------------------------------------------------
  // Cursor rendering is fully owned by the WebGL EditorCursorTrail:
  // the trail draws the cursor SHAPE (bar / block / underline) as a solid
  // fill and animates both motion (kitty comet easing) and blink (smooth
  // sine fade).  The native browser caret is therefore hidden — it can
  // only ever be a thin vertical line and would clash with block/underline.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (readOnly) return;
    trailRef.current?.setCursorStyle(editorCursorStyle);
    const editorDom = editor?.view?.dom as HTMLElement | undefined;
    const titleInput = titleInputRef.current;
    // The trail draws the caret SHAPE; hide the native caret on BOTH the
    // editor surface and the title input so a thin native bar doesn't show
    // through under the trail.
    if (editorDom) editorDom.style.caretColor = 'transparent';
    if (titleInput) titleInput.style.caretColor = 'transparent';
    return () => {
      if (editorDom) editorDom.style.caretColor = '';
      if (titleInput) titleInput.style.caretColor = '';
    };
  }, [editorCursorStyle, editor, readOnly]);

  // ------------------------------------------------------------------
  // Invalidate the cursor trail's cached font metrics when any editor font
  // setting changes.  The trail caches per-element font-size / line-height
  // (read via getComputedStyle, which forces a style recalc) and assumes
  // they are stable while typing.  These four settings are the only things
  // that change them, so we flush the cache here — cheap, and keeps the
  // measured caret geometry correct after a font/size/line-height change.
  // The actual CSS application lives elsewhere; we wait a frame so the new
  // styles are computed before the trail re-measures.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (readOnly) return;
    const id = requestAnimationFrame(() => {
      trailRef.current?.invalidateMetrics();
    });
    return () => cancelAnimationFrame(id);
  }, [fontId, cjkFontId, fontSize, editorLineHeight, readOnly]);

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
  //
  // We must distinguish a genuine CLICK from a drag-selection that ends
  // outside the .ProseMirror boundary.  We do this by recording the mouse
  // position on mousedown; if the mouse moved more than a few pixels before
  // mouseup→click, we treat it as a drag and do NOT refocus.
  // ------------------------------------------------------------------
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    },
    [],
  );

  const handleBlankAreaClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!editor) return;

      // If the mouse moved between mousedown and click, it was a drag-
      // selection, not a click — do not steal focus.
      const down = mouseDownPosRef.current;
      if (down) {
        const dx = Math.abs(e.clientX - down.x);
        const dy = Math.abs(e.clientY - down.y);
        if (dx > 3 || dy > 3) return; // dragged more than 3px → selection
      }
      mouseDownPosRef.current = null;

      const target = e.target as HTMLElement;
      // Skip if clicking inside ProseMirror (editor handles its own clicks)
      if (target.closest('.ProseMirror')) return;
      // Skip if clicking the title input
      if (target.tagName === 'INPUT') return;
      // Only jump to end if the click lands BELOW the editor's content area.
      // Without this guard, clicks on the title container's padding (the gap
      // between the title <input> and the first heading) also satisfy the
      // "not in ProseMirror / not an INPUT" condition and would jump the
      // cursor to the very bottom of the document — confusing UX where
      // clicking empty space near the top sends you to the end.
      const proseMirrorEl = editor.view.dom as HTMLElement;
      const pmRect = proseMirrorEl.getBoundingClientRect();
      if (e.clientY < pmRect.top) return;
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
        <div className="flex-1 overflow-y-auto pt-8 pb-8 md:pb-12 bg-[var(--vscode-editor-background)] select-text">
          {/* Document Title (static text, not editable) */}
          <div className="px-4 md:px-12 lg:px-20 pb-4">
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
          <button
            onClick={toggleOutline}
            title={isOutlineOpen ? t('outline.hide') : t('outline.show')}
            className="absolute top-3 right-3 z-30 p-1.5 rounded-md transition-colors duration-150 cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
          >
            <ListTree className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // ── Normal editing mode ──
  if (!hasActiveDoc) return null;

  // Show the skeleton whenever the editor body has not yet caught up with the
  // active document (during a tab switch, or after a failed load). This is
  // what guarantees the user never sees a body that doesn't match the title.
  const showSkeleton = renderedDocId !== activeDocId;

  return (
    <div className="flex h-full overflow-hidden relative bg-[var(--vscode-editor-background)]">
      <CursorTrailProvider trailRef={trailRef}>
        <div className="flex-1 overflow-y-auto pb-8 md:pb-12 select-text"
          onMouseDown={handleMouseDown}
          onClick={handleBlankAreaClick}
        >
        {/* Document Title */}
        <div className="px-4 md:px-12 lg:px-20 pt-12 pb-4">
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
          {showSkeleton && <EditorSkeleton />}
        </div>

        {/* Selection-triggered formatting toolbar (Bold/Italic/Strike/Code) */}
        {editor && <FormatBubbleMenu editor={editor} />}

        {/* Table hover controls + context menu */}
        {editor && <TableControls editor={editor} />}
      </div>
      </CursorTrailProvider>

      {/* GPU cursor trail overlay.
          IMPORTANT: it lives here, on the non-scrolling `relative` root, NOT
          inside the scrolling content. That keeps the WebGL canvas sized to
          the VIEWPORT (one screen) instead of the full document height —
          otherwise a long document makes the canvas exceed the browser's max
          canvas/GL dimensions, and the cursor vanishes once scrolled past
          that limit. The caret's viewport coordinates map straight into this
          fixed-size overlay; scrolling just re-measures the caret. */}
      <div
        ref={trailOverlayRef}
        className="absolute inset-0"
        style={{ pointerEvents: 'none', zIndex: 5 }}
      />

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
