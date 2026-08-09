/**
 * useSectionLoader - 从 DocumentPanel 提取的分段加载/再平衡逻辑。
 *
 * 职责：
 *   - 文档加载 + 分段（splitIntoSections）
 *   - 渐进式挂载（SECTIONS_PER_BATCH）
 *   - section change -> 持久化
 *   - cross-section delete -> 折叠空 section
 *   - section blur -> 再平衡（split/merge）
 *   - merge up / merge applied
 *   - skeleton 显示控制
 *
 * sectionsRef 由 hook 拥有并暴露，供外部（isWholeDocEmpty、pagehide）读取。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  splitIntoSections,
  SECTION_SIZE,
  SECTION_MAX,
  SECTION_MERGE_BELOW,
  type SectionState,
} from '../../../lib/editor/sectioning';
import type { Block } from '../../../types';
import { useStore } from '../../../store/useStore';
import type { Editor } from '@tiptap/react';

export interface UseSectionLoaderParams {
  isStatic: boolean;
  doc?: { title: string; blocks: Block[] };
  editorDocId: string | undefined;
  hasActiveDoc: boolean;
  activeDocReloadNonce: number;
  focusedEditorRef: RefObject<Editor | null>;
  sectionEditorsRef: RefObject<Map<string, Editor>>;
}

export function useSectionLoader(params: UseSectionLoaderParams) {
  const {
    isStatic,
    doc,
    editorDocId,
    hasActiveDoc,
    activeDocReloadNonce,
    focusedEditorRef,
    sectionEditorsRef,
  } = params;

const [sections, setSections] = useState<SectionState[]>([]);
const sectionsRef = useRef<SectionState[]>([]);
sectionsRef.current = sections;
const loadedDocIdRef = useRef<string | null>(null);
/** `${docId}:${reloadNonce}` — guards against reloading the same doc+nonce.
 *  Separated from `loadedDocIdRef` (pure docId) which is used for flushing
 *  the outgoing doc. When a backup restore bumps the nonce without changing
 *  docId, this guard lets the load effect re-run. */
const loadTriggerRef = useRef<string | null>(null);
/** Static-doc identity tracking (isStatic mode only). `doc` is recreated
 *  (new object identity) whenever HelpSection's `useMemo` deps change, e.g.
 *  on a locale switch — `loadedStaticDocRef` detects that and
 *  `staticDocRevRef` produces a fresh key so SectionEditor instances remount
 *  with the new content instead of keeping stale (previous-locale) text. */
const loadedStaticDocRef = useRef<{ title: string; blocks: Block[] } | undefined>(undefined);
const staticDocRevRef = useRef(0);
const [staticDocKey, setStaticDocKey] = useState<string | null>(null);
/** Unified doc identity used for SectionEditor `key`s and skeleton
 *  comparisons — the static key in static mode, `editorDocId` otherwise. */
