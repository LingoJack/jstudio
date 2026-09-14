/**
 * SectionOutline — heading navigation for the sectioned editor.
 *
 * Headings are extracted from TWO sources and merged:
 *
 *   1. The store's `activeDoc.blocks` array — covers ALL blocks including
 *      those in not-yet-mounted sections (progressive mounting means some
 *      section editors don't exist yet when the outline first renders).
 *
 *   2. The mounted section editors' ProseMirror docs — always reflects the
 *      live editor state, even when the store's `blocks` hasn't been synced
 *      yet (setContent uses `emitUpdate: false`, so the store keeps the
 *      original DB blocks until the user edits a section).
 *
 * Merging both sources fixes the bug where the outline showed "no outline"
 * for documents whose `activeDoc.blocks` was stale or temporarily empty
 * (e.g. after a document switch where the outgoing doc's pending edits were
 * dropped by the ownership guard, or when a section's `setContent` failed
 * and a subsequent flush replaced the store's blocks with empty content).
 *
 * Jump-to-heading works across sections because every section renders into the
 * SAME scroll container, and heading blocks carry a `data-block-id` attribute
 * (via BlockIdExtension). We locate the heading's DOM element by that id and
 * scroll it into view — no need to know which section it lives in.
 *
 * Static/read-only mode: when `staticBlocks` is passed, source (1) above is
 * replaced with the given blocks instead of the store's `activeDoc.blocks`
 * (there may be no active document in the store at all, or an unrelated one
 * open in the background — e.g. HelpSection's static help document).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';

import { useStore } from '../../../store/useStore';
import { useI18n } from '../../../lib/core/i18n';
import { contentToString } from '../../../lib/editor/content/blockContent';
import { headingLevel } from '../../../lib/editor/tiptapAdapter/blocks';
import type { Block } from '../../../types';
import { ChevronRight, ArrowRight } from 'lucide-react';

/** Width of the outline panel. */
export const OUTLINE_WIDTH = 240;
/** Distance (px) below the scroll container's top within which a heading
 *  counts as "current" for the scroll-spy (drives the progress cursor). */
const SCROLL_SPY_TOP_OFFSET = 64;
/** Tolerance (px) for detecting "scrolled to the bottom" — at the bottom
 *  the LAST heading becomes active, since trailing headings of a short
 *  document can never cross the top offset line. */
const SCROLL_SPY_BOTTOM_EPSILON = 4;

interface HeadingItem {
  id: string; // block id
  level: number;
  text: string;
}

/** Extract headings from the store's Block[] (top-level blocks only). */
function extractHeadingsFromBlocks(blocks: Block[]): HeadingItem[] {
  const items: HeadingItem[] = [];
  for (const b of blocks) {
    if (b.type.startsWith('heading-')) {
      const text = contentToString(b.content).trim();
      if (text) {
        items.push({ id: b.id, level: headingLevel(b.type), text });
      }
    }
  }
  return items;
}

/**
 * Extract headings from mounted section editors' ProseMirror docs.
 *
 * Only top-level headings are collected — we do NOT traverse into
 * `collapsible` nodes. Their children are tracked separately as
 * `collapsibleChildren` in the Block model (not as top-level headings),
 * and `extractHeadingsFromBlocks` (the other source) likewise skips them.
 * Including them here would surface headings inside a collapsible as
 * top-level outline entries (e.g. a level-1 heading inside a collapsible
 * would render at the outline root), which does not reflect the document's
 * real structure.
 */
function extractHeadingsFromEditors(
  editors: Map<string, Editor> | null,
): HeadingItem[] {
  if (!editors || editors.size === 0) return [];
  const items: HeadingItem[] = [];
  for (const [, editor] of editors) {
    if (editor.isDestroyed) continue;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'heading') {
        const level = node.attrs.level as number;
        if (level >= 1 && level <= 6) {
          const text = node.textContent.trim();
          const id = (node.attrs.id as string) ?? '';
          if (text && id) {
            items.push({ id, level, text });
          }
        }
      }
      // Skip traversal into collapsible blocks so their inner headings
      // don't leak into the outline as top-level entries.
      if (node.type.name === 'collapsible') return false;
      return true;
    });
  }
  return items;
}

