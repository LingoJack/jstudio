/**
 * FormatBubbleMenu — selection-triggered formatting toolbar.
 *
 * Shows a small floating toolbar above the current text selection with
 * toggles for Bold, Italic, Strike, and inline Code.
 *
 * Keyboard navigation:
 *   Tab          → focus next item (wraps around)
 *   Shift+Tab    → focus previous item (wraps around)
 *   Enter / Space → toggle the focused item
 *   Escape       → close the menu (defer to editor)
 *
 * ArrowLeft / ArrowRight are intentionally NOT intercepted: they keep their
 * native behavior of moving the text cursor inside the selection.
 *
 * The marks themselves are provided by StarterKit (Bold, Italic, Strike,
 * Code extensions). This component only renders the BubbleMenu UI.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Italic, Strikethrough, Code } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import type { TranslationKey } from '../lib/i18n';

interface FormatBubbleMenuProps {
  editor: Editor;
}

interface FormatItem {
  name: string;
  labelKey: TranslationKey;
  Icon: typeof Bold;
}

const ITEMS: FormatItem[] = [
  { name: 'bold', labelKey: 'bubble.bold', Icon: Bold },
  { name: 'italic', labelKey: 'bubble.italic', Icon: Italic },
  { name: 'strike', labelKey: 'bubble.strike', Icon: Strikethrough },
  { name: 'code', labelKey: 'bubble.code', Icon: Code },
];

export default function FormatBubbleMenu({ editor }: FormatBubbleMenuProps) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuVisible, setMenuVisible] = useState(false);

  // Keep a live ref to activeIndex so the capture-phase keydown listener
  // (registered once) always sees the latest value.
  const activeIndexRef = useRef(activeIndex);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const toggleMark = useCallback(
    (markName: string) => {
      editor.chain().focus().toggleMark(markName).run();
    },
    [editor],
  );

  // ------------------------------------------------------------------
  //  Capture-phase keyboard interception on the editor DOM element.
  //
  //  When the BubbleMenu is visible, we intercept Tab/Shift+Tab/Enter/
  //  Space/Tab at the *capture* phase — before ProseMirror sees them
  //  — so we can drive the toolbar's roving focus instead of letting the
  //  browser tab away or the editor insert a node.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!menuVisible) return;

    const editorDom = editor.view.dom;

    const handleCaptureKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const isTab = key === 'Tab';
      const isEnter = key === 'Enter';
      const isSpace = key === ' ';
      const isEscape = key === 'Escape';

      if (
        !isTab &&
        !isEnter &&
        !isSpace &&
        !isEscape
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Escape — clear selection to dismiss the BubbleMenu
      if (isEscape) {
        const { from } = editor.state.selection;
        editor.chain().setTextSelection(from).focus().run();
        return;
      }

      const itemCount = ITEMS.length;
      const current = activeIndexRef.current;

      if (isTab && !e.shiftKey) {
        // Tab — forward, wrap around; start at first item if nothing focused
        const next = current >= itemCount - 1 ? 0 : current + 1;
        setActiveIndex(next);
      } else if (isTab && e.shiftKey) {
        // Shift+Tab — backward, wrap around
        const next = current <= 0 ? itemCount - 1 : current - 1;
        setActiveIndex(next);
      } else if (isEnter || isSpace) {
        // Enter / Space — toggle the focused item (if any)
        if (current >= 0 && current < itemCount) {
          toggleMark(ITEMS[current].name);
        }
      }
    };

    editorDom.addEventListener('keydown', handleCaptureKeyDown, true);

    return () => {
      editorDom.removeEventListener('keydown', handleCaptureKeyDown, true);
    };
  }, [menuVisible, editor, toggleMark]);

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ state }) => {
        const { empty, from, to } = state.selection;
        const nonEmpty = !empty && from !== to;
        if (!nonEmpty) {
          setMenuVisible(false);
          return false;
        }

        // Walk every node covered by the selection.  If the range includes
        // any non-text block node (image / file / code-block), suppress the
        // menu.  Text inside paragraphs, headings, and table cells is fine.
        const blockedTypes = new Set(['image', 'fileBlock', 'codeBlock']);
        let hasNonText = false;

        state.doc.nodesBetween(from, to, (node) => {
          if (blockedTypes.has(node.type.name)) {
            hasNonText = true;
            return false;
          }
          return true;
        });

        const shouldShow = !hasNonText;

        // Sync visibility state + reset navigation when hiding
        setMenuVisible(shouldShow);
        if (!shouldShow) {
          setActiveIndex(-1);
        }

        return shouldShow;
      }}
      className="bubble-menu"
    >
      <div className="flex items-center gap-0.5">
        {ITEMS.map(({ name, labelKey, Icon }, index) => {
          const isActive = editor.isActive(name);
          const isFocused = index === activeIndex;
          const label = t(labelKey);

          return (
            <button
              key={name}
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
