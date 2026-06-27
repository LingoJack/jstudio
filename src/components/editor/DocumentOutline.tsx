/**
 * DocumentOutline — right-side heading navigation panel.
 *
 * Shows a live outline of H1/H2/H3 headings extracted from the TipTap editor.
 * Features:
 *   - Click a heading to scroll it into view
 *   - Scroll-spy highlights the heading closest to the viewport top
 *   - Updates automatically when the document content changes (debounced)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { useI18n } from '../../lib/i18n';
import { NavBranch, NavRow } from '../ui/NavTree';

interface HeadingItem {
  id: string;
  level: number;
  text: string;
  /** ProseMirror document position of this heading node */
  pos: number;
}

interface DocumentOutlineProps {
  editor: Editor;
}

export default function DocumentOutline({ editor }: DocumentOutlineProps) {
  const { t } = useI18n();
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsedHeadings, setCollapsedHeadings] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // ------------------------------------------------------------------
  // Extract headings from the ProseMirror document
  // ------------------------------------------------------------------
  const extractHeadings = useCallback(() => {
    const doc = editor.state.doc;
    const items: HeadingItem[] = [];
    let index = 0;

    doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const level = node.attrs.level as number;
        if (level >= 1 && level <= 3) {
          // Extract plain text from the heading node
          const text = node.textContent.trim();
          if (text) {
            items.push({
              id: `heading-${pos}`,
              level,
              text,
              pos,
            });
            index++;
          }
        }
      }
      return true;
    });

    setHeadings(items);

    // Set initial active heading if none is active yet
    if (items.length > 0) {
      setActiveId((prev) => (prev && items.some((h) => h.id === prev) ? prev : items[0].id));
    } else {
      setActiveId(null);
    }
  }, [editor]);

  // ------------------------------------------------------------------
  // Re-extract headings when editor content changes (debounced)
  // ------------------------------------------------------------------
  useEffect(() => {
    extractHeadings();

    // In static/read-only mode the content is loaded asynchronously via
    // setContent() in a parent useEffect.  The first extractHeadings() call
    // above may run before the content is available.  Re-run after a short
    // delay to catch the loaded content.
    const fallback = setTimeout(extractHeadings, 100);

    const onUpdate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        extractHeadings();
      }, 300);
    };

    // Listen to both 'update' and 'transaction' for maximum reliability.
    // In TipTap v3, 'transaction' fires on every state change including
    // setContent(), while 'update' may not always fire in read-only mode.
    editor.on('update', onUpdate);
    editor.on('transaction', onUpdate);
    return () => {
      editor.off('update', onUpdate);
      editor.off('transaction', onUpdate);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearTimeout(fallback);
    };
  }, [editor, extractHeadings]);

  // ------------------------------------------------------------------
  // Scroll spy: track which heading is closest to the viewport top
  // ------------------------------------------------------------------
  useEffect(() => {
    const editorDom = editor.view.dom;
    const scrollContainer = editorDom.closest('.overflow-y-auto') as HTMLElement | null;
    if (!scrollContainer) return;

    // Find the actual heading DOM elements
    const headingEls = editorDom.querySelectorAll('h1, h2, h3');
    if (headingEls.length === 0) return;

    // Map DOM elements to heading items by order
    const domHeadings: { el: HTMLElement; id: string }[] = [];
    let headingIdx = 0;
    headingEls.forEach((el) => {
      if (headingIdx < headings.length) {
        domHeadings.push({
          el: el as HTMLElement,
          id: headings[headingIdx].id,
        });
        headingIdx++;
      }
    });

    if (domHeadings.length === 0) return;

    // Use IntersectionObserver to detect the top-most visible heading
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry with the smallest top that is intersecting
        let topMostId: string | null = null;

        // Also check all heading positions for a fallback
        let bestTop = Infinity;
        domHeadings.forEach(({ el, id }) => {
          const rect = el.getBoundingClientRect();
          const containerRect = scrollContainer.getBoundingClientRect();
          const relativeTop = rect.top - containerRect.top;

          // Consider headings that are at or below the top margin (within first 120px)
          if (relativeTop >= -10 && relativeTop < 200) {
            if (relativeTop < bestTop) {
              bestTop = relativeTop;
              topMostId = id;
            }
          }
        });

        // Fallback: if no heading in the "visible" zone, find the last heading above viewport top
        if (!topMostId) {
          let lastAboveTop = -Infinity;
          domHeadings.forEach(({ el, id }) => {
            const rect = el.getBoundingClientRect();
            const containerRect = scrollContainer.getBoundingClientRect();
            const relativeTop = rect.top - containerRect.top;
            if (relativeTop < 0) {
              if (relativeTop > lastAboveTop) {
                lastAboveTop = relativeTop;
                topMostId = id;
              }
            }
          });
        }

        if (topMostId) {
          setActiveId(topMostId);
        }

        // Use entries to avoid unused variable lint
        void entries;
      },
      {
        root: scrollContainer,
        threshold: [0, 0.5, 1],
        rootMargin: '0px 0px -60% 0px',
      },
    );

    domHeadings.forEach(({ el }) => observer.observe(el));
    observerRef.current = observer;

    // Also update on scroll for better precision
    const onScroll = () => {
      let topMostId: string | null = null;
      let bestTop = Infinity;
      domHeadings.forEach(({ el, id }) => {
        const rect = el.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;
        if (relativeTop >= -10 && relativeTop < 200) {
          if (relativeTop < bestTop) {
            bestTop = relativeTop;
            topMostId = id;
          }
        }
      });
      if (!topMostId) {
        let lastAboveTop = -Infinity;
        domHeadings.forEach(({ el, id }) => {
          const rect = el.getBoundingClientRect();
          const containerRect = scrollContainer.getBoundingClientRect();
          const relativeTop = rect.top - containerRect.top;
          if (relativeTop < 0) {
            if (relativeTop > lastAboveTop) {
              lastAboveTop = relativeTop;
              topMostId = id;
            }
          }
        });
      }
      if (topMostId) setActiveId(topMostId);
    };

    scrollContainer.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      scrollContainer.removeEventListener('scroll', onScroll);
      observerRef.current = null;
    };
  }, [editor, headings]);

  // ------------------------------------------------------------------
  // Click heading → scroll into view
  // ------------------------------------------------------------------
  const handleHeadingClick = useCallback(
    (item: HeadingItem) => {
      // Use ProseMirror position to scroll the heading into view
      editor
        .chain()
        .focus()
        // Set selection to the start of the heading node
        .setTextSelection(item.pos + 1)
        .run();

      // Manually scroll the heading into view within the scroll container
      const editorDom = editor.view.dom;
      const scrollContainer = editorDom.closest('.overflow-y-auto') as HTMLElement | null;
      if (!scrollContainer) return;

      // Find the DOM element for this heading by matching text content + level
      const headingEls = editorDom.querySelectorAll(`h${item.level}`);
      for (const el of headingEls) {
        if (el.textContent?.trim() === item.text) {
          const rect = el.getBoundingClientRect();
          const containerRect = scrollContainer.getBoundingClientRect();
          scrollContainer.scrollTop += rect.top - containerRect.top - 12;
          break;
        }
      }

      setActiveId(item.id);
    },
    [editor],
  );

  // ------------------------------------------------------------------
  // Toggle heading collapse/expand
  // ------------------------------------------------------------------
  const toggleHeading = useCallback((item: HeadingItem) => {
    setCollapsedHeadings((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  return (
    <div className="w-[240px] shrink-0 h-full border-l border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)] flex flex-col select-none">
      {/* Header — aligned with Settings/DocumentList */}
      <div className="px-5 mb-5 shrink-0">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
          {t('outline.title')}
        </h2>
      </div>

      {/* Outline items */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
        {headings.length === 0 ? (
          <p className="text-xs text-[var(--vscode-descriptionForeground)] px-2 py-2">
            {t('outline.empty')}
          </p>
        ) : (
          renderOutlineTree(headings, 1, activeId, handleHeadingClick, collapsedHeadings, toggleHeading)
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Tree rendering — mirrors the Settings/DocumentList NavTree pattern
// ──────────────────────────────────────────────────────────────────

/**
 * Recursively render outline headings as a collapsible tree.
 *
 * Top-level headings (depth 0) use primary styling (rounded-md, 14px,
 * like Settings section headers). Nested headings (depth 1+) use
 * secondary styling (-ml-px border-l-2, 13px, like Settings sub-items).
 *
 * Every heading that has children is expandable.
 */
function renderOutlineTree(
  headings: HeadingItem[],
  headingLevel: number,
  activeId: string | null,
  onClick: (item: HeadingItem) => void,
  collapsed: Set<string>,
  onToggle: (item: HeadingItem) => void,
  depth: number = 0,
): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  const isTopLevel = depth === 0;
  let i = 0;

  while (i < headings.length) {
    const item = headings[i];

    if (item.level === headingLevel) {
      // Collect consecutive deeper-level headings as children
      const childLevel =
        i + 1 < headings.length && headings[i + 1].level > item.level
          ? headings[i + 1].level
          : 0;
      const children: HeadingItem[] = [];
      if (childLevel > 0) {
        let j = i + 1;
        while (j < headings.length && headings[j].level >= childLevel && headings[j].level > item.level) {
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
          plainActive={isTopLevel}
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

      // Render children inside a NavBranch unless collapsed
      if (hasChildren && !isCollapsed) {
        const childMin = Math.min(...children.map((c) => c.level));
        result.push(
          <NavBranch key={`branch-${item.id}`} className="mt-0.5 mb-1 ml-[18px]">
            {renderOutlineTree(children, childMin, activeId, onClick, collapsed, onToggle, depth + 1)}
          </NavBranch>,
        );
      }

      // Skip past this heading and all its children
      i += 1 + children.length;
    } else if (item.level > headingLevel) {
      i++;
    } else {
      i++;
    }
  }

  return result;
}
