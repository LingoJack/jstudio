/**
 * SectionedBlockEditor — POC parent that renders one document as N independent
 * section editors to fix large-document typing lag.
 *
 * Strategy:
 *   - Split activeDoc.blocks into fixed-size sections (~SECTION_SIZE blocks).
 *   - Render one <SectionEditor> per section, each with its own ProseMirror
 *     instance, so a keystroke only re-lays-out its own ~30-block section
 *     instead of the whole 232KB contenteditable.
 *   - On a section edit, replace that section's slice and write the
 *     reassembled full Block[] back to the store (same debounced save path).
 *
 * POC SCOPE / KNOWN GAPS (intentionally deferred until perf is validated):
 *   - No cross-section selection / Cmd+A / copy-paste across sections.
 *   - No slash-menu-driven block-type changes that cross section boundaries.
 *   - No cursor trail, no outline jump, no block navigation between sections.
 *   - Sections are recomputed only on document switch, not live re-balanced.
 * These are the Phase-2 hardening items; this component exists ONLY to prove
 * the architecture removes the lag before we invest in them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useStore } from '../../../store/useStore';
import { useI18n } from '../../../lib/i18n';
import { EditorCursorTrail } from '../../cursor/EditorCursorTrail';
import type { Block } from '../../../types';
import SectionEditor, { type SectionFocusHandle } from './SectionEditor';

/** Target number of top-level blocks per section. */
const SECTION_SIZE = 30;

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