interface SectionOutlineProps {
  /** The scroll container that wraps all sections (for jump-to-heading). */
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /** Map of section id to its Editor instance, shared from parent. */
  sectionEditorsRef: RefObject<Map<string, Editor> | null>;
  /**
   * When provided, use these blocks instead of the store's
   * `activeDoc.blocks`. Used for static/read-only documents that aren't
   * backed by the store (e.g. HelpSection's help document) — without this,
   * the outline would show headings from whatever real document happens to
   * be open in the background instead of the static document being shown.
   */
  staticBlocks?: Block[];
}

export default function SectionOutline({
  scrollContainerRef,
  sectionEditorsRef,
  staticBlocks,
}: SectionOutlineProps) {
  const { t } = useI18n();
  const isStatic = staticBlocks != null;
  // Subscribe to blocks (primary heading source — covers unmounted sections).
  // Skipped in static mode (see `staticBlocks` doc above).
  const storeBlocks = useStore((s) => (isStatic ? undefined : s.activeDoc?.blocks));
  // Subscribe to activeDocId so the outline re-extracts on document switch
  // even if the `blocks` reference happens to be reused (defensive — in
  // practice openDocument always sets a different doc with a different
  // blocks array, but this costs nothing and guards against edge cases).
  const storeActiveDocId = useStore((s) => (isStatic ? undefined : s.activeDocId));
  const blocks = isStatic ? staticBlocks : storeBlocks;
  const activeDocId = isStatic ? '__static__' : storeActiveDocId;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Wrapper around the rows whose height the fold animation changes; watched
  // by a ResizeObserver (see fold ballast effect below).
  const outlineContentRef = useRef<HTMLDivElement | null>(null);
  // Bottom spacer that grows in lockstep with the fold shrink, keeping the
  // total scroll height constant while a fold animates (see fold ballast
  // effect below).
  const ballastRef = useRef<HTMLDivElement | null>(null);
  // Content height when the running fold started; null when no fold runs.
  const foldBaseRef = useRef<{ base: number } | null>(null);
  // Bumped by section-editor event listeners to force re-extraction from
  // the editors' live ProseMirror docs. This catches content loaded via
  // setContent({ emitUpdate: false }) which doesn't sync back to the store.
  const [editorVersion, setEditorVersion] = useState(0);

  // ── Source 1: store blocks ──
  const storeHeadings = useMemo(
    () => extractHeadingsFromBlocks(blocks ?? []),
    // activeDocId is a dep so we re-extract on doc switch even if blocks
    // ref is unchanged (stale reference edge case).
    [blocks, activeDocId],
  );

  // ── Source 2: mounted editors' ProseMirror docs ──
  const editorHeadings = useMemo(
    () => extractHeadingsFromEditors(sectionEditorsRef.current),
    [sectionEditorsRef, editorVersion, activeDocId],
  );

  // ── Merge: union of both, deduplicated by heading id ──
  // Store headings take priority (they cover unmounted sections). Editor
  // headings fill gaps when the store is stale/empty — this is the fix for
  // the "some docs show empty outline" bug.
  const headings = useMemo(() => {
    if (editorHeadings.length === 0) return storeHeadings;
    if (storeHeadings.length === 0) return editorHeadings;
    const seen = new Set(storeHeadings.map((h) => h.id));
    const merged = [...storeHeadings];
    for (const h of editorHeadings) {
      if (!seen.has(h.id)) {
        merged.push(h);
        seen.add(h.id);
      }
    }
    return merged;
  }, [storeHeadings, editorHeadings]);

  const hasOutlineContent = headings.length > 0;

  // ── Subscribe to editor events to trigger re-extraction ──
  // Sections mount progressively (requestIdleCallback batches), so we
  // re-attempt subscription on a few timers to catch newly mounted editors.
  const subscribedRef = useRef<Set<Editor>>(new Set());
  useEffect(() => {
    const trigger = () => setEditorVersion((v) => (v + 1) & 0x7fffffff);

    const subscribeAll = () => {
      const editors = sectionEditorsRef.current;
      if (!editors) return;
      for (const [, editor] of editors) {
        if (subscribedRef.current.has(editor) || editor.isDestroyed) continue;
        editor.on('transaction', trigger);
        editor.on('update', trigger);
        subscribedRef.current.add(editor);
      }
    };

    // Reset subscribed set on doc switch — old editors are destroyed.
    subscribedRef.current = new Set();
    subscribeAll();
    // Re-subscribe as more sections mount progressively.
    const timers = [100, 300, 800, 2000].map((ms) =>
      window.setTimeout(subscribeAll, ms),
    );

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      for (const editor of subscribedRef.current) {
        if (!editor.isDestroyed) {
          editor.off('transaction', trigger);
          editor.off('update', trigger);
        }
      }
      subscribedRef.current.clear();
    };
  }, [activeDocId, sectionEditorsRef]);

  // Keep the active heading valid as the list changes.
  useEffect(() => {
    if (headings.length === 0) {
      setActiveId(null);
    } else {
      setActiveId((prev) =>
        prev && headings.some((h) => h.id === prev) ? prev : headings[0].id,
      );
    }
  }, [headings]);

  // ── Scroll-spy: the active heading (and thus the progress cursor)
  // follows the reading position in the editor scroll container.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || headings.length === 0) return;
    let raf = 0;
    const spy = () => {
      const containerTop = container.getBoundingClientRect().top;
      let current = headings[0].id;
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Bottom fallback: trailing headings of a short document can never
      // cross the top offset line, so force the last one at the bottom.
      // (Skipped when the doc doesn't scroll at all — then the offset
      // logic below keeps the first visible heading active.)
      const scrollable = scrollHeight > clientHeight + 1;
      const atBottom =
        scrollable &&
        scrollTop + clientHeight >= scrollHeight - SCROLL_SPY_BOTTOM_EPSILON;
      if (atBottom) {
        current = headings[headings.length - 1].id;
      } else {
        for (const h of headings) {
          const el = container.querySelector(
            `[data-block-id="${CSS.escape(h.id)}"]`,
          ) as HTMLElement | null;
          if (!el) continue;
          if (el.getBoundingClientRect().top - containerTop <= SCROLL_SPY_TOP_OFFSET) {
            current = h.id;
          } else {
            break;
          }
        }
      }
      setActiveId(current);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(spy);
    };
    spy();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [scrollContainerRef, headings, activeDocId]);

  const handleClick = useCallback(
    (item: HeadingItem) => {
      const container = scrollContainerRef.current;
      const editorsMap = sectionEditorsRef.current;
      if (!container) return;

      // Find the heading DOM element by its block id.
      const el = container.querySelector(
        `[data-block-id="${CSS.escape(item.id)}"]`,
      ) as HTMLElement | null;
      if (!el) {
        setActiveId(item.id);
        return;
      }

      // Scroll the heading into view.
      const rect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      container.scrollTop += rect.top - containerRect.top - 12;

      // Find the ProseMirror editor that contains this heading.
      const pmContainer = el.closest('.ProseMirror') as HTMLElement | null;
      if (pmContainer && editorsMap) {
        // Match the DOM container to its Editor instance.
        for (const [, editor] of editorsMap) {
          if (editor.view.dom === pmContainer) {
            // Find the heading node's ProseMirror position and set caret there.
            const doc = editor.state.doc;
            doc.descendants((node, pos) => {
              if (node.type.name === 'heading' && node.attrs.id === item.id) {
                // Position at start of heading content (pos + 1 skips past the node start token).
                editor.chain().focus().setTextSelection(pos + 1).run();
                return false; // Stop traversal.
              }
              return true;
            });
            break;
          }
        }
      }

      setActiveId(item.id);
    },
    [scrollContainerRef, sectionEditorsRef],
  );

  const toggle = useCallback((item: HeadingItem) => {
    // Start tracking the fold. The baseline includes any ballast left over
    // from previous folds, so content + ballast stays constant throughout.
    const content = outlineContentRef.current;
    if (content) {
      foldBaseRef.current = {
        base: content.offsetHeight + (ballastRef.current?.offsetHeight ?? 0),
      };
    }
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  // ── Fold ballast ──
  // A running fold shrinks the outline content frame by frame. If the total
  // scroll height shrank with it, a scrolled (especially bottom-clamped)
  // panel would clamp scrollTop every frame — upper headings slide down and
  // the fold never reads as "folding up". Instead, the ballast spacer below
  // the list grows in lockstep with the shrink (total height constant,
  // scrollTop untouched, fold plays in place) and then simply STAYS — there
  // is no post-fold settle glide. While idle, the ballast is opportunistically
  // trimmed to the blank stretch the viewport actually reaches into: that
  // part sits entirely below the viewport bottom, so removing it provably
  // never moves the view, and the phantom padding evaporates as the user
  // scrolls away from the bottom.
  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = outlineContentRef.current;
    if (!container || !content) return;

    const trimBallast = () => {
      const ballast = ballastRef.current;
      if (!ballast || foldBaseRef.current) return;
      const current = ballast.offsetHeight;
      if (current === 0) return;
      // Blank stretch between the real content end and the viewport bottom.
      const visibleBlank =
        container.clientHeight -
        (content.getBoundingClientRect().bottom -
          container.getBoundingClientRect().top);
      const next = Math.max(0, Math.min(current, visibleBlank));
      if (next !== current) ballast.style.height = `${next}px`;
    };

    let releaseTimer = 0;
    const ro = new ResizeObserver(() => {
      const ballast = ballastRef.current;
      if (!ballast) return;
      const fold = foldBaseRef.current;
      if (!fold) {
        trimBallast();
        return;
      }
      // Track the fold frame by frame: keep content + ballast constant.
      ballast.style.height = `${Math.max(
        0,
        fold.base - content.offsetHeight,
      )}px`;
      // Release shortly after the fold stops resizing content: stop
      // tracking and trim whatever is already below the viewport. No
      // transition, no settle glide.
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        foldBaseRef.current = null;
        trimBallast();
      }, FOLD_RELEASE_DELAY_MS);
    });
    ro.observe(content);
    container.addEventListener('scroll', trimBallast, { passive: true });
    return () => {
      ro.disconnect();
      container.removeEventListener('scroll', trimBallast);
      window.clearTimeout(releaseTimer);
      foldBaseRef.current = null;
    };
  }, [scrollContainerRef, hasOutlineContent]);

  // A document switch invalidates any running fold baseline.
  useEffect(() => {
    foldBaseRef.current = null;
    if (ballastRef.current) ballastRef.current.style.height = '0px';
  }, [activeDocId]);

  return (
    <div
      data-outline-root
      // No collapsed strip / hover-expand / pinned state machine — the
      // panel is simply open or closed, toggled by the single corner pin in
      // DocumentPanel. pt-9 pushes content below the absolute title bar's
      // 36px overlay (which would otherwise swallow clicks up there).
      className="shrink-0 h-full bg-[var(--vscode-editor-background)] flex flex-col select-none z-30 relative overflow-hidden"
      style={{ width: OUTLINE_WIDTH }}
    >
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-9">
        {headings.length === 0 ? (
          <p className="text-xs text-[var(--vscode-descriptionForeground)] py-2">
            {t('outline.empty')}
          </p>
        ) : (
          <>
            {/* Rows carry the rail as their left border — stacked gapless,
            the borders form one continuous vertical line that doubles
            as a page progress bar (consumed portion is tinted, the
            current heading gets the "->" cursor). */}
            <div ref={outlineContentRef}>
              {renderOutline(
                headings,
                collapsed,
                activeId,
                (item) => handleClick(item),
                (item) => toggle(item),
              )}
            </div>
            {/* Fold ballast: lives OUTSIDE the observed wrapper so its own
            resize doesn't re-trigger the observer. */}
            <div
              ref={ballastRef}
              aria-hidden
              className="shrink-0"
              style={{ height: 0 }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Outline list: rail + progress + cursor ──────────────────────────────
// Every row carries a left border; stacked gapless, the borders form ONE
// continuous vertical rail (embedded in the panel, no panel separator).
// The rail doubles as a vertical page-progress bar: rows at/above the
// current heading are tinted accent ("consumed"), and the current heading
// is marked by a "->" cursor straddling the rail. Hierarchy is expressed
// by indentation plus weight (top-level rows are medium-weight).

interface OutlineNode {
  item: HeadingItem;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  children: OutlineNode[];
}

/** Text distance (px) from the rail (row's left border) at depth 0. */
const ROW_BASE_INDENT = 12;
/** Extra indent (px) per hierarchy depth. */
const ROW_DEPTH_INDENT = 14;
/** Duration (ms) of the expand/collapse fold animation. */
const FOLD_DURATION_MS = 200;
/** Delay after the last fold-driven content resize before fold tracking is
 *  released (must cover FOLD_DURATION_MS frame gaps). */
const FOLD_RELEASE_DELAY_MS = 150;

/**
 * Build the outline tree. Unlike a flat "skip collapsed subtrees" walk,
 * children are ALWAYS kept in the tree (even under a collapsed node) so
 * they stay mounted inside an animated 0fr/1fr grid wrapper and the
 * fold-up/down plays smoothly instead of snapping.
 */
function buildOutlineTree(
  headings: HeadingItem[],
  collapsed: Set<string>,
): OutlineNode[] {
  if (headings.length === 0) return [];

  const build = (
    items: HeadingItem[],
    level: number,
    depth: number,
  ): OutlineNode[] => {
    const nodes: OutlineNode[] = [];
    let i = 0;
    while (i < items.length) {
      const item = items[i];
      if (item.level < level) break;
      if (item.level > level) {
        // Skipped-level heading without a parent at this level — skip it
        // (same edge-case behavior as the previous flat walk).
        i++;
        continue;
      }
      const childLevel =
        i + 1 < items.length && items[i + 1].level > item.level
          ? items[i + 1].level
          : 0;
      let j = i + 1;
      while (
        j < items.length &&
        items[j].level >= childLevel &&
        items[j].level > item.level
      ) {
        j++;
      }
      const childrenItems = items.slice(i + 1, j);
      const children =
        childrenItems.length > 0
          ? build(childrenItems, childLevel, depth + 1)
          : [];
      nodes.push({
        item,
        depth,
        hasChildren: children.length > 0,
        expanded: children.length > 0 && !collapsed.has(item.id),
        children,
      });
      i = j;
    }
    return nodes;
  };

  return build(headings, Math.min(...headings.map((h) => h.level)), 0);
}

/**
 * Render the outline tree; rows up to the active one are "consumed"
 * (their rail segment is tinted), forming a vertical page-progress bar.
 *
 * Children render inside a 0fr/1fr grid wrapper whose height animates,
 * so collapsing folds the lower rows upward smoothly.
 */
function renderOutline(
  headings: HeadingItem[],
  collapsed: Set<string>,
  activeId: string | null,
  onNavigate: (item: HeadingItem) => void,
  onToggle: (item: HeadingItem) => void,
): React.ReactNode {
  const tree = buildOutlineTree(headings, collapsed);
  // Document-order index per heading: drives the "consumed" progress tint.
  const orderIndex = new Map(headings.map((h, i) => [h.id, i]));
  const activeIdx = activeId != null ? (orderIndex.get(activeId) ?? -1) : -1;

  const renderNodes = (nodes: OutlineNode[]): React.ReactNode[] =>
    nodes.map((node) => {
      const idx = orderIndex.get(node.item.id) ?? -1;
      return (
        <div key={node.item.id}>
          <OutlineRow
            row={node}
            active={idx === activeIdx}
            consumed={activeIdx >= 0 && idx <= activeIdx}
            onClick={() => onNavigate(node.item)}
            onToggleClick={() => onToggle(node.item)}
          />
          {node.hasChildren && (
            <div
              aria-hidden={!node.expanded}
              className="grid transition-[grid-template-rows] ease-out"
              style={{
                gridTemplateRows: node.expanded ? '1fr' : '0fr',
                transitionDuration: `${FOLD_DURATION_MS}ms`,
              }}
            >
              {/* -ml-2 pl-2 pushes the clip edge 8px left of the rows so the
                  active row's rail cursor (left-[-7px], straddling the rail)
                  isn't clipped by overflow-hidden; vertical clipping is what
                  folds the rows and stays untouched. */}
              <div className="min-h-0 overflow-hidden -ml-2 pl-2">
                {renderNodes(node.children)}
              </div>
            </div>
          )}
        </div>
      );
    });

  return renderNodes(tree);
}

function OutlineRow({
  row,
  active,
  consumed,
  onClick,
  onToggleClick,
}: {
  row: OutlineNode;
  active: boolean;
  consumed: boolean;
  onClick: () => void;
  onToggleClick: () => void;
}) {
  const { t } = useI18n();
  const { item, depth, hasChildren, expanded } = row;
  const isTop = depth === 0;
  return (
    <div
      onClick={onClick}
      title={item.text}
      className={`group relative flex items-center gap-1 pr-1 py-[6px] cursor-pointer text-[13px] leading-5 border-l transition-colors duration-150 ${
        consumed
          ? 'border-[color-mix(in_srgb,var(--vscode-focusBorder)_45%,transparent)]'
          : 'border-[var(--vscode-sideBar-border)]'
      }`}
      style={{ paddingLeft: ROW_BASE_INDENT + depth * ROW_DEPTH_INDENT }}
    >
      {/* "->" cursor straddling the rail at the current heading, pointing
          at the outline item; the editor scrollbar carries a mirrored
          "<-" cursor (EditorScrollCursor). The bg patch masks the rail
          underneath so the arrow reads as embedded. */}
      {active && (
        <span className="absolute left-[-7px] top-1/2 -translate-y-1/2 py-[3px] bg-[var(--vscode-editor-background)] text-[var(--vscode-focusBorder)]">
          <ArrowRight className="w-3 h-3" strokeWidth={2.5} />
        </span>
      )}
      <span
        className={`flex-1 truncate transition-colors duration-150 ${
          active
            ? 'text-[var(--vscode-focusBorder)] font-medium'
            : isTop
              ? 'font-medium text-[var(--vscode-sideBar-foreground)] group-hover:text-[var(--vscode-foreground)]'
              : 'text-[var(--vscode-descriptionForeground)] group-hover:text-[var(--vscode-foreground)]'
        }`}
      >
        {item.text}
      </span>
      {hasChildren && (
        <span
          onClick={(e) => {
            // Chevron is the sole expand/collapse control — clicking it
            // must not also trigger the row's jump-to-heading navigation.
            e.stopPropagation();
            onToggleClick();
          }}
          title={expanded ? t('outline.collapse') : t('outline.expand')}
          className="shrink-0 -m-1 p-1 cursor-pointer text-[var(--vscode-descriptionForeground)] opacity-60 hover:opacity-100"
        >
          <ChevronRight
            className={`w-3.5 h-3.5 transition-transform duration-150 ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        </span>
      )}
    </div>
  );
}
