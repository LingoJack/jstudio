/**
 * useCrossSectionSelection — coordinates a text selection that spans multiple
 * independent section editors.
 *
 * Background: each SectionEditor is its own ProseMirror instance + its own
 * contenteditable. The browser only maintains ONE native Selection, which
 * lives inside whichever editor currently has focus. So a mouse drag that
 * crosses a section boundary cannot extend the native selection past that
 * boundary — the highlight simply stops, which is the "can't select past some
 * positions" symptom this hook fixes.
 *
 * Strategy:
 *   1. Track mousedown → mousemove → mouseup drags starting inside a section.
 *   2. When the drag stays within one section, do nothing — let ProseMirror's
 *      native selection handle it.
 *   3. When the drag crosses into another section, synthesize a multi-section
 *      selection:
 *        - Paint an inline Decoration (via setSectionHighlight) on EVERY
 *          covered section so the user sees a continuous highlight.
 *        - Keep the native Selection inside the anchor section (the one where
 *          the drag started) so copy/cut/keyboard events still fire there.
 *   4. Intercept copy/cut to splice together the selected text/HTML from each
 *      covered section (the native clipboard would only see the anchor part).
 *   5. Intercept Backspace/Delete/typing to delete the selection across all
 *      covered sections (from the bottom up so positions stay valid within
 *      each independent doc).
 *
 * The hook exposes:
 *   - `active`: whether a cross-section selection is currently in effect.
 *   - `clear()`: tear down the selection + highlights.
 *   - `selectAll()`: select the entire document across all sections.
 *   - `onMouseDownCapture`: attach to the scroll container's onMouseDownCapture.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';

import { setSectionHighlight } from '../../../lib/editor/extensions/sectionHighlightSelection';
import type { SectionFocusHandle } from './SectionEditor';

export interface CrossSelectionContext {
  /** section ids in document order (read fresh on each call). */
  getOrder: () => string[];
  /** get a section's focus handle by id. */
  getHandle: (id: string) => SectionFocusHandle | undefined;
  /** get a section's Editor by id (used for painting highlight decorations). */
  getEditor: (id: string) => Editor | undefined;
  /**
   * Called after a cross-section delete completes. The parent can use this
   * to collapse empty sections: after a select-all + delete, every section's
   * ProseMirror doc retains a single empty paragraph (the schema minimum),
   * so N sections produce N placeholder lines. The parent should detect this
   * and merge them into one section.
   */
  onAfterDelete?: () => void;
}

/** A resolved cross-section selection. */
interface ResolvedSelection {
  /** section where the drag started — keeps focus + the native selection. */
  anchorId: string;
  anchorIdx: number;
  /** caret edge inside the anchor section. */
  anchorPos: number;
  /** section where the drag currently ends. */
  endId: string;
  endIdx: number;
  endPos: number;
  /** forward = anchor is above end (anchorIdx < endIdx). */
  forward: boolean;
}

/** Per-section [from, to] range to highlight (and, for the anchor, select). */
interface SectionRange {
  id: string;
  from: number;
  to: number;
}

export interface CrossSectionSelectionApi {
  /** True when a cross-section selection is currently active. */
  active: boolean;
  /** Clear the cross-section selection and all highlights. */
  clear: () => void;
  /** Select the entire document across all sections. */
  selectAll: () => void;
  /** Attach to the scroll container's onMouseDownCapture. */
  onMouseDownCapture: (e: React.MouseEvent) => void;
}

function sectionIdFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null;
  const el = target.closest('[data-section-id]') as HTMLElement | null;
  return el?.getAttribute('data-section-id') ?? null;
}

