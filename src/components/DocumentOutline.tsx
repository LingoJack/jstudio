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
import { ListTree } from 'lucide-react';
import { useI18n } from '../lib/i18n';

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

    const onUpdate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        extractHeadings();
      }, 300);
    };

    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
      if (debounceRef.current) clearTimeout(debounceRef.current);
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
        let topMost: { id: string; top: number } | null = null;

        // Also check all heading positions for a fallback
        domHeadings.forEach(({ el, id }) => {
          const rect = el.getBoundingClientRect();
          const containerRect = scrollContainer.getBoundingClientRect();
          const relativeTop = rect.top - containerRect.top;

          // Consider headings that are at or below the top margin (within first 120px)
          if (relativeTop >= -10 && relativeTop < 200) {
            if (!topMost || relativeTop < topMost.top) {
              topMost = { id, top: relativeTop };
            }
          }
        });

        // Fallback: if no heading in the "visible" zone, find the last heading above viewport top
        if (!topMost) {
          let lastAbove: { id: string; top: number } | null = null;
          domHeadings.forEach(({ el, id }) => {
            const rect = el.getBoundingClientRect();
            const containerRect = scrollContainer.getBoundingClientRect();
            const relativeTop = rect.top - containerRect.top;
            if (relativeTop < 0) {
              if (!lastAbove || relativeTop > lastAbove.top) {
                lastAbove = { id, top: relativeTop };
              }
            }
          });
          if (lastAbove) {
            topMost = lastAbove;
          }
        }

        if (topMost) {
          setActiveId(topMost.id);
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
      let topMost: { id: string; top: number } | null = null;
      domHeadings.forEach(({ el, id }) => {
        const rect = el.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;
        if (relativeTop >= -10 && relativeTop < 200) {
          if (!topMost || relativeTop < topMost.top) {
            topMost = { id, top: relativeTop };
          }
        }
      });
      if (!topMost) {
        let lastAbove: { id: string; top: number } | null = null;
        domHeadings.forEach(({ el, id }) => {
          const rect = el.getBoundingClientRect();
          const containerRect = scrollContainer.getBoundingClientRect();
          const relativeTop = rect.top - containerRect.top;
          if (relativeTop < 0) {
            if (!lastAbove || relativeTop > lastAbove.top) {
              lastAbove = { id, top: relativeTop };
            }
          }
        });
        if (lastAbove) topMost = lastAbove;
      }
      if (topMost) setActiveId(topMost.id);
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
        if (el.textContent.trim() === item.text) {
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

  return (
    <div className="w-[240px] shrink-0 h-full border-l border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)] flex flex-col select-none">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-3 shrink-0">
        <ListTree className="w-4 h-4 text-[var(--vscode-descriptionForeground)]" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
          {t('outline.title')}
        </h4>
      </div>

      {/* Outline items */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-3 space-y-0.5">
        {headings.length === 0 ? (
          <p className="text-xs text-[var(--vscode-descriptionForeground)] px-2 py-2">
            {t('outline.empty')}
          </p>
        ) : (
          headings.map((item) => (
            <div
              key={item.id}
              onClick={() => handleHeadingClick(item)}
              className={`cursor-pointer rounded-md py-1.5 pr-2 text-sm leading-snug transition-colors duration-150 truncate ${
                activeId === item.id
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-foreground)] font-medium'
                  : 'text-[var(--vscode-sideBar-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
              style={{
                paddingLeft: `${8 + (item.level - 1) * 14}px`,
              }}
              title={item.text}
            >
              {item.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
