/**
 * SectionEditor — one independent ProseMirror instance for a slice of the
 * document's blocks (POC).
 *
 * The whole point: a 232KB document rendered as ONE contenteditable forces
 * WebKit to re-layout/repaint the entire host on every keystroke (confirmed
 * via DevTools Timeline). By splitting the document into N small editors,
 * a keystroke only re-lays-out the ~30-block section it happens in.
 *
 * Each SectionEditor:
 *   - loads its block slice once into its own editor,
 *   - debounces edits and reports the new Block[] for THIS section upward,
 *   - never re-renders from parent prop changes after mount (the parent keeps
 *     section identity stable), so typing in section A never touches B.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';

import { useI18n } from '../../../lib/core/i18n';
import {
  ourBlocksToTiptapJSON,
  tiptapJSONToOurBlocks,
} from '../../../lib/editor/tiptapAdapter';
import { createPasteHandler, createDropHandler } from '../../../lib/editor/editorPasteDrop';
import { createSectionExtensions } from './extensions';
import type { Block } from '../../../types';

/** Imperative focus handle a section exposes to its parent. */
export interface SectionFocusHandle {
  /** Focus this section's editor with the caret at the very start. */
  focusStart: () => void;
  /** Focus this section's editor with the caret at the very end. */
  focusEnd: () => void;
}

interface SectionEditorProps {
  /** Stable id for this section (index-based for the POC). */
  sectionId: string;
  /** Initial blocks for this section. Read ONCE on mount. */
  initialBlocks: Block[];
  /** Reports the section's new blocks after a debounced edit. */
  onSectionChange: (sectionId: string, blocks: Block[]) => void;
  /** Register/unregister this section's imperative focus handle. */
  registerFocus?: (sectionId: string, handle: SectionFocusHandle | null) => void;
  /** Caret left the TOP of this section → ask parent to focus the previous
   *  section at its end. Returns true if a previous section took focus. */
  onCrossUp?: (sectionId: string) => boolean;
  /** Caret left the BOTTOM of this section → ask parent to focus the next
   *  section at its start. Returns true if a next section took focus. */
  onCrossDown?: (sectionId: string) => boolean;
  /** Cmd/Ctrl+ArrowUp → jump to the very start of the whole document. */
  onJumpDocStart?: () => boolean;
  /** Cmd/Ctrl+ArrowDown → jump to the very end of the whole document. */
  onJumpDocEnd?: () => boolean;
  /** Backspace at the very start of this section → ask parent to merge this
   *  section into the previous one. Returns true if a merge was started. */
  onMergeUp?: (sectionId: string) => boolean;
  /** When set, after loading content this section runs a native join at the
   *  given top-level block index to merge the boundary blocks (the result of
   *  a cross-section Backspace merge). Index is 0-based into this section's
   *  blocks; the block at this index is joined into the one before it. */
  pendingMergeBoundary?: number | null;
  /** Called after the pending merge has been applied, so the parent can clear
   *  its pending state. */
  onMergeApplied?: (sectionId: string) => void;
  /** Poke the shared cursor trail to re-measure (caret may have moved). */
  notifyCaret?: () => void;
  /** Called when the caret exits the top of the first block (ArrowUp/Left at
   *  doc start). The parent uses this to focus the document title input. */
  onExitToTitle?: () => void;
  /** Called once the editor instance is ready (after mount). The parent uses
   *  this to render FormatBubbleMenu / TableControls against the focused
   *  section's editor. */
  onEditorReady?: (editor: Editor) => void;
  /** Called after setContent completes (inside the setTimeout callback), so
   *  the parent knows content is now visible and can hide the Skeleton. */
  onSectionLoaded?: () => void;
  /** Called when this section loses focus (blur). The parent uses this as a
   *  safe point to re-balance (split/merge) the section without disrupting an
   *  in-progress edit — the caret has already left this section. */
  onSectionBlur?: (sectionId: string) => void;
}

