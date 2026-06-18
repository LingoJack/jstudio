/**
 * FormatBubbleMenu — selection-triggered formatting toolbar.
 *
 * Shows a small floating toolbar above the current text selection with
 * toggles for Bold, Italic, Strike, and inline Code.
 *
 * Keyboard navigation:
 *   Tab / ArrowRight  → focus next item (wraps around)
 *   Shift+Tab / ArrowLeft → focus previous item (wraps around)
 *   Enter / Space     → toggle the focused item
 *   Escape            → close the menu (defer to editor)
 *
 * The marks themselves are provided by StarterKit (Bold, Italic, Strike,
 * Code extensions). This component only renders the BubbleMenu UI.
 */

import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import { type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Italic, Strikethrough, Code } from 'lucide-react';

interface FormatBubbleMenuProps {
  editor: Editor;
}

interface FormatItem {
  name: string;
  label: string;
  Icon: typeof Bold;
}

const ITEMS: FormatItem[] = [
  { name: 'bold', label: '加粗', Icon: Bold },
  { name: 'italic', label: '斜体', Icon: Italic },
  { name: 'strike', label: '删除线', Icon: Strikethrough },
  { name: 'code', label: '行内代码', Icon: Code },
];

export default function FormatBubbleMenu({ editor }: FormatBubbleMenuProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const toggleMark = useCallback(
    (markName: string) => {
      editor.chain().focus().toggleMark(markName).run();
    },
    [editor],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const itemCount = ITEMS.length;

      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          // Shift+Tab — go backward, wrap around
          setActiveIndex((prev) => (prev <= 0 ? itemCount - 1 : prev - 1));
        } else {
          // Tab — go forward, wrap around
          setActiveIndex((prev) =>
            prev >= itemCount - 1 ? 0 : prev === -1 ? 0 : prev + 1,
          );
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev >= itemCount - 1 ? 0 : prev === -1 ? 0 : prev + 1,
        );
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveIndex((prev) => (prev <= 0 ? itemCount - 1 : prev - 1));
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        if (activeIndex >= 0 && activeIndex < itemCount) {
          toggleMark(ITEMS[activeIndex].name);
        }
        return;
      }
    },
    [activeIndex, toggleMark],
  );

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ state }) => {
        const { empty, from, to } = state.selection;
        if (empty || from === to) return false;

        // Walk every node covered by the selection.  If the range includes
        // any non-text block node (image / file / code-block), suppress the
        // menu.  Text inside paragraphs, headings, and table cells is fine.
        const blockedTypes = new Set(['image', 'fileBlock', 'codeBlock']);
        let hasNonText = false;

        state.doc.nodesBetween(from, to, (node) => {
          if (blockedTypes.has(node.type.name)) {
            hasNonText = true;
            return false; // stop traversing this branch
          }
          return true; // keep descending into children
        });

        const shouldShow = !hasNonText;

        // Reset keyboard navigation when the menu is about to be hidden
        if (!shouldShow && activeIndex !== -1) {
          setActiveIndex(-1);
        }

        return shouldShow;
      }}
      className="bubble-menu"
    >
      <div onKeyDown={handleKeyDown} className="flex items-center gap-0.5">
        {ITEMS.map(({ name, label, Icon }, index) => {
          const isActive = editor.isActive(name);
          const isFocused = index === activeIndex;

          return (
            <button
              key={name}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              title={label}
              aria-label={label}
              onMouseDown={(e) => {
                // Prevent the editor from losing selection when clicking the button
                e.preventDefault();
                toggleMark(name);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(-1)}
              tabIndex={isFocused ? 0 : -1}
              className={`bubble-menu-btn ${isActive ? 'is-active' : ''} ${
                isFocused ? 'is-focused' : ''
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}
      </div>
    </BubbleMenu>
  );
}
