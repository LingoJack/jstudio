import { useCallback, useEffect, useRef, useState } from "react";
import {
  setSectionSearchMatches
} from "../../../lib/editor/extensions/sectionSearchHighlight";
const RESUB_DELAYS = [100, 300, 800, 2e3];
const RESCAN_DEBOUNCE_MS = 100;
function useCrossSectionFind(ctx, resetKey, query) {
  const [matches, setMatches] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const queryRef = useRef(query);
  queryRef.current = query;
  const matchesRef = useRef([]);
  matchesRef.current = matches;
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;
  const clearAllHighlights = useCallback(() => {
    const order = ctxRef.current.getOrder();
    for (const id of order) {
      setSectionSearchMatches(ctxRef.current.getEditor(id), [], null);
    }
  }, []);
  const paintAll = useCallback(() => {
    const order = ctxRef.current.getOrder();
    const cur = currentIndexRef.current;
    const active = matchesRef.current[cur];
    for (const id of order) {
      const editor = ctxRef.current.getEditor(id);
      if (!editor) continue;
      const sectionMatches = matchesRef.current.filter((m) => m.sectionId === id).map((m) => ({ from: m.from, to: m.to }));
      const activeIdxInSection = active && active.sectionId === id ? sectionMatches.findIndex(
        (m) => m.from === active.from && m.to === active.to
      ) : null;
      setSectionSearchMatches(editor, sectionMatches, activeIdxInSection);
    }
  }, []);
  const focusActive = useCallback(() => {
    const cur = currentIndexRef.current;
    const m = matchesRef.current[cur];
    if (!m) return;
    const handle = ctxRef.current.getHandle(m.sectionId);
    handle?.scrollToRange(m.from);
  }, []);
  const rescan = useCallback(() => {
    const q = queryRef.current;
    if (!q) {
      matchesRef.current = [];
      setMatches([]);
      setCurrentIndex(0);
      clearAllHighlights();
      return;
    }
    const order = ctxRef.current.getOrder();
    const needle = q.toLowerCase();
    const found = [];
    for (const id of order) {
      const editor = ctxRef.current.getEditor(id);
      if (!editor || editor.isDestroyed) continue;
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.text) {
          const text = node.text.toLowerCase();
          let idx = text.indexOf(needle);
          while (idx !== -1) {
            found.push({
              sectionId: id,
              from: pos + idx,
              to: pos + idx + q.length
            });
            idx = text.indexOf(needle, idx + needle.length);
          }
        }
        return true;
      });
    }
    matchesRef.current = found;
    setMatches(found);
    if (found.length === 0) {
      setCurrentIndex(0);
      clearAllHighlights();
      return;
    }
    if (currentIndexRef.current >= found.length) {
      setCurrentIndex(0);
    }
    paintAll();
    focusActive();
  }, [clearAllHighlights, paintAll, focusActive]);
  const next = useCallback(() => {
    if (matchesRef.current.length === 0) return;
    setCurrentIndex((i) => (i + 1) % matchesRef.current.length);
  }, []);
  const prev = useCallback(() => {
    if (matchesRef.current.length === 0) return;
    setCurrentIndex(
      (i) => (i - 1 + matchesRef.current.length) % matchesRef.current.length
    );
  }, []);
  const clear = useCallback(() => {
    matchesRef.current = [];
    setMatches([]);
    setCurrentIndex(0);
    clearAllHighlights();
  }, [clearAllHighlights]);
  useEffect(() => {
    rescan();
  }, [query]);
  useEffect(() => {
    if (matchesRef.current.length === 0) return;
    paintAll();
    focusActive();
  }, [currentIndex]);
  useEffect(() => {
    clear();
  }, [resetKey]);
  const subscribedRef = useRef(/* @__PURE__ */ new Set());
  const rescanTimerRef = useRef(null);
  useEffect(() => {
    const scheduleRescan = () => {
      if (rescanTimerRef.current) clearTimeout(rescanTimerRef.current);
      rescanTimerRef.current = setTimeout(() => {
        rescanTimerRef.current = null;
        rescan();
      }, RESCAN_DEBOUNCE_MS);
    };
    const subscribeAll = () => {
      const order = ctxRef.current.getOrder();
      let addedNew = false;
      for (const id of order) {
        const editor = ctxRef.current.getEditor(id);
        if (!editor || editor.isDestroyed) continue;
        if (subscribedRef.current.has(editor)) continue;
        editor.on("update", scheduleRescan);
        subscribedRef.current.add(editor);
        addedNew = true;
      }
      if (addedNew && queryRef.current) {
        scheduleRescan();
      }
    };
    subscribedRef.current = /* @__PURE__ */ new Set();
    subscribeAll();
    const timers = RESUB_DELAYS.map(
      (ms) => window.setTimeout(subscribeAll, ms)
    );
    return () => {
      if (rescanTimerRef.current) {
        clearTimeout(rescanTimerRef.current);
        rescanTimerRef.current = null;
      }
      for (const editor of subscribedRef.current) {
        if (!editor.isDestroyed) editor.off("update", scheduleRescan);
      }
      subscribedRef.current = /* @__PURE__ */ new Set();
      for (const t of timers) clearTimeout(t);
    };
  }, [resetKey]);
  return { matches, currentIndex, next, prev, rescan, clear };
}
export {
  useCrossSectionFind
};
