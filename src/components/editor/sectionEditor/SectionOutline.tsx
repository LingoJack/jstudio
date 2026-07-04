/**
 * SectionOutline — heading navigation for the sectioned editor.
 *
 * Unlike DocumentOutline (which reads headings from a single editor's
 * ProseMirror doc), this reads headings directly from the store's block array,
 * so it is independent of how the document is split into section editors.
 *
 * Jump-to-heading works across sections because every section renders into the
 * SAME scroll container, and heading blocks carry a `data-block-id` attribute
 * (via BlockIdExtension). We locate the heading's DOM element by that id and
 * scroll it into view — no need to know which section it lives in.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useStore } from '../../../store/useStore';
import { useI18n } from '../../../lib/core/i18n';
import { contentToString } from '../../../lib/editor/content/blockContent';
import { NavBranch, NavRow } from '../../ui/NavTree';
import type { Block } from '../../../types';

interface HeadingItem {
  id: string; // block id
  level: number;
  text: string;
}

function extractHeadings(blocks: Block[]): HeadingItem[] {
  const items: HeadingItem[] = [];
  for (const b of blocks) {
    if (b.type === 'heading-1' || b.type === 'heading-2' || b.type === 'heading-3') {
      const text = contentToString(b.content).trim();
      if (text) {
        const level = b.type === 'heading-1' ? 1 : b.type === 'heading-2' ? 2 : 3;
        items.push({ id: b.id, level, text });
      }
    }
  }
  return items;
}

interface SectionOutlineProps {
  /** The scroll container that wraps all sections (for jump-to-heading). */
  scrollContainerRef: React.RefObject<HTMLElement | null>;
}

export default function SectionOutline({ scrollContainerRef }: SectionOutlineProps) {
  const { t } = useI18n();
  // Subscribe to blocks so the outline updates as headings change. This is a
  // light read (heading extraction) and only the outline panel re-renders.
  const blocks = useStore((s) => s.activeDoc?.blocks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const headings = useMemo(() => extractHeadings(blocks ?? []), [blocks]);

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
      if (!container) return;
      // All sections render into the same container; find the heading by its
      // block id regardless of which section editor owns it.
      const el = container.querySelector(
        `[data-block-id="${CSS.escape(item.id)}"]`,
      ) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        container.scrollTop += rect.top - containerRect.top - 12;
        // Place the caret in the heading so editing continues from there.
        const editable = el.closest('.ProseMirror') as HTMLElement | null;
        editable?.focus();
      }
      setActiveId(item.id);
    },
    [scrollContainerRef],
  );

  const toggle = useCallback((item: HeadingItem) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  return (
    <div className="w-[240px] shrink-0 h-full border-l border-[var(--vscode-sideBar-border)] bg-[var(--vscode-sideBar-background)] flex flex-col select-none">
      <div className="px-5 mb-5 shrink-0">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
          {t('outline.title')}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
        {headings.length === 0 ? (
          <p className="text-xs text-[var(--vscode-descriptionForeground)] px-2 py-2">
            {t('outline.empty')}
          </p>
        ) : (
          renderTree(headings, 1, activeId, handleClick, collapsed, toggle)
        )}
      </div>
    </div>
  );
}

// Mirror of DocumentOutline's tree renderer (kept local to avoid coupling).
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

      if (hasChildren && !isCollapsed) {
        const childMin = Math.min(...children.map((c) => c.level));
        result.push(
          <NavBranch key={`branch-${item.id}`} className="mt-0.5 mb-1 ml-[18px]">
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
