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
import { Bold, Italic, Strikethrough, Code, ChevronDown, Check } from 'lucide-react';
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

/** Heading levels exposed by the dropdown (matches StarterKit defaults). */
const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/**
 * A focusable toolbar entry. When the selection sits inside a heading, an
 * extra `heading` entry is prepended so it participates in the roving-focus
 * Tab cycle alongside the mark toggles.
 */
type HeadingItem = { kind: 'heading' };
type MarkItem = { kind: 'mark'; name: string; labelKey: TranslationKey; Icon: typeof Bold };
type FocusItem = HeadingItem | MarkItem;

const MARK_ITEMS: MarkItem[] = [
  { kind: 'mark', name: 'bold', labelKey: 'bubble.bold', Icon: Bold },
  { kind: 'mark', name: 'italic', labelKey: 'bubble.italic', Icon: Italic },
  { kind: 'mark', name: 'strike', labelKey: 'bubble.strike', Icon: Strikethrough },
  { kind: 'mark', name: 'code', labelKey: 'bubble.code', Icon: Code },
];

export default function FormatBubbleMenu({ editor }: FormatBubbleMenuProps) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuVisible, setMenuVisible] = useState(false);
  const [headingOpen, setHeadingOpen] = useState(false);
  const [headingSelIndex, setHeadingSelIndex] = useState(0);

  // Whether the current selection sits inside a heading (and which level).
  const isHeading = editor.isActive('heading');
  const currentLevel = editor.getAttributes('heading').level as number | undefined;

  // Build the focusable item list: the heading trigger is prepended only when
  // the selection is inside a heading, so it joins the roving-focus cycle.
  const items: FocusItem[] = isHeading
    ? [{ kind: 'heading' }, ...MARK_ITEMS]
    : MARK_ITEMS;

  // Keep live refs so the capture-phase keydown listener (registered once)
  // always sees the latest values without re-subscribing.
  const activeIndexRef = useRef(activeIndex);
  const itemsRef = useRef(items);
  const headingOpenRef = useRef(headingOpen);
  const headingSelRef = useRef(headingSelIndex);
  const currentLevelRef = useRef(currentLevel);
  activeIndexRef.current = activeIndex;
  itemsRef.current = items;
  headingOpenRef.current = headingOpen;
  headingSelRef.current = headingSelIndex;
  currentLevelRef.current = currentLevel;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset roving focus + close the dropdown whenever the selection moves in
  // or out of a heading (the item list length changes, so a stale index could
  // point at the wrong control).
  useEffect(() => {
    setActiveIndex(-1);
    setHeadingOpen(false);
  }, [isHeading]);

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

  // Apply a heading-level dropdown option by index. Options are ordered as
  // H1..H6 followed by a single "Paragraph" entry that converts to a normal
  // text block. `close` controls whether the dropdown dismisses afterwards:
  // mouse clicks keep it open (hover/pointer-leave dismisses it) while the
  // keyboard Enter path closes it.
  const applyHeadingOption = useCallback(
    (index: number, close = true) => {
      if (index >= 0 && index < HEADING_LEVELS.length) {
        editor.chain().setNode('heading', { level: HEADING_LEVELS[index] }).run();
      } else {
        editor.chain().setParagraph().run();
      }
      if (close) setHeadingOpen(false);
    },
    [editor],
  );

  // Open the heading dropdown, pre-selecting the current level.
  const openHeadingDropdown = useCallback(() => {
    const lvl = currentLevelRef.current;
    setHeadingSelIndex(
      typeof lvl === 'number' && lvl >= 1 && lvl <= HEADING_LEVELS.length ? lvl - 1 : 0,
    );
    setHeadingOpen(true);
  }, []);

  // Hover handling: open on pointer enter, dismiss on pointer leave with a
  // short delay that bridges the gap between the trigger and the popover so
  // moving the pointer into the menu doesn't accidentally close it.
  const openHeadingOnHover = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    openHeadingDropdown();
  }, [openHeadingDropdown]);

  const scheduleHeadingClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setHeadingOpen(false);
      closeTimerRef.current = null;
    }, 150);
  }, []);

  // Clear any pending close timer on unmount.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

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
      const isArrowDown = key === 'ArrowDown';
      const isArrowUp = key === 'ArrowUp';

      // ── Heading dropdown open: drive its own list navigation ──
      // The popover lives outside the editor DOM subtree, so its own keydowns
      // never reach this capture listener; these keys come from the editor
      // (which retains DOM focus) while the dropdown is visually open.
      if (headingOpenRef.current) {
        if (!isTab && !isEnter && !isSpace && !isEscape && !isArrowDown && !isArrowUp) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();

        const optionCount = HEADING_LEVELS.length + 1; // +1 for "Paragraph"
        const sel = headingSelRef.current;

        if (isEscape) {
          setHeadingOpen(false);
          return;
        }
        if (isTab) {
          const next = e.shiftKey
            ? sel <= 0
              ? optionCount - 1
              : sel - 1
            : sel >= optionCount - 1
              ? 0
              : sel + 1;
          setHeadingSelIndex(next);
          return;
        }
        if (isArrowDown) {
          setHeadingSelIndex(sel >= optionCount - 1 ? 0 : sel + 1);
          return;
        }
        if (isArrowUp) {
          setHeadingSelIndex(sel <= 0 ? optionCount - 1 : sel - 1);
          return;
        }
        // Enter / Space - apply the highlighted option
        applyHeadingOption(sel);
        return;
      }

      if (!isTab && !isEnter && !isSpace && !isEscape) {
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

      const items = itemsRef.current;
      const itemCount = items.length;
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
          const item = items[current];
          if (item.kind === 'heading') {
            openHeadingDropdown();
          } else {
            toggleMark(item.name);
          }
        }
      }
    };

    editorDom.addEventListener('keydown', handleCaptureKeyDown, true);

    return () => {
      editorDom.removeEventListener('keydown', handleCaptureKeyDown, true);
    };
  }, [menuVisible, editor, toggleMark, applyHeadingOption, openHeadingDropdown]);

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
    setHeadingOpen(false);
  }, []);

  // Close the heading dropdown when clicking outside of its trigger/popover
  // (e.g. clicking another toolbar control or elsewhere on the page).
  useEffect(() => {
    if (!headingOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      // Let the trigger handle its own toggle; only close for outside clicks.
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setHeadingOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [headingOpen]);

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
      className="editor-toolbar bubble-menu"
    >
      <div className="flex items-center gap-0.5">
        {isHeading && (
          <div
            className="relative flex items-center"
            onMouseEnter={openHeadingOnHover}
            onMouseLeave={scheduleHeadingClose}
          >
            <button
              ref={triggerRef}
              type="button"
              title={t('bubble.headingLevel')}
              aria-label={t('bubble.headingLevel')}
              aria-expanded={headingOpen}
              onMouseDown={(e) => {
                // Prevent the editor from losing selection when clicking the button.
                // The dropdown opens on hover; clicking the trigger is a no-op.
                e.preventDefault();
              }}
              style={{ width: 'auto' }}
              className={`editor-toolbar-btn bubble-menu-btn gap-0.5 px-1 ${
                headingOpen ? 'is-active' : ''
              } ${0 === activeIndex ? 'is-focused' : ''}`}
            >
              <span className="text-[11px] font-semibold leading-none">
                {typeof currentLevel === 'number' ? `H${currentLevel}` : 'H'}
              </span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {headingOpen && (
              <div
                ref={popoverRef}
                className="editor-toolbar-menu absolute left-0 top-full z-[101] mt-1 min-w-[120px] py-1"
              >
                {HEADING_LEVELS.map((level, i) => (
                  <button
                    key={level}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyHeadingOption(i, false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[0.78rem] transition-colors hover:bg-[var(--vscode-list-hoverBackground)] ${
                      i === headingSelIndex ? 'bg-[var(--vscode-list-hoverBackground)]' : ''
                    } ${
                      level === currentLevel
                        ? 'text-[var(--vscode-textLink-foreground)]'
                        : 'text-[var(--vscode-editor-foreground)]'
                    }`}
                  >
                    <span>H{level}</span>
                    {level === currentLevel && <Check className="w-3 h-3" />}
                  </button>
                ))}
                <div className="my-1 h-px bg-[var(--vscode-menu-border)]" />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyHeadingOption(HEADING_LEVELS.length, false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[0.78rem] transition-colors hover:bg-[var(--vscode-list-hoverBackground)] ${
                    HEADING_LEVELS.length === headingSelIndex
                      ? 'bg-[var(--vscode-list-hoverBackground)]'
                      : ''
                  } text-[var(--vscode-editor-foreground)]`}
                >
                  <span>{t('bubble.paragraph')}</span>
                </button>
              </div>
            )}
            <div className="mx-1 h-5 w-px bg-[var(--vscode-menu-border)]" />
          </div>
        )}
        {MARK_ITEMS.map((item, idx) => {
          const index = (isHeading ? 1 : 0) + idx;
          const isActive = editor.isActive(item.name);
          const isFocused = index === activeIndex;
          const label = t(item.labelKey);

          return (
            <button
              key={item.name}
              type="button"
              title={label}
              aria-label={label}
              onMouseDown={(e) => {
                // Prevent the editor from losing selection when clicking the button
                e.preventDefault();
                setHeadingOpen(false);
                toggleMark(item.name);
              }}
              className={`editor-toolbar-btn bubble-menu-btn ${isActive ? 'is-active' : ''} ${
                isFocused ? 'is-focused' : ''
              }`}
            >
              <item.Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}
      </div>
    </BubbleMenu>
  );
}
