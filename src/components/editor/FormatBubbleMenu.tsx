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
 * Positioning: the toolbar follows the **cursor head** (selection.head)
 * rather than the center of the selection bounding box, so it stays glued
 * to where the user is actively selecting.
 *
 * Edge handling: floating-ui `flip` (flips to the opposite side when
 * there's no room above/below) and `shift` (slides along the axis to stay
 * within the viewport) with 8px padding keep the toolbar fully visible at
 * screen edges.
 *
 * The marks themselves are provided by StarterKit (Bold, Italic, Strike,
 * Code extensions). This component only renders the BubbleMenu UI.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { NodeSelection } from '@tiptap/pm/state';
import { Bold, Italic, Strikethrough, Code } from 'lucide-react';
import { useI18n } from '../../lib/core/i18n';
import type { TranslationKey } from '../../lib/core/i18n';

/**
 * Minimal VirtualElement-compatible type (mirrors @floating-ui/dom).
 * We inline it to avoid adding @floating-ui/dom as a direct dependency.
 */
interface VirtualRect {
  width: number;
  height: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  x: number;
  y: number;
  toJSON: () => Record<string, number>;
}
interface VirtualElementLike {
  getBoundingClientRect: () => VirtualRect;
  getClientRects: () => VirtualRect[];
}

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
      // Don't call .focus() here — it triggers scrollIntoView and
      // delayed focus restoration (requestAnimationFrame) which
      // interacts badly with taskItem's contentEditable=false checkbox
      // NodeView, causing the cursor to jump to the end of the document.
      // The editor already has focus when the BubbleMenu is visible.
      editor.chain().toggleMark(markName).run();
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
      // Never intercept during IME composition — preventDefault() would
      // cancel the composition and lose the character.
      if (e.isComposing || e.keyCode === 229) return;

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

  // ------------------------------------------------------------------
  //  Resolve the actual scroll container so the toolbar repositions
  //  when the editor content scrolls (the default scrollTarget is
  //  `window`, but our editor scrolls inside a div.overflow-y-auto).
  // ------------------------------------------------------------------
  const [scrollTarget, setScrollTarget] = useState<HTMLElement | Window>(window);
  useEffect(() => {
    const scrollEl = editor.view.dom.closest('.overflow-y-auto') as HTMLElement | null;
    if (scrollEl) setScrollTarget(scrollEl);
  }, [editor]);

  // ------------------------------------------------------------------
  //  Attach the menu element to <body> instead of the editor's parent.
  //
  //  Why: by default BubbleMenu appends its DOM element to
  //  `view.dom.parentElement`, which sits *inside* the editor's
  //  `overflow-y-auto` scroll container.  This causes two problems in
  //  Tauri's WKWebView:
  //
  //    1. There is a one-frame gap between `show()` (sets
  //       visibility:visible + appendChild at default position) and the
  //       async `computePosition()` call — the menu briefly appears at
  //       its previous/default coordinate, which can be far from the
  //       selection (e.g. over the sidebar).
  //
  //    2. Ancestors with `overflow: auto/hidden` create a containing
  //       block that can interfere with `position: fixed` coordinates
  //       in WKWebView, making the menu drift to wrong regions.
  //
  //  Appending to <body> escapes both issues entirely.
  // ------------------------------------------------------------------
  const appendTo = useCallback(() => document.body, []);

  // ------------------------------------------------------------------
  //  Stable callbacks — memoised so the BubbleMenu plugin doesn't
  //  receive new function references on every React re-render (which
  //  would trigger unnecessary option-update transactions).
  // ------------------------------------------------------------------

  // Pure visibility check — NO setState calls here.  The onShow / onHide
  // callbacks in `options` handle React state updates on actual show/hide
  // transitions, which is both cleaner and avoids re-render storms.
  const shouldShow = useCallback(({ state }: { state: typeof editor.state }) => {
    const { empty, from, to } = state.selection;
    if (empty || from === to) return false;

    // Don't show the text-formatting toolbar when a whole block node is
    // selected (e.g. clicking on an image / file / linkBlock atom node).
    if (state.selection instanceof NodeSelection) return false;

    // Walk every node covered by the selection.  If the range includes
    // any non-text block node (image / file / link-block / code-block),
    // suppress the menu.  Text inside paragraphs, headings, and table
    // cells is fine.
    const blockedTypes = new Set(['image', 'fileBlock', 'codeBlock', 'linkBlock']);
    let hasNonText = false;
    state.doc.nodesBetween(from, to, (node) => {
      if (blockedTypes.has(node.type.name)) {
        hasNonText = true;
        return false;
      }
      return true;
    });
    return !hasNonText;
  }, []);

  // Build the virtual element for floating-ui positioning.
  //
  // KEY FIX: pass the correct `side` argument to coordsAtPos based on
  // selection direction.  ProseMirror's coordsAtPos(pos, side) defaults
  // to side = -1 (character *before* pos).  For a backward selection
  // (head === from) the default returns the character *outside* the
  // selection, which at a line-start boundary lands on the previous
  // visual line — causing the toolbar to appear on the wrong line.
  const getReferencedVirtualElement = useCallback(():
    | VirtualElementLike
    | null => {
    const { selection } = editor.state;

    // side =  1  →  rect of the character *after* pos  (use when head is
    //               the left/start edge, i.e. backward selection)
    // side = -1  →  rect of the character *before* pos (use when head is
    //               the right/end edge, i.e. forward selection)
    const headSide = selection.head === selection.from ? 1 : -1;
    const headCoords = editor.view.coordsAtPos(selection.head, headSide);

    // Create a zero-width rect at the cursor head so floating-ui
    // positions the toolbar directly above (or below, via flip) the
    // character the user is currently at.
    const rect = {
      width: 0,
      height: 0,
      top: headCoords.top,
      bottom: headCoords.bottom,
      left: headCoords.left,
      right: headCoords.left,
      x: headCoords.left,
      y: headCoords.top,
      toJSON() {
        return {
          width: 0,
          height: 0,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          x: rect.x,
          y: rect.y,
        };
      },
    };

    return {
      getBoundingClientRect: () => rect,
      getClientRects: () => [rect],
    };
  }, [editor]);

  // onShow / onHide are called by the plugin only on actual visibility
  // transitions (hidden→visible, visible→hidden), so React state is
  // updated exactly when needed — not on every selection-change tick.
  const handleShow = useCallback(() => setMenuVisible(true), []);
  const handleHide = useCallback(() => {
    setMenuVisible(false);
    setActiveIndex(-1);
  }, []);

  // Memoise the options object so it only changes when scrollTarget
  // changes, preventing unnecessary plugin re-updates.
  const options = useMemo(
    () => ({
      placement: 'top' as const,
      strategy: 'fixed' as const,
      offset: 8,
      flip: {
        mainAxis: true,
        crossAxis: false,
      },
      shift: {
        padding: 8,
      },
      scrollTarget,
      onShow: handleShow,
      onHide: handleHide,
    }),
    [scrollTarget, handleShow, handleHide],
  );

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={shouldShow}
      getReferencedVirtualElement={getReferencedVirtualElement}
      options={options}
      appendTo={appendTo}
      // Wait for the DOM (and any scrollIntoView animation) to settle
      // before repositioning the toolbar. Without this, coordsAtPos
      // may read stale coordinates mid-scroll, causing the toolbar to
      // appear at the wrong position — especially inside task lists
      // where mark toggles trigger a ProseMirror view update.
      updateDelay={100}
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