export default function SectionEditor({
  sectionId,
  initialBlocks,
  onSectionChange,
  registerFocus,
  onCrossUp,
  onCrossDown,
  onJumpDocStart,
  onJumpDocEnd,
  onMergeUp,
  pendingMergeBoundary,
  onMergeApplied,
  notifyCaret,
  onExitToTitle,
  onEditorReady,
  onSectionLoaded,
  onSectionBlur,
}: SectionEditorProps) {
  const { t } = useI18n();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReplacingRef = useRef(false);
  const notifyCaretRef = useRef(notifyCaret);
  notifyCaretRef.current = notifyCaret;
  // Keep the latest callbacks without re-creating the editor.
  const onChangeRef = useRef(onSectionChange);
  onChangeRef.current = onSectionChange;
  const onCrossUpRef = useRef(onCrossUp);
  onCrossUpRef.current = onCrossUp;
  const onCrossDownRef = useRef(onCrossDown);
  onCrossDownRef.current = onCrossDown;
  const onJumpDocStartRef = useRef(onJumpDocStart);
  onJumpDocStartRef.current = onJumpDocStart;
  const onJumpDocEndRef = useRef(onJumpDocEnd);
  onJumpDocEndRef.current = onJumpDocEnd;
  const onMergeUpRef = useRef(onMergeUp);
  onMergeUpRef.current = onMergeUp;
  const onExitToTitleRef = useRef(onExitToTitle);
  onExitToTitleRef.current = onExitToTitle;
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;
  const onSectionLoadedRef = useRef(onSectionLoaded);
  onSectionLoadedRef.current = onSectionLoaded;
  const onSectionBlurRef = useRef(onSectionBlur);
  onSectionBlurRef.current = onSectionBlur;

  // Stable editor ref for paste/drop handlers.
  const editorRef = useRef<Editor | null>(null);

  const handleChange = useCallback(
    ({ editor }: { editor: Editor }) => {
      if (isReplacingRef.current) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        const json = editor.getJSON();
        const blocks = tiptapJSONToOurBlocks(json.content ?? []);
        onChangeRef.current(sectionId, blocks);
      }, 300);
    },
    [sectionId],
  );

  const editor = useEditor({
    extensions: createSectionExtensions({
      placeholder: t('editor.placeholder'),
      onExitToTitle: () => onExitToTitleRef.current?.(),
    }),
    // Initialize with a valid empty doc node (NOT the block array). The real
    // section content is loaded via setContent() once the editor is ready —
    // this mirrors BlockEditor and avoids passing a bare JSONContent[] into
    // `content`, which can make ProseMirror build an invalid doc and throw
    // "config.doc.type.schema".
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: handleChange,
    editorProps: {
      attributes: {
        class: 'max-w-none focus:outline-none px-4 md:px-12 lg:px-20',
      },
      handlePaste: createPasteHandler(editorRef),
      handleDrop: createDropHandler(editorRef),
      // Cross-section caret navigation: when the caret is at the very top of
      // this section and ArrowUp/Left is pressed, hand focus to the previous
      // section's end; at the very bottom with ArrowDown/Right, hand to the
      // next section's start. This stitches N independent editors into one
      // continuous editing surface.
      handleKeyDown: (view, event) => {
        const { key, shiftKey, metaKey, ctrlKey, altKey } = event;

        // ── Cmd/Ctrl+ArrowUp / ArrowDown → jump to document start / end ──
        // In a single editor these are native "go to doc edge"; with N
        // editors they'd only reach the current section's edge, so we route
        // them to the parent to focus the first/last section.
        if ((metaKey || ctrlKey) && !altKey && !shiftKey) {
          if (key === 'ArrowUp' && onJumpDocStartRef.current?.()) {
            event.preventDefault();
            return true;
          }
          if (key === 'ArrowDown' && onJumpDocEndRef.current?.()) {
            event.preventDefault();
            return true;
          }
          return false;
        }

        if (shiftKey || metaKey || ctrlKey || altKey) return false;

        // ── Backspace at the very start of the section → merge upward ──
        if (key === 'Backspace') {
          const { selection } = view.state;
          if (
            selection.empty &&
            (selection.$head.pos === 1 || selection.from === 0) &&
            selection.$head.parentOffset === 0
          ) {
            if (onMergeUpRef.current?.(sectionId)) {
              event.preventDefault();
              return true;
            }
          }
          return false;
        }

        if (
          key !== 'ArrowUp' &&
          key !== 'ArrowDown' &&
          key !== 'ArrowLeft' &&
          key !== 'ArrowRight'
        ) {
          return false;
        }

        const { state } = view;
        const { selection } = state;
        if (!selection.empty) return false;
        const { $head } = selection;

        const atDocStart = $head.pos === 1 || selection.from === 0;
        const atDocEnd = $head.pos >= state.doc.content.size - 1;

        // ── Upward / leftward → previous section ──
        if (key === 'ArrowUp' || key === 'ArrowLeft') {
          const atTop =
            key === 'ArrowLeft'
              ? $head.parentOffset === 0 && atDocStart
              : (view.endOfTextblock('up') && atDocStart) || atDocStart;
          if (atTop && onCrossUpRef.current?.(sectionId)) {
            event.preventDefault();
            return true;
          }
          return false;
        }

        // ── Downward / rightward → next section ──
        const atBottom =
          key === 'ArrowRight'
            ? $head.parentOffset === $head.parent.content.size && atDocEnd
            : (view.endOfTextblock('down') && atDocEnd) || atDocEnd;
        if (atBottom && onCrossDownRef.current?.(sectionId)) {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
  });

  // Keep editor ref in sync for paste/drop handlers + expose to parent.
  useEffect(() => {
    editorRef.current = editor;
    if (editor && onEditorReady) {
      onEditorReadyRef.current?.(editor);
    }
  }, [editor]);

  // Expose imperative focus handles to the parent so a neighbouring section
  // can move the caret into this one at the correct edge.
  useEffect(() => {
    if (!editor || !registerFocus) return;
    const handle: SectionFocusHandle = {
      focusStart: () => editor.chain().focus('start').run(),
      focusEnd: () => editor.chain().focus('end').run(),
    };
    registerFocus(sectionId, handle);
    return () => registerFocus(sectionId, null);
  }, [editor, sectionId, registerFocus]);

  // Load this section's blocks once the editor instance exists.
  //
  // Two problems this effect solves:
  //
  // 1. flushSync conflict: setContent() inside a useEffect triggers ProseMirror
  //    to mount React NodeViews → TipTap calls flushSync → but we're in React's
  //    commit phase → error → stale content. Fix: defer via setTimeout(0) to the
  //    next macrotask (queueMicrotask is NOT enough — React 19 schedules passive
  //    effects via microtasks).
  //
  // 2. StrictMode double-invoke: React runs mount→cleanup→mount. If we set the
  //    "loaded" guard ref synchronously, the cleanup cancels the deferred load,
  //    and the second mount sees the ref already set → skips → content NEVER
  //    loads. Fix: set the guard ref INSIDE the setTimeout callback, AFTER
  //    setContent succeeds. The cleanup only cancels the pending timer; the
  //    second mount re-schedules a fresh timer that actually fires.
  const loadedEditorRef = useRef<Editor | null>(null);
  useEffect(() => {
    if (!editor) return;
    if (loadedEditorRef.current === editor) return;
    // NOTE: do NOT set loadedEditorRef here — set it inside the callback below.

    const targetEditor = editor;
    const content = ourBlocksToTiptapJSON(initialBlocks);
    const doPendingMerge = pendingMergeBoundary;

    const loadTimer = setTimeout(() => {
      if (targetEditor.isDestroyed) return;
      loadedEditorRef.current = targetEditor;
      isReplacingRef.current = true;
      try {
        targetEditor.commands.setContent(content, { emitUpdate: false });
      } catch (e) {
        console.error('[SectionEditor] setContent failed:', e, content);
      }

      // If this load is the result of a cross-section merge, join the boundary
      // blocks with a NATIVE joinBackward so the two adjacent blocks merge with
      // real ProseMirror semantics (and the caret lands at the join point).
      if (
        doPendingMerge != null &&
        doPendingMerge > 0 &&
        doPendingMerge < targetEditor.state.doc.childCount
      ) {
        let pos = 0;
        for (let i = 0; i < doPendingMerge; i++) {
          pos += targetEditor.state.doc.child(i).nodeSize;
        }
        targetEditor
          .chain()
          .setTextSelection(pos + 1)
          .joinBackward()
          .focus()
          .run();
        onMergeApplied?.(sectionId);
      }

      requestAnimationFrame(() => {
        isReplacingRef.current = false;
      });

      // Notify parent that this section's content is loaded so it can
      // hide the Skeleton overlay once ALL sections are ready.
      onSectionLoadedRef.current?.();
    }, 0);

    // Cancel the deferred load if the effect re-runs before it fires.
    // In StrictMode: first mount's timer is cancelled here, second mount
    // schedules a fresh timer that fires and loads content.
    return () => clearTimeout(loadTimer);
  }, [editor, initialBlocks, pendingMergeBoundary, onMergeApplied, sectionId]);

  // Flush a pending edit synchronously on unmount so the last keystrokes in
  // a section aren't lost when the doc closes / re-sections.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        const ed = editor;
        // Guard against a destroyed editor: TipTap may tear down the
        // EditorView before this cleanup runs, after which getJSON() touches
        // a null state and throws.
        if (ed && !ed.isDestroyed) {
          const json = ed.getJSON();
          const blocks = tiptapJSONToOurBlocks(json.content ?? []);
          onChangeRef.current(sectionId, blocks);
        }
      }
    };
  }, [editor, sectionId]);

  // Notify the shared cursor trail whenever this section's caret could move,
  // and hide the native caret here (the shared WebGL trail draws the cursor).
  useEffect(() => {
    if (!editor) return;
    const ping = () => notifyCaretRef.current?.();
    // On blur: flush this section's pending edits synchronously (so a pending
    // 300ms debounce isn't lost), then notify the parent it's a safe point to
    // re-balance (split/merge) — the caret has left this section.
    const onBlur = () => {
      ping();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        if (editor && !editor.isDestroyed) {
          const json = editor.getJSON();
          const blocks = tiptapJSONToOurBlocks(json.content ?? []);
          onChangeRef.current(sectionId, blocks);
        }
      }
      onSectionBlurRef.current?.(sectionId);
    };
    editor.on('selectionUpdate', ping);
    editor.on('update', ping);
    editor.on('focus', ping);
    editor.on('blur', onBlur);
    return () => {
      editor.off('selectionUpdate', ping);
      editor.off('update', ping);
      editor.off('focus', ping);
      editor.off('blur', onBlur);
    };
  }, [editor]);

  useEffect(() => {
    const editorDom = editor?.view?.dom as HTMLElement | undefined;
    if (!editorDom) return;
    editorDom.style.caretColor = 'transparent';
    return () => {
      editorDom.style.caretColor = '';
    };
  }, [editor]);

  return <EditorContent editor={editor} />;
}
