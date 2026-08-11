import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  splitIntoSections,
  SECTION_SIZE,
  SECTION_MAX,
  SECTION_MERGE_BELOW
} from "../../../lib/editor/sectioning";
import { useStore } from "../../../store/useStore";
function useSectionLoader(params) {
  const {
    isStatic,
    doc,
    editorDocId,
    hasActiveDoc,
    activeDocReloadNonce,
    focusedEditorRef,
    sectionEditorsRef
  } = params;
  const [sections, setSections] = useState([]);
  const sectionsRef = useRef([]);
  sectionsRef.current = sections;
  const loadedDocIdRef = useRef(null);
  const loadTriggerRef = useRef(null);
  const loadedStaticDocRef = useRef(void 0);
  const staticDocRevRef = useRef(0);
  const [staticDocKey, setStaticDocKey] = useState(null);
  const docKey = isStatic ? staticDocKey : editorDocId;
  const [renderedDocId, setRenderedDocId] = useState(null);
  const loadedSectionCountRef = useRef(0);
  const expectedSectionCountRef = useRef(0);
  const [visibleCount, setVisibleCount] = useState(0);
  useEffect(() => {
    if (isStatic) {
      if (!doc || loadedStaticDocRef.current === doc) return;
      loadedStaticDocRef.current = doc;
      staticDocRevRef.current += 1;
      const key = `__static__:${staticDocRevRef.current}`;
      loadedDocIdRef.current = key;
      loadTriggerRef.current = key;
      loadedSectionCountRef.current = 0;
      expectedSectionCountRef.current = 0;
      const newSections2 = splitIntoSections(doc.blocks);
      expectedSectionCountRef.current = newSections2.length;
      setVisibleCount(0);
      setSections(newSections2);
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
    const trigger = `${editorDocId}:${activeDocReloadNonce}`;
    if (loadTriggerRef.current === trigger) return;
    const outgoingDocId = loadedDocIdRef.current;
    if (outgoingDocId && outgoingDocId !== editorDocId) {
      const current = sectionsRef.current;
      const full = current.flatMap((s) => s.blocks);
      useStore.getState().flushBlocksToDoc(outgoingDocId, full);
    }
    loadTriggerRef.current = trigger;
    loadedDocIdRef.current = editorDocId ?? null;
    loadedSectionCountRef.current = 0;
    expectedSectionCountRef.current = 0;
    const blocks = useStore.getState().documents.find((item) => item.id === editorDocId)?.blocks ?? [];
    const newSections = splitIntoSections(blocks);
    expectedSectionCountRef.current = newSections.length;
    setVisibleCount(0);
    setSections(newSections);
  }, [editorDocId, hasActiveDoc, activeDocReloadNonce, isStatic, doc]);
  const SECTIONS_PER_BATCH = 2;
  useEffect(() => {
    if (visibleCount >= sections.length) return;
    const revealNext = () => {
      setVisibleCount((prev) => {
        const next = Math.min(prev + SECTIONS_PER_BATCH, sections.length);
        return next;
      });
    };
    const handle = typeof requestIdleCallback !== "undefined" ? requestIdleCallback(revealNext, { timeout: 200 }) : window.setTimeout(revealNext, 0);
    return () => {
      if (typeof handle === "number" && typeof cancelIdleCallback !== "undefined") {
        cancelIdleCallback(handle);
      } else {
        clearTimeout(handle);
      }
    };
  }, [visibleCount, sections.length]);
  const handleSectionLoaded = useCallback(() => {
    setRenderedDocId(loadedDocIdRef.current);
  }, []);
  const handleSectionChange = useCallback(
    (sectionId, blocks) => {
      const current = sectionsRef.current;
      const idx = current.findIndex((s) => s.id === sectionId);
      if (idx === -1) return;
      current[idx] = { ...current[idx], blocks };
      const full = current.flatMap((s) => s.blocks);
      useStore.getState().setActiveDocBlocks(full, loadedDocIdRef.current ?? void 0);
    },
    []
  );
  const handleCrossSectionDelete = useCallback(() => {
    const current = sectionsRef.current;
    if (current.length <= 1) return;
    let allEmpty = true;
    for (const s of current) {
      const ed = sectionEditorsRef.current.get(s.id);
      if (!ed || ed.isDestroyed) {
        allEmpty = false;
        break;
      }
      const doc2 = ed.state.doc;
      if (doc2.childCount !== 1 || doc2.firstChild?.type.name !== "paragraph" || doc2.firstChild.content.size !== 0) {
        allEmpty = false;
        break;
      }
    }
    if (!allEmpty) return;
    const first = current[0];
    const emptyBlock = {
      id: crypto.randomUUID(),
      type: "text",
      content: []
    };
    const next = [{ ...first, blocks: [emptyBlock] }];
    sectionsRef.current = next;
    setSections(next);
    useStore.getState().setActiveDocBlocks([emptyBlock], loadedDocIdRef.current ?? void 0);
  }, []);
  const rebalanceSeqRef = useRef(0);
  const handleSectionBlur = useCallback((sectionId) => {
    const run = () => {
      const current = sectionsRef.current;
      const idx = current.findIndex((s) => s.id === sectionId);
      if (idx === -1) return;
      const focusedEd = focusedEditorRef.current;
      const sec = current[idx];
      let next = null;
      if (sec.blocks.length > SECTION_MAX) {
        const edForSec = sectionEditorsRef.current.get(sectionId);
        if (edForSec && edForSec === focusedEd && edForSec.isFocused) return;
        const seq = ++rebalanceSeqRef.current;
        const chunks = [];
        for (let i = 0; i < sec.blocks.length; i += SECTION_SIZE) {
          chunks.push({
            id: `${sec.id}~s${seq}_${i / SECTION_SIZE}`,
            blocks: sec.blocks.slice(i, i + SECTION_SIZE)
          });
        }
        if (chunks.length > 1) {
          const lastChunk = chunks[chunks.length - 1];
          if (lastChunk.blocks.length <= SECTION_MERGE_BELOW) {
            const prevChunk = chunks[chunks.length - 2];
            prevChunk.blocks = [...prevChunk.blocks, ...lastChunk.blocks];
            chunks.pop();
          }
        }
        next = [...current.slice(0, idx), ...chunks, ...current.slice(idx + 1)];
      } else if (sec.blocks.length <= SECTION_MERGE_BELOW && idx + 1 < current.length && current[idx].blocks.length + current[idx + 1].blocks.length <= SECTION_SIZE) {
        const nextSec = current[idx + 1];
        const edA = sectionEditorsRef.current.get(sectionId);
        const edB = sectionEditorsRef.current.get(nextSec.id);
        if (edA && edA === focusedEd && edA.isFocused || edB && edB === focusedEd && edB.isFocused) {
          return;
        }
        const seq = ++rebalanceSeqRef.current;
        const merged = {
          id: `${sec.id}~m${seq}`,
          blocks: [...sec.blocks, ...nextSec.blocks]
        };
        next = [...current.slice(0, idx), merged, ...current.slice(idx + 2)];
      }
      if (next) {
        sectionsRef.current = next;
        setSections(next);
        setVisibleCount(next.length);
      }
    };
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(run, { timeout: 500 });
    } else {
      setTimeout(run, 50);
    }
  }, []);
  const renderSections = useMemo(() => sections, [sections]);
  const handleMergeUp = useCallback((sectionId) => {
    const current = sectionsRef.current;
    const idx = current.findIndex((s) => s.id === sectionId);
    if (idx <= 0) return false;
    const prev = current[idx - 1];
    const cur = current[idx];
    const boundary = prev.blocks.length;
    const merged = {
      id: `${prev.id}+m${Date.now()}`,
      blocks: [...prev.blocks, ...cur.blocks],
      pendingMergeBoundary: boundary
    };
    const next = [...current.slice(0, idx - 1), merged, ...current.slice(idx + 1)];
    sectionsRef.current = next;
    setSections(next);
    const full = next.flatMap((s) => s.blocks);
    useStore.getState().setActiveDocBlocks(full, loadedDocIdRef.current ?? void 0);
    return true;
  }, []);
  const handleMergeApplied = useCallback((sectionId) => {
    const current = sectionsRef.current;
    const idx = current.findIndex((s) => s.id === sectionId);
    if (idx === -1 || current[idx].pendingMergeBoundary == null) return;
    current[idx] = { ...current[idx], pendingMergeBoundary: null };
  }, []);
  const showSkeleton = renderedDocId !== docKey;
  return {
    sections,
    sectionsRef,
    renderSections,
    visibleCount,
    docKey,
    showSkeleton,
    handleSectionLoaded,
    handleSectionChange,
    handleCrossSectionDelete,
    handleSectionBlur,
    handleMergeUp,
    handleMergeApplied
  };
}
export {
  useSectionLoader
};