export default function SectionedBlockEditor() {
  const { t } = useI18n();
  const activeDocId = useStore((s) => s.activeDocId);
  const activeDocTitle = useStore((s) => s.activeDoc?.title ?? '');
  const hasActiveDoc = useStore((s) => !!s.activeDoc);
  const updateDocumentMeta = useStore((s) => s.updateDocumentMeta);
  const editorCursorStyle = useStore((s) => s.editorCursorStyle);

  // Sections are built once per document load. We hold them in a ref-backed
  // state so section edits mutate the slice in place without re-rendering
  // (and thus remounting) sibling sections.
  const [sections, setSections] = useState<SectionState[]>([]);
  const sectionsRef = useRef<SectionState[]>([]);
  sectionsRef.current = sections;
  const loadedDocIdRef = useRef<string | null>(null);

  // ── Single shared cursor trail ──
  // ONE trail follows the caret across all sections (caret geometry comes
  // from the global window.getSelection(), so a single instance handles every
  // section and animates cross-section moves as one continuous flight).
  //
  // CRITICAL: the trail canvas/overlay must be VIEWPORT-sized — anchored to
  // the root pane, NOT to the (document-tall) sections wrapper. A canvas as
  // tall as a 232KB document blows past WebGL's max drawing-buffer size and
  // renders garbage (a full-width bar / invisible caret — the earlier bug).
  // `editorEl` is the sections wrapper (focus scope) so measureCaretRect's
  // "is the caret inside me?" check passes for whichever section is focused;
  // the canvas stays small and re-measures on scroll.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionsWrapperRef = useRef<HTMLDivElement | null>(null);
  const trailOverlayRef = useRef<HTMLDivElement | null>(null);
  const trailRef = useRef<EditorCursorTrail | null>(null);
  const notifyCaret = useCallback(() => {
    trailRef.current?.markDirty();
  }, []);

  // Load / re-section when the active document changes.
  useEffect(() => {
    if (!hasActiveDoc) {
      loadedDocIdRef.current = null;
      setSections([]);
      return;
    }
    if (loadedDocIdRef.current === activeDocId) return;
    loadedDocIdRef.current = activeDocId;
    const blocks = useStore.getState().activeDoc?.blocks ?? [];
    setSections(splitIntoSections(blocks));
  }, [activeDocId, hasActiveDoc]);

  // Create the single shared cursor trail. Canvas lives in a VIEWPORT-sized
  // overlay (rootRef) so the WebGL drawing buffer stays small even for a
  // document-tall section list. editorEl = sections wrapper (focus scope);
  // scrollContainer = the scroll pane (re-measure caret on scroll).
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

    const markDirty = () => trail.markDirty();
    // Caret moves within the viewport canvas as the document scrolls.
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

  // Stable section list for rendering — identity preserved across edits.
  const renderSections = useMemo(() => sections, [sections]);

  // ── Cross-section caret navigation ──
  // Registry of each section's imperative focus handle, plus the order of
  // section ids so a boundary keypress can find the neighbour.
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

  // Caret left this section's top → focus previous section's end.
  const handleCrossUp = useCallback((sectionId: string): boolean => {
    const order = sectionOrderRef.current;
    const idx = order.indexOf(sectionId);
    if (idx <= 0) return false; // already first section → let title-exit etc.
    const prev = focusHandlesRef.current.get(order[idx - 1]);
    if (!prev) return false;
    prev.focusEnd();
    return true;
  }, []);

  // Caret left this section's bottom → focus next section's start.
  const handleCrossDown = useCallback((sectionId: string): boolean => {
    const order = sectionOrderRef.current;
    const idx = order.indexOf(sectionId);
    if (idx === -1 || idx >= order.length - 1) return false; // last section
    const next = focusHandlesRef.current.get(order[idx + 1]);
    if (!next) return false;
    next.focusStart();
    return true;
  }, []);

  // Cmd/Ctrl+ArrowUp → caret to the very start of the document (first section).
  const handleJumpDocStart = useCallback((): boolean => {
    const first = sectionOrderRef.current[0];
    const handle = first ? focusHandlesRef.current.get(first) : undefined;
    if (!handle) return false;
    handle.focusStart();
    return true;
  }, []);

  // Cmd/Ctrl+ArrowDown → caret to the very end of the document (last section).
  const handleJumpDocEnd = useCallback((): boolean => {
    const order = sectionOrderRef.current;
    const last = order[order.length - 1];
    const handle = last ? focusHandlesRef.current.get(last) : undefined;
    if (!handle) return false;
    handle.focusEnd();
    return true;
  }, []);

  // Backspace at a section's very start → merge it into the previous section.
  // We concatenate prev.blocks + cur.blocks, drop the current section, and
  // give the merged section a NEW id (forcing a remount) with a pending
  // merge boundary so it runs a native joinBackward at the seam after load.
  const handleMergeUp = useCallback((sectionId: string): boolean => {
    const current = sectionsRef.current;
    const idx = current.findIndex((s) => s.id === sectionId);
    if (idx <= 0) return false; // first section → nothing above to merge into
    const prev = current[idx - 1];
    const cur = current[idx];
    const boundary = prev.blocks.length; // seam index in the merged blocks
    // Edge case: merging into a section whose only block is empty, or merging
    // an empty section — still safe, joinBackward will just no-op gracefully.
    const merged: SectionState = {
      // New id forces React to remount this section so the load effect (and
      // the join) re-runs even though it occupies the previous slot.
      id: `${prev.id}+m${Date.now()}`,
      blocks: [...prev.blocks, ...cur.blocks],
      pendingMergeBoundary: boundary,
    };
    const next = [...current.slice(0, idx - 1), merged, ...current.slice(idx + 1)];
    sectionsRef.current = next;
    setSections(next);
    // Persist the merged full block array (the native join will further
    // refine block boundaries, reported via the section's normal onChange).
    const full = next.flatMap((s) => s.blocks);
    useStore.getState().setActiveDocBlocks(full, loadedDocIdRef.current ?? undefined);
    return true;
  }, []);

  // Clear the pending-merge marker once a section has applied it (so a later
  // unrelated remount doesn't re-run the join).
  const handleMergeApplied = useCallback((sectionId: string) => {
    const current = sectionsRef.current;
    const idx = current.findIndex((s) => s.id === sectionId);
    if (idx === -1 || current[idx].pendingMergeBoundary == null) return;
    current[idx] = { ...current[idx], pendingMergeBoundary: null };
    // No setState: clearing the marker must NOT remount the section.
  }, []);

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
            type="text"
            value={activeDocTitle}
            onChange={(e) => updateDocumentMeta({ title: e.target.value })}
            placeholder={t('editor.titlePlaceholder')}
            className="text-4xl font-bold text-[var(--vscode-editor-foreground)] bg-transparent border-none focus:outline-none w-full placeholder-[var(--vscode-descriptionForeground)] placeholder-opacity-40 pb-1"
          />
        </div>

        {/* One independent editor per section. The sections wrapper is used
            only as the trail's focus-scope (it contains every section's
            .ProseMirror); the trail CANVAS itself lives in the viewport-sized
            overlay below so it never exceeds WebGL's max canvas size on huge
            documents. */}
        <div ref={sectionsWrapperRef} className="tiptap-editor-container relative">
          {renderSections.map((s) => (
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
            />
          ))}
        </div>

        {/* Trailing scroll buffer: gives the LAST section's editor room below
            the caret so pressing Enter at the document end scrolls smoothly
            instead of slamming the new line against the viewport bottom. */}
        <div className="min-h-[40vh]" aria-hidden="true" />
      </div>

      {/* Shared GPU cursor-trail overlay — VIEWPORT-sized (covers the visible
          editor area only), so the WebGL canvas stays small regardless of
          document length. The caret is measured in viewport coordinates and
          re-measured on scroll, so one trail follows the caret across all
          sections and animates cross-section moves as one continuous flight. */}
      <div
        ref={trailOverlayRef}
        className="absolute inset-0"
        style={{ pointerEvents: 'none', zIndex: 5 }}
      />
    </div>
  );
}
