/**
 * DocumentPanel — high-performance editor that renders one document as
 * N independent section editors to fix large-document typing lag.
 *
 * Strategy:
 *   - Split activeDoc.blocks into fixed-size sections (~SECTION_SIZE blocks).
 *   - Render one <SectionEditor> per section, each with its own ProseMirror
 *     instance, so a keystroke only re-lays-out its own ~30-block section
 *     instead of the whole 232KB contenteditable.
 *   - On a section edit, replace that section's slice and write the
 *     reassembled full Block[] back to the store (same debounced save path).
 *
 * Feature set (ported from the retired single-editor implementation; see
 * git history for the original EditorPanel.tsx):
 *   - Shared GPU cursor trail (viewport-sized canvas)
 *   - Title input with Enter → insert paragraph, ArrowDown → enter editor
 *   - SectionOutline panel with toggle button
 *   - FormatBubbleMenu + TableControls (rendered against focused section)
 *   - Paste/drop handlers (image/file special handling)
 *   - BlockNavigation (Tab, Cmd+Enter, Backspace on empty codeBlock, etc.)
 *   - Cross-section caret navigation + Backspace merge
 *   - Cross-section text selection (drag, Cmd+A, copy/cut/delete) via
 *     `useCrossSectionSelection`
 *   - Static/read-only rendering mode via `{ doc, readOnly }` props (used by
 *     HelpSection)
 *
 * Known limitation:
 *   - Sections are recomputed only on document switch, not live re-balanced
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { TextSelection, NodeSelection } from '@tiptap/pm/state';
import { Clock, ListTree } from 'lucide-react';

import { useStore } from '../../../store/useStore';
import { useI18n, type Language, type TranslationKey } from '../../../lib/core/i18n';
import { handleNativeSelectAll } from '../../../lib/shortcuts/nativeSelectAll';
import { eventToBinding, resolveBinding } from '../../../lib/shortcuts/keyboardShortcuts';
import {
  setFocusedEditor as setFocusedEditorRegistry,
  clearFocusedEditor as clearFocusedEditorRegistry,
  getFocusedEditor as getFocusedEditorRegistry,
} from '../../../lib/editor/focusedEditorRegistry';
import { registerSelectAllHandler } from '../../../lib/editor/selectAllRegistry';
import { flushDocumentSaves } from '../../../store/storeHelpers';
import { formatDate } from '../../../lib/commandPalette/shared';
import { countBlockCharacters } from '../../../lib/documents/charCount';
import { isDocumentEmpty } from '../../../lib/documents/isDocumentEmpty';
import { formatRelativeEditedTime } from '../../../lib/documents/formatRelativeEditedTime';
import { editorForKeyboardTarget } from '../../../lib/editor/editorForKeyboardTarget';
import { logicalCodeLineBoundary, visualCodeLineBoundary } from '../../../lib/editor/codeLineBoundary';
import FormatBubbleMenu from '../FormatBubbleMenu';
import TableControls from '../nodes/TableControls';
import type { Block } from '../../../types';
import SectionEditor, { type SectionFocusHandle } from './SectionEditor';
import SectionOutline from './SectionOutline';
import { useCrossSectionSelection, type CrossSelectionContext } from './useCrossSectionSelection';
import { useCrossSectionFind } from './useCrossSectionFind';
import FindBar from './FindBar';
import { EditorSkeleton } from './SectionSkeleton';
import { useCursorTrail } from './useCursorTrail';
import { useSectionLoader } from './useSectionLoader';
import {
  CursorTrailProvider,
  CursorTrailRegistry,
} from '../CursorTrailContext';

export interface DocumentPanelProps {
  /** When provided, the editor renders this static document instead of the
   *  store's active document. Used by HelpSection. */
  doc?: { title: string; blocks: Block[] };
  /** Render in read-only mode (no editing, no toolbar, no cursor trail). */
  readOnly?: boolean;
  /** Document identity committed by the main-window transition boundary. */
  contentDocId?: string;
}