const docKey = isStatic ? staticDocKey : editorDocId;
/** The doc id whose content has actually finished loading into all
 *  section editors. While this lags behind `editorDocId` we show a
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


  // ── Load / re-section when the active document changes ──
  useEffect(() => {
    // Static document mode — split once per `doc` identity change. Skips all
    // store reads/writes since the static doc isn't backed by the store.
    if (isStatic) {
      if (!doc || loadedStaticDocRef.current === doc) return;
      loadedStaticDocRef.current = doc;
      staticDocRevRef.current += 1;
      const key = `__static__:${staticDocRevRef.current}`;
      loadedDocIdRef.current = key;
      loadTriggerRef.current = key;
      loadedSectionCountRef.current = 0;
      expectedSectionCountRef.current = 0;
      const newSections = splitIntoSections(doc.blocks);
      expectedSectionCountRef.current = newSections.length;
      setVisibleCount(0);
      setSections(newSections);
      setStaticDocKey(key);
      return;
    }

    if (!hasActiveDoc) {
      loadedDocIdRef.current = null;
      loadTriggerRef.current = null;
      setRenderedDocId(null);
      setVisibleCount(0);
      setSections([]);
      return;
    }
    // Guard on `${docId}:${nonce}` so a backup restore (which bumps the
    // nonce without changing docId) forces a reload.
    const trigger = `${editorDocId}:${activeDocReloadNonce}`;
    if (loadTriggerRef.current === trigger) return;

    // ── Flush the OUTGOING document's pending section edits ──
    // Before switching to the new document, persist the outgoing doc's current
    // blocks to its `documents[]` entry via `flushBlocksToDoc`.
    //
    // We read `s.blocks` from the section state directly — NOT from
    // `editor.getJSON()`. Each SectionEditor's unmount cleanup runs
    // synchronously in the commit phase (BEFORE this passive effect), and
    // already flushed any pending (un-debounced) edits into its section's
    // `blocks` via `handleSectionChange`. So `s.blocks` holds the most recent
    // content.
    //
    // Reading `editor.getJSON()` here would be a DATA-LOSS BUG: when the
    // active doc changes, the SectionEditor keys change
    // (`${editorDocId}:${s.id}`), so React unmounts the old editors and mounts
    // new ones. The newly-mounted editors start with an empty paragraph and
    // load real content via a deferred `setTimeout(0)` setContent — which runs
    // AFTER this passive effect. Calling getJSON() here captures that empty
    // initial state and overwrites the outgoing doc with a single blank block,
    // destroying all its content.
    const outgoingDocId = loadedDocIdRef.current;
    if (outgoingDocId && outgoingDocId !== editorDocId) {
      const current = sectionsRef.current;
      const full = current.flatMap((s) => s.blocks);
      useStore.getState().flushBlocksToDoc(outgoingDocId, full);
    }

    loadTriggerRef.current = trigger;
    loadedDocIdRef.current = editorDocId ?? null;
    // Reset loading counters — sections will report back as they finish.
    loadedSectionCountRef.current = 0;
    expectedSectionCountRef.current = 0;
    const blocks =
      useStore.getState().documents.find((item) => item.id === editorDocId)?.blocks ?? [];
    const newSections = splitIntoSections(blocks);
    expectedSectionCountRef.current = newSections.length;
    // Start with 0 visible sections — they will be progressively revealed
    // by the idle callback below. This prevents rendering ALL N ProseMirror
    // instances at once (which blocks the main thread for large documents).
    setVisibleCount(0);
    setSections(newSections);
  }, [editorDocId, hasActiveDoc, activeDocReloadNonce, isStatic, doc]);


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


  // ── Collapse empty sections after a cross-section delete ──
  // After select-all + delete, every section's ProseMirror doc retains a
  // single empty paragraph (the schema's minimum block count). With N
  // sections that produces N placeholder "type something…" lines. This
  // callback (invoked by useCrossSectionSelection right after
  // deleteSelection) detects that state and collapses all sections into
  // one, keeping the first section's editor (which already holds the empty
  // paragraph and, for select-all, the caret focus).
  const handleCrossSectionDelete = useCallback(() => {
    const current = sectionsRef.current;
    if (current.length <= 1) return;

    // Check whether every section's editor doc is now a single empty paragraph.
    let allEmpty = true;
    for (const s of current) {
      const ed = sectionEditorsRef.current.get(s.id);
      if (!ed || ed.isDestroyed) {
        allEmpty = false;
        break;
      }
      const doc = ed.state.doc;
      if (
        doc.childCount !== 1 ||
        doc.firstChild?.type.name !== 'paragraph' ||
        doc.firstChild.content.size !== 0
      ) {
        allEmpty = false;
        break;
      }
    }
    if (!allEmpty) return;

    // Keep the first section (its editor already has the empty paragraph).
    // Drop all others so the user sees a single placeholder line.
    const first = current[0];
    const emptyBlock: Block = {
      id: crypto.randomUUID(),
      type: 'text',
      content: [],
    };
    const next: SectionState[] = [{ ...first, blocks: [emptyBlock] }];
    sectionsRef.current = next;
    setSections(next);
    useStore.getState().setActiveDocBlocks([emptyBlock], loadedDocIdRef.current ?? undefined);
  }, []);


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
        // Fold a small trailing remainder chunk into the previous one — see
        // the matching comment in `splitIntoSections` (sectioning.ts) for
        // why a tiny/lone leftover section renders a misleading empty-doc
        // placeholder even though the rest of the section had real content.
        if (chunks.length > 1) {
          const lastChunk = chunks[chunks.length - 1];
          if (lastChunk.blocks.length <= SECTION_MERGE_BELOW) {
            const prevChunk = chunks[chunks.length - 2];
            prevChunk.blocks = [...prevChunk.blocks, ...lastChunk.blocks];
            chunks.pop();
          }
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


  const renderSections = useMemo(() => sections, [sections]);


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


  const showSkeleton = renderedDocId !== docKey;


  return {
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
  };
}
