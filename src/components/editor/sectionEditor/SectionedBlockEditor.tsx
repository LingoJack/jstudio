/**
 * SectionedBlockEditor — high-performance editor that renders one document as
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
 * Feature parity with BlockEditor:
 *   - Shared GPU cursor trail (viewport-sized canvas)
 *   - Title input with Enter → insert paragraph, ArrowDown → enter editor
 *   - SectionOutline panel with toggle button
 *   - FormatBubbleMenu + TableControls (rendered against focused section)
 *   - Paste/drop handlers (image/file special handling)
 *   - BlockNavigation (Tab, Cmd+Enter, Backspace on empty codeBlock, etc.)
 *   - Cross-section caret navigation + Backspace merge
 *
 * Known limitation:
 *   - No cross-section selection / Cmd+A / copy-paste across sections
 *   - Sections are recomputed only on document switch, not live re-balanced
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ListTree } from 'lucide-react';

import { useStore } from '../../../store/useStore';
import { useI18n } from '../../../lib/i18n';
import { flushDocumentSaves } from '../../../store/storeHelpers';
import { EditorCursorTrail } from '../../cursor/EditorCursorTrail';
import FormatBubbleMenu from '../FormatBubbleMenu';
import TableControls from '../nodes/TableControls';
import type { Block } from '../../../types';
import SectionEditor, { type SectionFocusHandle } from './SectionEditor';
import SectionOutline from './SectionOutline';

/** Target number of top-level blocks per section. */
const SECTION_SIZE = 30;
/** A section is split when it grows beyond this (e.g. after inserting many
 *  blocks). Splitting keeps each ProseMirror instance small so typing stays
 *  fast. Set above SECTION_SIZE so a section isn't split the moment it's
 *  created (sections are created at exactly SECTION_SIZE). */
const SECTION_MAX = Math.round(SECTION_SIZE * 1.6); // 48
/** Two adjacent sections are merged when their combined size is at or below
 *  this (e.g. after deleting many blocks), avoiding a proliferation of tiny
 *  sections. Kept below SECTION_SIZE so a freshly-split section (~SECTION_SIZE
 *  each) isn't immediately re-merged. */
const SECTION_MERGE_BELOW = Math.round(SECTION_SIZE * 0.5); // 15

interface SectionState {
  id: string;
  blocks: Block[];
  /** When set, after (re)mount this section joins the block at this index
   *  into the previous one — used to complete a cross-section Backspace
   *  merge with native ProseMirror semantics. */
  pendingMergeBoundary?: number | null;
}

function splitIntoSections(blocks: Block[]): SectionState[] {
  if (blocks.length === 0) {
    return [{ id: 'sec-0', blocks: [] }];
  }
  const sections: SectionState[] = [];
  for (let i = 0; i < blocks.length; i += SECTION_SIZE) {
    sections.push({
      id: `sec-${i / SECTION_SIZE}`,
      blocks: blocks.slice(i, i + SECTION_SIZE),
    });
  }
  return sections;
}

/** Skeleton overlay shown while section editors are loading content.
 *  Mirrors BlockEditor's EditorSkeleton — prevents the user from seeing
 *  empty editors / placeholder text during the load. OPAQUE: sits on top
 *  of the still-mounted editors. */
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