export default function DocumentPanel({
  doc,
  readOnly,
  contentDocId,
}: DocumentPanelProps = {}) {
  const { t, language } = useI18n();
  // ── Read-only / static-document mode ──────────────────────────────
  const isStatic = !!doc;
  const storeActiveDocId = useStore((s) => s.activeDocId);
  const editorDocId = contentDocId ?? storeActiveDocId;
  const activeDocReloadNonce = useStore((s) =>
    s.activeDocId === editorDocId ? s.activeDocReloadNonce : 0,
  );
  const activeDocTitle = useStore(
    (s) => s.documents.find((item) => item.id === editorDocId)?.title ?? '',
  );
  const activeDocUpdatedAt = useStore(
    (s) => s.documents.find((item) => item.id === editorDocId)?.updatedAt ?? '',
  );
  const activeDocBlocks = useStore(
    (s) => s.documents.find((item) => item.id === editorDocId)?.blocks,
  );
  const charCount = useMemo(
    () => countBlockCharacters(activeDocBlocks ?? []),
    [activeDocBlocks],
  );
  const hasActiveDoc = useStore((s) =>
    s.documents.some((item) => item.id === editorDocId),
  );
  const updateDocumentMeta = useStore((s) => s.updateDocumentMeta);
  const editorCursorStyle = useStore((s) => s.editorCursorStyle);
  const editorCursorAnimationEnabled = useStore((s) => s.editorCursorAnimationEnabled);
  const isOutlineOpen = useStore((s) => s.isOutlineOpen);
  const toggleOutline = useStore((s) => s.toggleOutline);

  // Sections are built once per document load. We hold them in a ref-backed
  // state so section edits mutate the slice in place without re-rendering
  // (and thus remounting) sibling sections.

  // ── Stable caret-host registry + single shared cursor trail ──
  const cursorTrailRegistry = useMemo(() => new CursorTrailRegistry(), []);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const titleHostDisposerRef = useRef<(() => void) | null>(null);
  const setTitleInputRef = useCallback((el: HTMLInputElement | null) => {
    titleHostDisposerRef.current?.();
    titleHostDisposerRef.current = null;
    titleInputRef.current = el;
    if (el) titleHostDisposerRef.current = cursorTrailRegistry.registerNativeHost(el);
  }, [cursorTrailRegistry]);

  useEffect(() => () => {
    titleHostDisposerRef.current?.();
    cursorTrailRegistry.dispose();
  }, [cursorTrailRegistry]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionsWrapperRef = useRef<HTMLDivElement | null>(null);
  const notifyCaret = useCallback(() => {
    cursorTrailRegistry.markDirty();
  }, [cursorTrailRegistry]);

  // ── Track the currently focused section's editor for FormatBubbleMenu /
  //    TableControls. Each SectionEditor calls onEditorReady when its editor
  //    is ready, and we track which one has focus via the 'focus' event.
  const focusedEditorRef = useRef<Editor | null>(null);
  const [focusedEditor, setFocusedEditor] = useState<Editor | null>(null);
  const sectionEditorsRef = useRef<Map<string, Editor>>(new Map());
  /** Latest `crossSel.selectAll` (declared further down, after the refs it
   *  depends on). Populated on every render so the window-capture Cmd+A
   *  handler below — which is defined earlier in this component and must
   *  stay a stable effect — can always reach the current implementation. */
  const crossSelectAllRef = useRef<(() => void) | null>(null);

  const handleEditorReady = useCallback((sectionId: string, ed: Editor) => {
    sectionEditorsRef.current.set(sectionId, ed);
    // Listen for focus to track which editor is active.
    ed.on('focus', () => {
      focusedEditorRef.current = ed;
      setFocusedEditor(ed);
      // Mirror to the module-level registry so commandRegistry can dispatch
      // editor-scoped actions (e.g. editor.inlineCode from the macOS native
      // Format menu) without DOM target context.
      setFocusedEditorRegistry(ed);
    });
    // Clean up the map entry + focused refs when this editor is destroyed
    // (section unmounted, e.g. after a re-balance remount) so stale instances
    // don't accumulate or leave a destroyed editor as the "focused" one.
    ed.on('destroy', () => {
      if (sectionEditorsRef.current.get(sectionId) === ed) {
        sectionEditorsRef.current.delete(sectionId);
      }
      if (focusedEditorRef.current === ed) {
        focusedEditorRef.current = null;
        setFocusedEditor((prev) => (prev === ed ? null : prev));
      }
      clearFocusedEditorRegistry(ed);
    });
  }, []);

  // -----------------------------------------------------------------
  // Cmd/Ctrl + ArrowLeft / ArrowRight → jump to block/line start / end.
  //
  // Ported from the retired EditorPanel (see git history for the
  // single-editor version). macOS WKWebView (Tauri's webview) intercepts
  // Cmd+Left/Right at the native level and calls preventDefault()
  // before the event reaches ProseMirror's handleKeyDown, so we must listen
  // at the window capture phase — the earliest point we can see the event —
  // and handle it ourselves. Route each event through its DOM target so a
  // stale focused-editor ref cannot hijack title, portal, or toolbar inputs.
  //
  // Cmd/Ctrl+A (select-all) was previously handled here too, but is now
  // forwarded through the macOS "Select All" menu item → `native-command`
  // → `commandRegistry` ("app.selectAll") → `selectAllRegistry` handler
  // registered above. Same pattern as Cmd+Z/Cmd+Shift+Z (undo/redo) and
  // Cmd+` (inline code).
  //
  // NOTE: Cmd/Ctrl + ArrowUp/Down do NOT need this treatment — WKWebView
  // does not intercept them, and SectionEditor's own `handleKeyDown` already
  // routes them to `onJumpDocStart`/`onJumpDocEnd` at the normal DOM event
  // phase (see SectionEditor.tsx).
  // -----------------------------------------------------------------
  useEffect(() => {
    if (readOnly) return;

    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      // Cmd+Option+Arrow is the workspace tab-cycle shortcut — let it
      // pass through to the global handler in App.tsx.
      if (e.altKey) return;

      // ── Cmd/Ctrl+` → toggle inline code (editor.inlineCode) ──
      // macOS/WKWebView intercepts Cmd+` as the system "cycle window"
      // accelerator via performKeyEquivalent:, marking defaultPrevented
      // before ProseMirror's keymap runs (same family as bug-graveyard #001
      // and the Cmd+A menu-item issue). Resolve the effective binding from
      // the shortcut registry so user overrides are respected.
      if (e.key === '`') {
        const editor = editorForKeyboardTarget(e.target, sectionEditorsRef.current);
        if (editor) {
          const binding = eventToBinding(e);
          const overrides = useStore.getState().keyboardShortcuts;
          if (binding === resolveBinding('editor.inlineCode', overrides)) {
            editor.chain().focus().toggleCode().run();
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }

      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      // ── Title <input> branch ──
      // When the title input is focused, Cmd/Ctrl+Arrow should jump to the
      // start / end of the title text (it is a single line), optionally
      // extending the selection with Shift — NOT move into the sections
      // below. WKWebView intercepts Cmd+Arrow natively, so we must drive the
      // input's selection ourselves here at the window capture phase.
      const titleEl = titleInputRef.current;
      if (titleEl && e.target === titleEl) {
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
        cursorTrailRegistry.markDirty();
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const editor = editorForKeyboardTarget(e.target, sectionEditorsRef.current);
      if (!editor) return;

      const view = editor.view;
      const { state } = view;
      const { selection } = state;
      if (!(selection instanceof TextSelection)) return;
      const $head = selection.$head;
      if ($head.depth < 1) return;

      const toStart = e.key === 'ArrowLeft';
      const extend = e.shiftKey;
      let edge: number;
      // Code blocks wrap long lines. Ask WebKit for the current visual line
      // boundary, then map that DOM caret back to a ProseMirror position.
      // If the native selection cannot be measured safely, fall back to the
      // source line delimited by \n.
      const inCodeBlock =
        $head.depth > 0 && $head.parent.type.name === 'codeBlock';
      if (inCodeBlock) {
        const codeNode = $head.parent;
        const blockStart = $head.start();
        const blockEnd = blockStart + codeNode.content.size;
        edge =
          visualCodeLineBoundary(
            editor,
            selection.head,
            blockStart,
            blockEnd,
            toStart,
          ) ??
          blockStart +
            logicalCodeLineBoundary(
              codeNode.textContent,
              $head.parentOffset,
              toStart,
            );
      } else {
        // Use $head.start() / $head.end() (defaults to $head.depth) so that we
        // always resolve to the **text block** boundary (paragraph/heading)
        // rather than the top-level node. For list items the paragraph lives at
        // depth 3 (doc > bulletList > listItem > paragraph); using depth 1
        // would jump to the start/end of the *entire list* instead of the
        // current item.
        edge = toStart ? $head.start() : $head.end();
      }

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
  }, [readOnly]);




  // ── Cursor trail (extracted to useCursorTrail hook) ──
  const { trailOverlayRef, trailRef } = useCursorTrail({
    readOnly,
    hasActiveDoc,
    editorDocId,
    editorCursorAnimationEnabled,
    editorCursorStyle,
    cursorTrailRegistry,
    scrollContainerRef,
    sectionsWrapperRef,
  });
  // ── Section loading / rebalancing (extracted to useSectionLoader hook) ──
  const {
    sections,
    setSections,
    sectionsRef,
    renderSections,
    visibleCount,
    docKey,
    renderedDocId,
    showSkeleton,
    handleSectionLoaded,
    handleSectionChange,
    handleCrossSectionDelete,
    handleSectionBlur,
    handleMergeUp,
    handleMergeApplied,
  } = useSectionLoader({
    isStatic,
    doc,
    editorDocId,
    hasActiveDoc,
    activeDocReloadNonce,
    focusedEditorRef,
    sectionEditorsRef,
  });



  // ── pagehide / beforeunload: flush pending edits + document saves ──
  useEffect(() => {
    if (readOnly) return;
    const handleClose = () => {
      // Flush each section's pending debounce synchronously.
      const current = sectionsRef.current;
      // For each section editor that has pending edits, force a flush.
      // The section's unmount handler already flushes on unmount, but
      // pagehide may not trigger React unmount in time.
      for (const [, ed] of sectionEditorsRef.current) {
        if (ed && !ed.isDestroyed) {
          // Trigger the section's onChange by reading current content.
          // The unmount effect in each SectionEditor handles this; but
          // to be safe, also flush at the store level.
        }
      }
      flushDocumentSaves();
    };
    window.addEventListener('pagehide', handleClose);
    window.addEventListener('beforeunload', handleClose);
    return () => {
      window.removeEventListener('pagehide', handleClose);
      window.removeEventListener('beforeunload', handleClose);
    };
  }, [readOnly]);

  // ── Keep "last edited" relative time fresh ──
  // Re-render once a minute so "5 min ago" doesn't go stale while a doc is
  // open but idle. `updatedAt` itself bumps on every (debounced) save, so
  // during active editing the label already re-renders; this covers the idle
  // case.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (isStatic || readOnly) return;
    const id = window.setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [isStatic, readOnly]);

  // ── Whole-document emptiness check for the placeholder ──
  // TipTap's Placeholder extension judges emptiness per-section PM doc and
  // by content only — a titled-but-empty code block (or a lone empty
  // section) would wrongly show the "type / for commands" hint. This
  // callback looks at the FULL Block[] across all sections; each
  // SectionEditor gates its placeholder on it (see isDocEmpty in
  // extensions.ts). Reads sectionsRef so it works in both normal and
  // static-doc modes and always sees the latest edits.
  const isWholeDocEmpty = useCallback(
    () => isDocumentEmpty(sectionsRef.current.flatMap((s) => s.blocks)),
    [],
  );




  // Stable section list for rendering — identity preserved across edits.

  // ── Cross-section caret navigation ──
  const focusHandlesRef = useRef<Map<string, SectionFocusHandle>>(new Map());
  const sectionOrderRef = useRef<string[]>([]);
  sectionOrderRef.current = renderSections.map((s) => s.id);

  // ── Cross-section selection ──
  // Each section is an independent contenteditable, so a native Selection
  // stops at the section boundary. This coordinator synthesizes a selection
  // that spans sections (paint highlights on every covered section, keep the
  // native selection inside the anchor section, intercept copy/cut/delete).
  const crossCtx: CrossSelectionContext = useMemo(
    () => ({
      getOrder: () => sectionOrderRef.current,
      getHandle: (id) => focusHandlesRef.current.get(id),
      getEditor: (id) => sectionEditorsRef.current.get(id),
      onAfterDelete: handleCrossSectionDelete,
    }),
    [handleCrossSectionDelete],
  );
  const crossSel = useCrossSectionSelection(crossCtx, editorDocId);
  crossSelectAllRef.current = crossSel.selectAll;

  // ── Register the editor's Cmd+A select-all handler ──
  // The macOS "Select All" menu item (Cmd+A) is forwarded to the frontend
  // via `native-command` → `commandRegistry` ("app.selectAll"). The action
  // checks inputs/textareas first, then calls this handler for the editor
  // case (code-block scoping + cross-section select-all), then falls back
  // to browser content / native select-all. See `selectAllRegistry.ts`.
  useEffect(() => {
    registerSelectAllHandler(() => {
      const editor = getFocusedEditorRegistry();
      if (!editor || editor.isDestroyed) return;
      const { state, view } = editor;
      const { selection, doc: pmDoc, tr } = state;

      // If the caret is inside (or the node itself is) a code block, select
      // ONLY that block's content.
      let codeBlockRange: { from: number; to: number } | null = null;
      if (
        selection instanceof NodeSelection &&
        selection.node.type.name === 'codeBlock'
      ) {
        const pos = selection.from;
        codeBlockRange = {
          from: pos + 1,
          to: pos + 1 + selection.node.content.size,
        };
      } else {
        const { $from } = selection;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'codeBlock') {
            const start = $from.start(d);
            codeBlockRange = {
              from: start,
              to: start + $from.node(d).content.size,
            };
            break;
          }
        }
      }
      if (codeBlockRange) {
        tr.setSelection(
          TextSelection.create(pmDoc, codeBlockRange.from, codeBlockRange.to),
        );
        view.dispatch(tr);
        view.focus();
        return;
      }

      // Not in a code block → select the ENTIRE document across all sections.
      crossSelectAllRef.current?.();
    });
    return () => registerSelectAllHandler(null);
  }, []);

  // ── Cross-section find-in-document ──
  // Reuses the same `crossCtx` as the selection coordinator — both need to
  // walk sections in document order and access each section's Editor / focus
  // handle. `resetKey` is the active doc id (or null in static mode) so the
  // matches clear on document switch; `query` is the live store value.
  //
  // Note on Cmd+F: macOS WKWebView intercepts Cmd+F at the native layer
  // before any DOM keydown is generated. The native Edit > Find menu forwards
  // the shared `app.find` command to the focused WebView, where
  // ShortcutManager dispatches it through the same command registry as DOM
  // shortcuts.
  const findQuery = useStore((s) => s.findQuery);
  const findResetKey = isStatic ? null : editorDocId;
  const find = useCrossSectionFind(crossCtx, findResetKey, findQuery);

  const registerFocus = useCallback(
    (sectionId: string, handle: SectionFocusHandle | null) => {
      if (handle) focusHandlesRef.current.set(sectionId, handle);
      else focusHandlesRef.current.delete(sectionId);
    },
    [],
  );

  const handleCrossUp = useCallback((sectionId: string): boolean => {
    const order = sectionOrderRef.current;
    const idx = order.indexOf(sectionId);
    if (idx <= 0) return false;
    const prev = focusHandlesRef.current.get(order[idx - 1]);
    if (!prev) return false;
    prev.focusEnd();
    return true;
  }, []);

  const handleCrossDown = useCallback((sectionId: string): boolean => {
    const order = sectionOrderRef.current;
    const idx = order.indexOf(sectionId);
    if (idx === -1 || idx >= order.length - 1) return false;
    const next = focusHandlesRef.current.get(order[idx + 1]);
    if (!next) return false;
    next.focusStart();
    return true;
  }, []);

  const handleJumpDocStart = useCallback((): boolean => {
    const first = sectionOrderRef.current[0];
    const handle = first ? focusHandlesRef.current.get(first) : undefined;
    if (!handle) return false;
    handle.focusStart();
    return true;
  }, []);

  const handleJumpDocEnd = useCallback((): boolean => {
    const order = sectionOrderRef.current;
    const last = order[order.length - 1];
    const handle = last ? focusHandlesRef.current.get(last) : undefined;
    if (!handle) return false;
    handle.focusEnd();
    return true;
  }, []);



  // ── Title keydown: Enter → insert paragraph at doc start; ArrowDown → enter
  //    the first section's editor. Ported from the retired EditorPanel's
  //    handleTitleKeyDown.
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ignore keystrokes that are part of an IME composition (e.g. pinyin
    // confirmation via Enter).  During composition `isComposing` is true and
    // `keyCode` is 229; letting these through would treat the confirmation
    // Enter as a real Enter and jump focus out of the title.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (handleNativeSelectAll(e)) return;

    const el = e.currentTarget;
    const len = el.value.length;
    const isAtEnd =
      el.selectionStart === len && el.selectionEnd === len;

    // Enter / Cmd+Enter → insert an empty paragraph at the very top of the
    // first section and focus it.
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      (e.metaKey || e.ctrlKey ? true : !e.repeat)
    ) {
      e.preventDefault();
      e.stopPropagation();
      const firstHandle = focusHandlesRef.current.get(sectionOrderRef.current[0]);
      if (firstHandle) {
        firstHandle.focusStart();
        // Insert a paragraph at position 0 of the first section's editor.
        // We need the actual editor to do insertContentAt — get it from the map.
        const firstEd = sectionEditorsRef.current.get(sectionOrderRef.current[0]);
        firstEd
          ?.chain()
          .focus()
          .insertContentAt(0, { type: 'paragraph' })
          .setTextSelection(1)
          .run();
      }
      return;
    }

    // ArrowDown (anywhere) or ArrowRight (at end) → enter the first section.
    if (e.key === 'ArrowDown' || (e.key === 'ArrowRight' && isAtEnd)) {
      e.preventDefault();
      const firstHandle = focusHandlesRef.current.get(sectionOrderRef.current[0]);
      firstHandle?.focusStart();
      return;
    }
  };

  // ── onExitToTitle: focus the title input at end (called by BlockNavigation
  //    when the caret exits the top of the first block of the first section).
  const handleExitToTitle = useCallback(() => {
    const el = titleInputRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);

  // ------------------------------------------------------------------
  // Click on blank area below editor content — focus end of the last section
  //
  // Ported from the retired EditorPanel's handleBlankAreaClick: distinguish a genuine CLICK
  // from a drag-selection by recording the mousedown position; if the mouse
  // moved more than a few pixels, treat it as a drag and do NOT refocus.
  // ------------------------------------------------------------------
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleBlankAreaClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only respond to clicks on the designated trailing blank area.
      const target = e.target as HTMLElement;
      if (!target.closest('.click-to-focus-end')) return;

      // If the mouse moved between mousedown and click, it was a drag-
      // selection, not a click — do not steal focus.
      const down = mouseDownPosRef.current;
      if (down) {
        const dx = Math.abs(e.clientX - down.x);
        const dy = Math.abs(e.clientY - down.y);
        if (dx > 3 || dy > 3) return; // dragged more than 3px → selection
      }
      mouseDownPosRef.current = null;

      // Focus to end of the last visible section's editor.
      const order = sectionOrderRef.current;
      const lastId = order[order.length - 1];
      if (!lastId) return;
      const handle = focusHandlesRef.current.get(lastId);
      handle?.focusEnd();
    },
    [],
  );

  // Show skeleton when the editor body hasn't caught up with the active doc
  // (during a tab switch). renderedDocId is set only after the first batch of
  // visible sections has finished loading their content.

  // ── Static / read-only mode ──
  if (isStatic) {
    if (!doc) return null;
    return (
      <div ref={rootRef} className="flex h-full bg-transparent overflow-hidden relative">
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto pt-8 pb-8 md:pb-12 bg-[var(--vscode-editor-background)] select-text"
        >
          {/* Document Title (static text, not editable) */}
          <div className="px-4 md:px-12 lg:px-20 pb-4">
            <h1 className="text-4xl font-bold text-[var(--vscode-editor-foreground)] pb-1">
              {doc.title}
            </h1>
          </div>

          {/* One independent (read-only) editor per section — see the
              progressive-mounting comment below for why only `visibleCount`
              are rendered. */}
          <div ref={sectionsWrapperRef} className="tiptap-editor-container relative min-h-[50vh]">
            {renderSections.slice(0, visibleCount).map((s) => (
              <SectionEditor
                key={`${docKey}:${s.id}`}
                sectionId={s.id}
                initialBlocks={s.blocks}
                onSectionChange={handleSectionChange}
                registerFocus={registerFocus}
                onCrossUp={handleCrossUp}
                onCrossDown={handleCrossDown}
                onJumpDocStart={handleJumpDocStart}
                onJumpDocEnd={handleJumpDocEnd}
                notifyCaret={notifyCaret}
                onEditorReady={(ed) => handleEditorReady(s.id, ed)}
                onSectionLoaded={handleSectionLoaded}
                isDocEmpty={isWholeDocEmpty}
                readOnly={readOnly}
              />
            ))}
            {showSkeleton && <EditorSkeleton />}
          </div>
        </div>

        {/* Outline panel (conditional) — same as editing mode, but sourced
            from the static doc's blocks (not the store's activeDoc, which is
            unrelated while viewing a static document like the help guide). */}
        {isOutlineOpen && (
          <SectionOutline
            scrollContainerRef={scrollContainerRef}
            sectionEditorsRef={sectionEditorsRef}
            staticBlocks={doc.blocks}
          />
        )}

        {/* Outline toggle icon - only when outline is closed (toggle is in outline header when open) */}
        {!isOutlineOpen && (
          <button
            onClick={toggleOutline}
            title={t('outline.show')}
            className="absolute top-3 right-3 z-30 p-1.5 rounded-md transition-colors duration-150 cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
          >
            <ListTree className="w-4 h-4" />
          </button>
        )}

        {/* Floating find-in-document bar (toggled by Cmd/Ctrl+F) */}
        <FindBar find={find} />
      </div>
    );
  }

  // ── Normal editing mode ──
  if (!hasActiveDoc) return null;

  return (
    <CursorTrailProvider registry={cursorTrailRegistry}>
      <div ref={rootRef} className="flex h-full overflow-hidden relative bg-[var(--vscode-editor-background)]">
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto pb-8 md:pb-12 select-text"
        onMouseDown={handleMouseDown}
        onMouseDownCapture={crossSel.onMouseDownCapture}
        onClick={handleBlankAreaClick}
      >
        {/* Document Title */}
        <div className="px-4 md:px-12 lg:px-20 pt-12 pb-4">
          <input
            ref={setTitleInputRef}
            type="text"
            value={activeDocTitle}
            onChange={(e) => updateDocumentMeta({ title: e.target.value })}
            onKeyDown={handleTitleKeyDown}
            placeholder={t('editor.titlePlaceholder')}
            className="text-4xl font-bold text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none w-full placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-40 pb-1 caret-[var(--vscode-editorCursor-foreground,var(--vscode-focusBorder,#007fd4))]"
          />
          {activeDocUpdatedAt && (
            <div className="flex items-center gap-1.5 mt-2.5 text-xs text-[var(--vscode-descriptionForeground)]">
              <Clock className="w-3 h-3 shrink-0 opacity-80" />
              <span>
                {t('editor.lastEdited', {
                  time: formatRelativeEditedTime(activeDocUpdatedAt, t, language),
                })}
              </span>
              {charCount > 0 && (
                <>
                  <span className="opacity-50">·</span>
                  <span>{t('editor.charCount', { n: charCount.toLocaleString() })}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* One independent editor per section. Only the first `visibleCount`
            sections are rendered — the rest are progressively mounted via
            requestIdleCallback to avoid creating all N ProseMirror instances
            at once (which would block the main thread on large docs). */}
        <div ref={sectionsWrapperRef} className="tiptap-editor-container relative">
          {renderSections.slice(0, visibleCount).map((s) => (
            <SectionEditor
              key={`${docKey}:${s.id}`}
              sectionId={s.id}
              initialBlocks={s.blocks}
              onSectionChange={handleSectionChange}
              registerFocus={registerFocus}
              onCrossUp={handleCrossUp}
              onCrossDown={handleCrossDown}
              onJumpDocStart={handleJumpDocStart}
              onJumpDocEnd={handleJumpDocEnd}
              onMergeUp={handleMergeUp}
              pendingMergeBoundary={s.pendingMergeBoundary}
              onMergeApplied={handleMergeApplied}
              notifyCaret={notifyCaret}
              onExitToTitle={handleExitToTitle}
              onEditorReady={(ed) => handleEditorReady(s.id, ed)}
              onSectionLoaded={handleSectionLoaded}
              onSectionBlur={handleSectionBlur}
              isDocEmpty={isWholeDocEmpty}
            />
          ))}
          {/* Skeleton overlay while sections are loading content.
              renderedDocId lags behind editorDocId during load — when they
              differ, the editors are still empty (content hasn't been
              setContent'd yet), so we cover them with a skeleton to prevent
              the user from seeing placeholder text / empty editors. */}
          {showSkeleton && <EditorSkeleton />}
        </div>

        {/* Trailing scroll buffer — click here focuses end of last section */}
        <div
          className="min-h-[40vh] click-to-focus-end"
          aria-hidden="true"
        />
      </div>

      {/* Shared GPU cursor-trail overlay */}
      <div
        ref={trailOverlayRef}
        className="absolute inset-0"
        style={{ pointerEvents: 'none', zIndex: 5 }}
      />

      {/* Selection-triggered formatting toolbar.
          Hidden while a cross-section selection is active — formatting only
          the anchor section's slice would be misleading. */}
      {focusedEditor && !crossSel.active && <FormatBubbleMenu editor={focusedEditor} />}

      {/* Table hover controls + context menu */}
      {focusedEditor && !crossSel.active && <TableControls editor={focusedEditor} />}

      {/* Outline panel (conditional) */}
      {isOutlineOpen && (
        <SectionOutline
          scrollContainerRef={scrollContainerRef}
          sectionEditorsRef={sectionEditorsRef}
        />
      )}

      {/* Outline toggle icon - only when outline is closed (toggle is in outline header when open) */}
      {!isOutlineOpen && (
        <button
          onClick={toggleOutline}
          title={t('outline.show')}
          className="absolute top-3 right-3 z-30 p-1.5 rounded-md transition-colors duration-150 cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
        >
          <ListTree className="w-4 h-4" />
        </button>
      )}

      {/* Floating find-in-document bar (toggled by Cmd/Ctrl+F) */}
      <FindBar find={find} />
      </div>
    </CursorTrailProvider>
  );

}