export function useCrossSectionSelection(
  ctx: CrossSelectionContext,
  /** When this changes (e.g. active document id), the selection is cleared. */
  resetKey: string | null,
): CrossSectionSelectionApi {
  const [active, setActive] = useState(false);

  // Keep the latest ctx without re-creating callbacks.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const selRef = useRef<ResolvedSelection | null>(null);
  const rangesRef = useRef<SectionRange[]>([]);
  const dragOriginRef = useRef<{ id: string; idx: number; pos: number } | null>(null);
  const moveRafRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<MouseEvent | null>(null);

  const clearHighlights = useCallback(() => {
    const order = ctxRef.current.getOrder();
    for (const id of order) {
      const editor = ctxRef.current.getEditor(id);
      if (!editor) continue;
      setSectionHighlight(editor, null, null);
      editor.view.dom.classList.remove('cross-section-anchor-hide-selection');
    }
  }, []);

  const clear = useCallback(() => {
    clearHighlights();
    selRef.current = null;
    rangesRef.current = [];
    dragOriginRef.current = null;
    setActive(false);
  }, [clearHighlights]);

  /** Compute the [from, to] range for every section the selection covers. */
  const computeRanges = useCallback((sel: ResolvedSelection): SectionRange[] => {
    const order = ctxRef.current.getOrder();
    const minIdx = Math.min(sel.anchorIdx, sel.endIdx);
    const maxIdx = Math.max(sel.anchorIdx, sel.endIdx);
    const ranges: SectionRange[] = [];
    for (let i = minIdx; i <= maxIdx; i++) {
      const id = order[i];
      if (!id) continue;
      const size = ctxRef.current.getHandle(id)?.getDocSize() ?? 0;
      let from: number;
      let to: number;
      if (minIdx === maxIdx) {
        from = Math.min(sel.anchorPos, sel.endPos);
        to = Math.max(sel.anchorPos, sel.endPos);
      } else if (i === minIdx) {
        // top edge — selection runs to the end of this section
        if (sel.forward) {
          from = sel.anchorPos;
          to = size;
        } else {
          from = sel.endPos;
          to = size;
        }
      } else if (i === maxIdx) {
        // bottom edge — selection runs from the start of this section
        if (sel.forward) {
          from = 0;
          to = sel.endPos;
        } else {
          from = 0;
          to = sel.anchorPos;
        }
      } else {
        // middle section — fully covered
        from = 0;
        to = size;
      }
      ranges.push({ id, from, to });
    }
    return ranges;
  }, []);

  /**
   * Paint the cross-section highlight on every covered section and set the
   * native selection on the anchor. The anchor also gets a CSS class that hides
   * the native selection highlight so the visual selection is consistent across
   * all sections (only the custom `.cross-section-selected` decoration shows).
   */
  const apply = useCallback(
    (sel: ResolvedSelection) => {
      // Clear previous paint first so sections that leave the selection do not
      // keep stale highlights, and remove any old hide-selection class.
      clearHighlights();
      const ranges = computeRanges(sel);
      rangesRef.current = ranges;
      selRef.current = sel;
      for (const r of ranges) {
        setSectionHighlight(ctxRef.current.getEditor(r.id), r.from, r.to);
      }
      const anchorRange = ranges.find((r) => r.id === sel.anchorId);
      if (anchorRange) {
        ctxRef
          .current
          .getHandle(sel.anchorId)
          ?.setTextSelection(anchorRange.from, anchorRange.to);
        const anchorEditor = ctxRef.current.getEditor(sel.anchorId);
        anchorEditor?.view.dom.classList.add('cross-section-anchor-hide-selection');
      }
      setActive(true);
    },
    [clearHighlights, computeRanges],
  );

  const handleMove = useCallback(
    (e: MouseEvent) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      const endId = sectionIdFromTarget(e.target);
      if (!endId) return;
      const endPos = ctxRef.current.getHandle(endId)?.posAtCoords(e.clientX, e.clientY);
      if (endPos == null) return;
      const order = ctxRef.current.getOrder();
      const endIdx = order.indexOf(endId);
      if (endIdx === -1) return;

      // Same section as the drag origin — tear down any cross selection and
      // let ProseMirror's native selection follow the mouse.
      if (endId === origin.id) {
        if (selRef.current) clear();
        return;
      }

      // Crossing into another section — stop the native selection from trying
      // to extend (it can't, but preventing default avoids flicker/scroll).
      e.preventDefault();
      const forward = origin.idx <= endIdx;
      apply({
        anchorId: origin.id,
        anchorIdx: origin.idx,
        anchorPos: origin.pos,
        endId,
        endIdx,
        endPos,
        forward,
      });
    },
    [apply, clear],
  );

  // rAF-throttled mousemove — these fire very frequently during a drag.
  const onMove = useCallback(
    (e: MouseEvent) => {
      pendingMoveRef.current = e;
      if (moveRafRef.current != null) return;
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = null;
        const ev = pendingMoveRef.current;
        pendingMoveRef.current = null;
        if (ev) handleMove(ev);
      });
    },
    [handleMove],
  );

  const onUp = useCallback(() => {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseup', onUp, true);
    if (moveRafRef.current != null) {
      cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = null;
    }
    // selRef is intentionally left intact — the selection persists after
    // mouseup so the user can copy/cut/delete it.
  }, [onMove]);

  const onMouseDownCapture = useCallback(
    (e: React.MouseEvent) => {
      // Starting a new interaction — clear any existing cross selection.
      if (selRef.current) clear();
      const id = sectionIdFromTarget(e.target);
      if (!id) {
        dragOriginRef.current = null;
        return;
      }
      const pos = ctxRef.current.getHandle(id)?.posAtCoords(e.clientX, e.clientY);
      if (pos == null) {
        dragOriginRef.current = null;
        return;
      }
      const order = ctxRef.current.getOrder();
      const idx = order.indexOf(id);
      if (idx === -1) {
        dragOriginRef.current = null;
        return;
      }
      dragOriginRef.current = { id, idx, pos };
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
    },
    [clear, onMove, onUp],
  );

  const selectAll = useCallback(() => {
    clearHighlights();
    const order = ctxRef.current.getOrder();
    if (order.length === 0) return;
    const ranges: SectionRange[] = order.map((id) => {
      const size = ctxRef.current.getHandle(id)?.getDocSize() ?? 0;
      return { id, from: 0, to: size };
    });
    const firstId = order[0];
    const lastId = order[order.length - 1];
    const lastSize = ctxRef.current.getHandle(lastId)?.getDocSize() ?? 0;
    const firstSize = ctxRef.current.getHandle(firstId)?.getDocSize() ?? 0;
    rangesRef.current = ranges;
    selRef.current = {
      anchorId: firstId,
      anchorIdx: 0,
      anchorPos: 0,
      endId: lastId,
      endIdx: order.length - 1,
      endPos: lastSize,
      forward: true,
    };
    for (const r of ranges) {
      setSectionHighlight(ctxRef.current.getEditor(r.id), r.from, r.to);
    }
    ctxRef.current.getHandle(firstId)?.setTextSelection(0, firstSize);
    const anchorEditor = ctxRef.current.getEditor(firstId);
    anchorEditor?.view.dom.classList.add('cross-section-anchor-hide-selection');
    setActive(true);

    // DEBUG: write DOM snapshot to log file for diagnosis
    requestAnimationFrame(() => {
      try {
        const { invoke } = require('@tauri-apps/api/core') as typeof import('@tauri-apps/api/core');
        const lines: string[] = ['--- selectAll DOM scan ---'];
        const editors = order.map((id) => ctxRef.current.getEditor(id)).filter(Boolean);
        for (const ed of editors) {
          if (!ed || ed.isDestroyed) continue;
          const dom = ed.view.dom;
          // Check selection state
          const sel = ed.state.selection;
          lines.push(`Editor ${ed.view.dom.getAttribute('data-section-id')}: ` +
            `sel.empty=${sel.empty} sel.from=${sel.from} sel.to=${sel.to} ` +
            `selType=${sel.constructor.name} docSize=${ed.state.doc.content.size}`);
          // Scan all descendants for circular elements
          const all = dom.querySelectorAll('*');
          for (const el of all) {
            const style = getComputedStyle(el);
            const radius = style.borderRadius;
            const isCircle = radius === '50%' || (radius.endsWith('px') && parseFloat(radius) >= 8);
            if (!isCircle) continue;
            const rect = el.getBoundingClientRect();
            const op = parseFloat(style.opacity);
            if (rect.width <= 0 && rect.height <= 0) continue;
            if (op === 0) continue;
            lines.push(`  CIRCLE <${el.tagName.toLowerCase()} class="${el.className}"> ` +
              `pos=${style.position} z=${style.zIndex} op=${op} ` +
              `bg=${style.backgroundColor} border=${style.borderWidth} ${style.borderStyle} ${style.borderColor} ` +
              `r=${radius} ${rect.width}x${rect.height} @(${rect.x},${rect.y})`);
          }
          // Check gapcursor
          const gaps = dom.querySelectorAll('.ProseMirror-gapcursor');
          for (const g of gaps) {
            const style = getComputedStyle(g);
            const rect = g.getBoundingClientRect();
            lines.push(`  GAPCURSOR display=${style.display} ${rect.width}x${rect.height} @(${rect.x},${rect.y})`);
          }
          // Check selectednode
          const sels = dom.querySelectorAll('.ProseMirror-selectednode');
          for (const s of sels) {
            lines.push(`  SELECTEDNODE <${s.tagName.toLowerCase()} class="${s.className}">`);
          }
        }
        // Check body-level fixed/absolute circles
        for (const el of document.body.querySelectorAll('*')) {
          const style = getComputedStyle(el);
          if (style.position !== 'fixed' && style.position !== 'absolute') continue;
          const radius = style.borderRadius;
          const isCircle = radius === '50%' || (radius.endsWith('px') && parseFloat(radius) >= 8);
          if (!isCircle) continue;
          const rect = el.getBoundingClientRect();
          const op = parseFloat(style.opacity);
          if (rect.width <= 0 && rect.height <= 0) continue;
          if (op === 0) continue;
          // Skip if inside an editor
          if (editors.some((ed) => ed && !ed.isDestroyed && ed.view.dom.contains(el))) continue;
          lines.push(`  BODY <${el.tagName.toLowerCase()} class="${el.className}"> ` +
            `pos=${style.position} z=${style.zIndex} op=${op} ` +
            `${rect.width}x${rect.height} @(${rect.x},${rect.y})`);
        }
        invoke('write_graph_log', { msg: lines.join('\n') }).catch(() => {});
      } catch (e) {
        // Fallback: console
        console.warn('[selectAll-debug] error', e);
      }
    });
  }, [clearHighlights]);

  /** Delete the selection across all covered sections, bottom-up. */
  const deleteSelection = useCallback(() => {
    const ranges = rangesRef.current;
    const anchorId = selRef.current?.anchorId;
    for (let i = ranges.length - 1; i >= 0; i--) {
      const r = ranges[i];
      ctxRef.current.getHandle(r.id)?.deleteRange(r.from, r.to);
    }
    if (anchorId) {
      const anchorRange = ranges.find((r) => r.id === anchorId);
      if (anchorRange) {
        ctxRef
          .current
          .getHandle(anchorId)
          ?.setTextSelection(anchorRange.from, anchorRange.from);
      }
    }
    // Notify the parent so it can collapse empty sections (e.g. after
    // select-all + delete, every section retains a single empty paragraph;
    // they should merge into one to avoid N placeholder lines).
    ctxRef.current.onAfterDelete?.();
  }, []);

  // ── copy / cut / keydown (capture, document-level) ──
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (!selRef.current) return;
      e.preventDefault();
      const ranges = rangesRef.current;
      const text = ranges
        .map((r) => ctxRef.current.getHandle(r.id)?.getText(r.from, r.to) ?? '')
        .join('\n');
      const html = ranges
        .map((r) => ctxRef.current.getHandle(r.id)?.getHTML(r.from, r.to) ?? '')
        .join('');
      e.clipboardData?.setData('text/plain', text);
      e.clipboardData?.setData('text/html', html);
    };
    const onCut = (e: ClipboardEvent) => {
      if (!selRef.current) return;
      onCopy(e);
      deleteSelection();
      clear();
    };
    const onKey = (e: KeyboardEvent) => {
      const sel = selRef.current;
      if (!sel) return;
      const { key, metaKey, ctrlKey, altKey } = e;
      const anchorId = sel.anchorId;

      // Cmd/Ctrl+A → re-select the entire document.
      if ((metaKey || ctrlKey) && !altKey && key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
      // Cmd/Ctrl+C / X → let the copy/cut events handle it.
      if ((metaKey || ctrlKey) && (key.toLowerCase() === 'c' || key.toLowerCase() === 'x')) {
        return;
      }
      // Backspace / Delete → delete the selection.
      if (key === 'Backspace' || key === 'Delete') {
        e.preventDefault();
        deleteSelection();
        clear();
        return;
      }
      // Escape → clear, focus anchor.
      if (key === 'Escape') {
        e.preventDefault();
        clear();
        ctxRef.current.getHandle(anchorId)?.focus();
        return;
      }
      // Arrow keys → clear + focus anchor, let the native caret move.
      if (key.startsWith('Arrow')) {
        clear();
        ctxRef.current.getHandle(anchorId)?.focus();
        return;
      }
      // Printable char → replace selection with the typed char.
      if (!metaKey && !ctrlKey && !altKey && key.length === 1) {
        e.preventDefault();
        const ed = ctxRef.current.getEditor(anchorId);
        deleteSelection();
        clear();
        ed?.chain().focus().insertContent(key).run();
        return;
      }
      // Anything else (Enter, Tab, Home/End, PageUp/Down, F-keys, modified
      // combos) → clear the cross selection and let the keystroke go through
      // natively on the anchor section.
      clear();
      ctxRef.current.getHandle(anchorId)?.focus();
    };

    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCut, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCut, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [clear, deleteSelection, selectAll]);

  // Clear whenever the document changes.
  useEffect(() => {
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      if (moveRafRef.current != null) cancelAnimationFrame(moveRafRef.current);
      clearHighlights();
    };
  }, [onMove, onUp, clearHighlights]);

  return { active, clear, selectAll, onMouseDownCapture };
}
