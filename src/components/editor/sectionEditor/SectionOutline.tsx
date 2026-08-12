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
import { NavBranch, NavRow } from '../../ui/NavTree';
import type { Block } from '../../../types';
import { Pin, ListTree } from 'lucide-react';

/** Width of the outline panel when fully expanded. */
const OUTLINE_WIDTH = 240;
/** Width of the collapsed strip (unpinned, not hovered). */
const COLLAPSED_WIDTH = 48;
/** Delay (ms) before collapsing after the pointer leaves the panel. */
const COLLAPSE_DELAY = 180;

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
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  // ── Pin / hover-expand state ──
  const outlinePinned = useStore((s) => s.outlinePinned);
  const toggleOutlinePinned = useStore((s) => s.toggleOutlinePinned);
  const toggleOutline = useStore((s) => s.toggleOutline);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const hoverCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleCollapse = useCallback(() => {
    if (hoverCollapseTimer.current) clearTimeout(hoverCollapseTimer.current);
    hoverCollapseTimer.current = setTimeout(() => {
      setHoverExpanded(false);
    }, COLLAPSE_DELAY);
  }, []);

  const handleHoverEnter = useCallback(() => {
    if (outlinePinned) return;
    if (hoverCollapseTimer.current) {
      clearTimeout(hoverCollapseTimer.current);
      hoverCollapseTimer.current = null;
    }
    setHoverExpanded(true);
  }, [outlinePinned]);

  const handleHoverLeave = useCallback(() => {
    if (outlinePinned) return;
    scheduleCollapse();
  }, [outlinePinned, scheduleCollapse]);

  const handleTogglePin = useCallback(() => {
    toggleOutlinePinned();
    setHoverExpanded(false);
  }, [toggleOutlinePinned]);

  // Cleanup hover timer on unmount.
  useEffect(() => {
    return () => {
      if (hoverCollapseTimer.current) clearTimeout(hoverCollapseTimer.current);
    };
  }, []);

  const isCollapsed = !outlinePinned && !hoverExpanded;
  const effectiveWidth = isCollapsed ? COLLAPSED_WIDTH : OUTLINE_WIDTH;
  const isOverlay = !outlinePinned && !isCollapsed;
  const overlayShift = isOverlay ? effectiveWidth - COLLAPSED_WIDTH : 0;

  return (
    <div
      data-outline-root
      className="shrink-0 h-full border-l border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)] flex flex-col select-none z-30 relative overflow-hidden"
      style={{
        width: effectiveWidth,
        marginLeft: -overlayShift,
        transition:
          'width 180ms ease-out, margin-left 180ms ease-out, box-shadow 180ms ease-out',
        boxShadow: isOverlay
          ? '-4px 0 12px rgba(0,0,0,0.3)'
          : '-4px 0 12px rgba(0,0,0,0)',
      }}
      onMouseEnter={handleHoverEnter}
      onMouseLeave={handleHoverLeave}
    >
      {isCollapsed ? (
        <div className="h-9 shrink-0 flex items-center justify-center">
          <button
            onClick={handleTogglePin}
            className="p-1.5 rounded-md text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer"
            title={t('outline.pin')}
          >
            <Pin className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="h-9 shrink-0 flex items-center px-3 gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)] flex-1">
              {t('outline.title')}
            </h2>
            <button
              onClick={handleTogglePin}
              className={`p-1 rounded-md transition-colors duration-150 cursor-pointer ${
                outlinePinned
                  ? 'text-[var(--vscode-foreground)] bg-[var(--vscode-list-activeSelectionBackground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                  : 'text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
              title={outlinePinned ? t('outline.unpin') : t('outline.pin')}
            >
              <Pin className="w-4 h-4" />
            </button>
            <button
              onClick={toggleOutline}
              className="p-1 rounded-md text-[var(--vscode-icon-foreground)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors duration-150 cursor-pointer"
              title={t('outline.hide')}
            >
              <ListTree className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto rounded-md px-3 pb-3 space-y-0.5">
            {headings.length === 0 ? (
              <p className="text-xs text-[var(--vscode-descriptionForeground)] px-2 py-2">
                {t('outline.empty')}
              </p>
            ) : (
              renderTree(headings, 1, activeId, handleClick, collapsed, toggle)
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Renders the heading tree (kept local to avoid coupling).
function renderTree(
  headings: HeadingItem[],
  level: number,
  activeId: string | null,
  onClick: (item: HeadingItem) => void,
  collapsed: Set<string>,
  onToggle: (item: HeadingItem) => void,
  depth = 0,
): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  const isTopLevel = depth === 0;
  let i = 0;

  while (i < headings.length) {
    const item = headings[i];
    if (item.level === level) {
      const childLevel =
        i + 1 < headings.length && headings[i + 1].level > item.level
          ? headings[i + 1].level
          : 0;
      const children: HeadingItem[] = [];
      if (childLevel > 0) {
        let j = i + 1;
        while (
          j < headings.length &&
          headings[j].level >= childLevel &&
          headings[j].level > item.level
        ) {
          children.push(headings[j]);
          j++;
        }
      }
      const hasChildren = children.length > 0;
      const isCollapsed = collapsed.has(item.id);

      result.push(
        <NavRow
          key={item.id}
          level={isTopLevel ? 'primary' : 'secondary'}
          active={item.id === activeId}
          noHover
          expandable={hasChildren}
          expanded={!isCollapsed}
          onClick={() => {
            if (hasChildren) onToggle(item);
            onClick(item);
          }}
          title={item.text}
        >
          {item.text}
        </NavRow>,
      );

      if (hasChildren && !isCollapsed) {
        const childMin = Math.min(...children.map((c) => c.level));
        result.push(
          <NavBranch key={`branch-${item.id}`} plain className="mt-0.5 mb-1 ml-[18px]">
            {renderTree(children, childMin, activeId, onClick, collapsed, onToggle, depth + 1)}
          </NavBranch>,
        );
      }
      i += 1 + children.length;
    } else {
      i++;
    }
  }
  return result;
}