export default function SectionedBlockEditor() {
  const { t } = useI18n();
  const activeDocId = useStore((s) => s.activeDocId);
  const activeDocTitle = useStore((s) => s.activeDoc?.title ?? '');
  const hasActiveDoc = useStore((s) => !!s.activeDoc);
  const updateDocumentMeta = useStore((s) => s.updateDocumentMeta);
  const editorCursorStyle = useStore((s) => s.editorCursorStyle);
  const isOutlineOpen = useStore((s) => s.isOutlineOpen);
  const toggleOutline = useStore((s) => s.toggleOutline);

  // Sections are built once per document load. We hold them in a ref-backed
  // state so section edits mutate the slice in place without re-rendering
  // (and thus remounting) sibling sections.
  const [sections, setSections] = useState<SectionState[]>([]);
  const sectionsRef = useRef<SectionState[]>([]);
  sectionsRef.current = sections;
  const loadedDocIdRef = useRef<string | null>(null);
  /** The doc id whose content has actually finished loading into all
   *  section editors. While this lags behind `activeDocId` we show a
   *  Skeleton overlay so the user doesn't see empty editors / placeholder
   *  text during the load. */
  const [renderedDocId, setRenderedDocId] = useState<string | null>(null);
  /** How many sections have reported "content loaded" for the current
   *  doc. When this reaches the total VISIBLE section count, we set
   *  renderedDocId. */
  const loadedSectionCountRef = useRef(0);
  const expectedSectionCountRef = useRef(0);
  /** How many sections are currently rendered. Grows progressively so we
   *  don't create all N ProseMirror instances at once (which would block the
   *  main thread on large documents). */
  const [visibleCount, setVisibleCount] = useState(0);

  // ── Title input ref (for trail registration + caretColor) ──
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // ── Single shared cursor trail ──
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionsWrapperRef = useRef<HTMLDivElement | null>(null);
  const trailOverlayRef = useRef<HTMLDivElement | null>(null);
  const trailRef = useRef<EditorCursorTrail | null>(null);
  const notifyCaret = useCallback(() => {
    trailRef.current?.markDirty();
  }, []);

  // ── Track the currently focused section's editor for FormatBubbleMenu /
  //    TableControls. Each SectionEditor calls onEditorReady when its editor
  //    is ready, and we track which one has focus via the 'focus' event.
  const focusedEditorRef = useRef<Editor | null>(null);
  const [focusedEditor, setFocusedEditor] = useState<Editor | null>(null);
  const sectionEditorsRef = useRef<Map<string, Editor>>(new Map());

  const handleEditorReady = useCallback((sectionId: string, ed: Editor) => {
    sectionEditorsRef.current.set(sectionId, ed);
    // Listen for focus to track which editor is active.
    ed.on('focus', () => {
      focusedEditorRef.current = ed;
      setFocusedEditor(ed);
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
    });
  }, []);

  // ── Load / re-section when the active document changes ──
  useEffect(() => {
    if (!hasActiveDoc) {
      loadedDocIdRef.current = null;
      setRenderedDocId(null);
      setVisibleCount(0);
      setSections([]);
      return;
    }
    if (loadedDocIdRef.current === activeDocId) return;
    loadedDocIdRef.current = activeDocId;
    // Reset loading counters — sections will report back as they finish.
    loadedSectionCountRef.current = 0;
    expectedSectionCountRef.current = 0;
    const blocks = useStore.getState().activeDoc?.blocks ?? [];
    const newSections = splitIntoSections(blocks);
    expectedSectionCountRef.current = newSections.length;
    // Start with 0 visible sections — they will be progressively revealed
    // by the idle callback below. This prevents rendering ALL N ProseMirror
    // instances at once (which blocks the main thread for large documents).
    setVisibleCount(0);
    setSections(newSections);
  }, [activeDocId, hasActiveDoc]);

  // ── Progressive section mounting ──
  // Reveal sections a few at a time using requestIdleCallback (or setTimeout
  // fallback). Each batch creates a handful of ProseMirror instances — enough
  // to show the first screen of content, but not so many that the main thread
  // stalls. Subsequent batches fill in the rest during idle time.
  const SECTIONS_PER_BATCH = 2;
  useEffect(() => {
    if (visibleCount >= sections.length) return;

    const revealNext = () => {
      setVisibleCount((prev) => {
        const next = Math.min(prev + SECTIONS_PER_BATCH, sections.length);
        // Reset the load counter to match the number we expect to have
        // reported loaded. Only count sections that are actually rendered.
        return next;
      });
    };

    const handle: number | ReturnType<typeof setTimeout> =
      typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback(revealNext, { timeout: 200 })
        : window.setTimeout(revealNext, 0);

    return () => {
      if (typeof handle === 'number' && typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(handle);
      } else {
        clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
      }
    };
  }, [visibleCount, sections.length]);

  // ── Track section load completion → set renderedDocId when the first
  //    batch of visible sections has loaded. We don't need ALL sections
  //    loaded — just enough to show the first screen of content. Later
  //    sections load progressively during idle time.
  const handleSectionLoaded = useCallback(() => {
    // Once ANY section has loaded, the first screen is ready — hide skeleton.
    // We don't need to wait for all visible sections; the first one to finish
    // means content is now on screen.
    setRenderedDocId(loadedDocIdRef.current);
  }, []);

  // ── Create the single shared cursor trail ──
  useEffect(() => {
    if (!hasActiveDoc) return;
    const overlay = trailOverlayRef.current;
    const editorEl = sectionsWrapperRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!overlay || !editorEl || !scrollContainer) return;

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
      overlay.removeChild(canvas);
      return;
    }
    trail.resize();
    trail.start();
    trailRef.current = trail;

    // Register the title input so the trail can measure its caret too.
    const titleInput = titleInputRef.current;
    if (titleInput) {
      trail.setTitleEl(titleInput);
      const titleEvents = ['input', 'keyup', 'click', 'focus', 'blur', 'select', 'scroll'] as const;
      const markDirty = () => trail.markDirty();
      for (const ev of titleEvents) titleInput.addEventListener(ev, markDirty);
      titleInput.style.caretColor = 'transparent';
    }

    const markDirty = () => trail.markDirty();
    scrollContainer.addEventListener('scroll', markDirty, { passive: true });
    const safetyTick = window.setInterval(() => {
      if (editorEl.contains(document.activeElement)) markDirty();
    }, 400);
    const resizeObserver = new ResizeObserver(() => trail.resize());
    resizeObserver.observe(overlay);

    return () => {
      window.clearInterval(safetyTick);
      scrollContainer.removeEventListener('scroll', markDirty);
      resizeObserver.disconnect();
      trail.dispose();
      trailRef.current = null;
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [hasActiveDoc, activeDocId]);

  // Apply cursor style to the shared trail.
  useEffect(() => {
    trailRef.current?.setCursorStyle(editorCursorStyle);
  }, [editorCursorStyle, activeDocId]);

  // ── pagehide / beforeunload: flush pending edits + document saves ──
  useEffect(() => {
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
  }, []);

  // A section reports new blocks → splice into the full array and persist.
  const handleSectionChange = useCallback(
    (sectionId: string, blocks: Block[]) => {
      const current = sectionsRef.current;
      const idx = current.findIndex((s) => s.id === sectionId);
      if (idx === -1) return;
      // Update the slice in place (do NOT setState — that would remount
      // sibling SectionEditors and destroy their selection/cursor).
      current[idx] = { ...current[idx], blocks };
      const full = current.flatMap((s) => s.blocks);
      useStore.getState().setActiveDocBlocks(full, loadedDocIdRef.current ?? undefined);
    },
    [],
  );

  // ── Live re-balance ──
  // When a section loses focus, check whether it has grown too large (needs
  // splitting) or shrunk too small (should merge with a neighbour). We do this
  // ONLY on blur so we never remount the section the user is actively editing
  // (which would clobber the caret). Splitting a large section back into
  // ~SECTION_SIZE chunks keeps each ProseMirror instance small so typing stays
  // fast even after heavy local editing.
  //
  // A monotonic seq guarantees fresh, unique ids on every re-balance so React
  // remounts exactly the changed sections (new key → remount → reload content).
  const rebalanceSeqRef = useRef(0);
  const handleSectionBlur = useCallback((sectionId: string) => {
    // Defer to idle time — blur often precedes a focus on another section
    // (clicking into a neighbour); doing structural work synchronously here
    // could interrupt that focus transition.
    const run = () => {
      const current = sectionsRef.current;
      const idx = current.findIndex((s) => s.id === sectionId);
      if (idx === -1) return;

      // Never re-balance a section that currently holds focus (the user may
      // have clicked back into it during the idle delay).
      const focusedEd = focusedEditorRef.current;
      const sec = current[idx];

      let next: SectionState[] | null = null;

      // ── Split: section grew beyond SECTION_MAX ──
      if (sec.blocks.length > SECTION_MAX) {
        // Don't split the focused section.
        const edForSec = sectionEditorsRef.current.get(sectionId);
        if (edForSec && edForSec === focusedEd && edForSec.isFocused) return;

        const seq = ++rebalanceSeqRef.current;
        const chunks: SectionState[] = [];
        for (let i = 0; i < sec.blocks.length; i += SECTION_SIZE) {
          chunks.push({
            id: `${sec.id}~s${seq}_${i / SECTION_SIZE}`,
            blocks: sec.blocks.slice(i, i + SECTION_SIZE),
          });
        }
        next = [...current.slice(0, idx), ...chunks, ...current.slice(idx + 1)];
      }
      // ── Merge: section shrank and can combine with the next one ──
      else if (
        sec.blocks.length <= SECTION_MERGE_BELOW &&
        idx + 1 < current.length &&
        current[idx].blocks.length + current[idx + 1].blocks.length <= SECTION_SIZE
      ) {
        const nextSec = current[idx + 1];
        // Don't merge if EITHER section is focused (both remount on merge).
        const edA = sectionEditorsRef.current.get(sectionId);
        const edB = sectionEditorsRef.current.get(nextSec.id);
        if (
          (edA && edA === focusedEd && edA.isFocused) ||
          (edB && edB === focusedEd && edB.isFocused)
        ) {
          return;
        }
        const seq = ++rebalanceSeqRef.current;
        const merged: SectionState = {
          id: `${sec.id}~m${seq}`,
          blocks: [...sec.blocks, ...nextSec.blocks],
        };
        next = [...current.slice(0, idx), merged, ...current.slice(idx + 2)];
      }

      if (next) {
        sectionsRef.current = next;
        setSections(next);
        // Keep all sections visible after a re-balance (split increases the
        // count). Re-balance only happens after the doc is fully loaded and
        // the user is editing, so everything should already be mounted; bump
        // visibleCount to cover any newly-split sections immediately.
        setVisibleCount(next.length);
        // Structure changed → the remounted sections reload content via their
        // own setTimeout. renderedDocId stays as-is (doc id unchanged), so no
        // skeleton flash.
      }
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(run, { timeout: 500 });
    } else {
      setTimeout(run, 50);
    }
  }, []);

  // Stable section list for rendering — identity preserved across edits.
  const renderSections = useMemo(() => sections, [sections]);

  // ── Cross-section caret navigation ──
  const focusHandlesRef = useRef<Map<string, SectionFocusHandle>>(new Map());
  const sectionOrderRef = useRef<string[]>([]);
  sectionOrderRef.current = renderSections.map((s) => s.id);

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

  const handleMergeUp = useCallback((sectionId: string): boolean => {
    const current = sectionsRef.current;
    const idx = current.findIndex((s) => s.id === sectionId);
    if (idx <= 0) return false;
    const prev = current[idx - 1];
    const cur = current[idx];
    const boundary = prev.blocks.length;
    const merged: SectionState = {
      id: `${prev.id}+m${Date.now()}`,
      blocks: [...prev.blocks, ...cur.blocks],
      pendingMergeBoundary: boundary,
    };
    const next = [...current.slice(0, idx - 1), merged, ...current.slice(idx + 1)];
    sectionsRef.current = next;
    setSections(next);
    const full = next.flatMap((s) => s.blocks);
    useStore.getState().setActiveDocBlocks(full, loadedDocIdRef.current ?? undefined);
    return true;
  }, []);

  const handleMergeApplied = useCallback((sectionId: string) => {
    const current = sectionsRef.current;
    const idx = current.findIndex((s) => s.id === sectionId);
    if (idx === -1 || current[idx].pendingMergeBoundary == null) return;
    current[idx] = { ...current[idx], pendingMergeBoundary: null };
  }, []);

  // ── Title keydown: Enter → insert paragraph at doc start; ArrowDown → enter
  //    the first section's editor. Mirrors BlockEditor's handleTitleKeyDown.
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

  // Show skeleton when the editor body hasn't caught up with the active doc
  // (during a tab switch). renderedDocId is set only after the first batch of
  // visible sections has finished loading their content.
  const showSkeleton = renderedDocId !== activeDocId;

  if (!hasActiveDoc) return null;

  return (
    <div ref={rootRef} className="flex h-full bg-transparent overflow-hidden relative">
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto pt-8 pb-8 md:pb-12 bg-[var(--vscode-editor-background)] select-text"
      >
        {/* Document Title */}
        <div className="px-4 md:px-12 lg:px-20 pb-4">
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

        {/* One independent editor per section. Only the first `visibleCount`
            sections are rendered — the rest are progressively mounted via
            requestIdleCallback to avoid creating all N ProseMirror instances
            at once (which would block the main thread on large docs). */}
        <div ref={sectionsWrapperRef} className="tiptap-editor-container relative">
          {renderSections.slice(0, visibleCount).map((s) => (
            <SectionEditor
              key={`${activeDocId}:${s.id}`}
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
            />
          ))}
          {/* Skeleton overlay while sections are loading content.
              renderedDocId lags behind activeDocId during load — when they
              differ, the editors are still empty (content hasn't been
              setContent'd yet), so we cover them with a skeleton to prevent
              the user from seeing placeholder text / empty editors. */}
          {showSkeleton && <EditorSkeleton />}
        </div>

        {/* Trailing scroll buffer */}
        <div className="min-h-[40vh]" aria-hidden="true" />
      </div>

      {/* Shared GPU cursor-trail overlay */}
      <div
        ref={trailOverlayRef}
        className="absolute inset-0"
        style={{ pointerEvents: 'none', zIndex: 5 }}
      />

      {/* Selection-triggered formatting toolbar */}
      {focusedEditor && <FormatBubbleMenu editor={focusedEditor} />}

      {/* Table hover controls + context menu */}
      {focusedEditor && <TableControls editor={focusedEditor} />}

      {/* Outline panel (conditional) */}
      {isOutlineOpen && <SectionOutline scrollContainerRef={scrollContainerRef} />}

      {/* Outline toggle icon */}
      <button
        onClick={toggleOutline}
        title={isOutlineOpen ? t('outline.hide') : t('outline.show')}
        className={`absolute ${isOutlineOpen ? 'top-2.5 right-2' : 'top-3 right-3'} z-30 p-1.5 rounded-md transition-colors duration-150 cursor-pointer text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]`}
      >
        <ListTree className="w-4 h-4" />
      </button>
    </div>
  );
}
