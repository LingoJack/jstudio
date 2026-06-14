import { useEffect, useRef } from 'react';

export interface BlockLineProps {
  /** HTML content. Only applied on mount or external programmatic change. */
  html: string;
  placeholder?: string;
  className?: string;
  tagName?: 'div' | 'h1' | 'h2' | 'h3';
  /** Ref forwarded to the DOM element */
  domRef?: React.RefObject<HTMLElement | null>;
}

/**
 * A single editable line inside the unified contentEditable surface.
 *
 * Unlike the old EditableText, this is NOT its own contentEditable.
 * The parent container owns one contentEditable for the entire document.
 * This component just renders a styled <div>/<h1>/<h2> that participates
 * in that surface, plus a CSS placeholder.
 *
 * External content updates only happen when the element is NOT focused
 * (checked by testing if document.activeElement is inside the editor surface).
 */
export default function BlockLine({
  html,
  placeholder,
  className,
  tagName = 'div',
  domRef,
}: BlockLineProps) {
  const localRef = useRef<HTMLElement>(null);
  const ref = domRef ?? localRef;

  // Set initial content on mount
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply external updates — only if this element isn't inside the focused surface.
  // BUT: if the html prop has changed while the surface IS focused, it means a
  // programmatic update (e.g. block merge) was applied and we must force the DOM
  // to match. We use a ref to track the last-synced value.
  const lastHtmlRef = useRef(html);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const htmlChanged = html !== lastHtmlRef.current;
    lastHtmlRef.current = html;

    // If the html prop hasn't changed, there's nothing to do.
    if (!htmlChanged) return;

    // The closest contentEditable ancestor is the editor surface.
    const surface = el.closest('[data-editor-surface]');
    const surfaceFocused = surface && document.activeElement === surface;

    // When the surface has focus and the caret is inside THIS block, skip the
    // update — the user is actively editing it and a DOM reset would move the caret.
    // SAFETY: wrap selection access in try-catch. WebKit throws
    // "NotFoundError: The object can not be found here." when the selection
    // references a node that was just removed by React (e.g. during block
    // type conversion). This useEffect runs in the layout phase, so the
    // old DOM may already be gone.
    let caretInside = false;
    if (surfaceFocused) {
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          let node: Node | null = sel.anchorNode;
          while (node && node !== surface) {
            if (node === el) { caretInside = true; break; }
            node = node.parentNode;
          }
        }
      } catch {
        // Selection references a detached node — treat as "not inside".
      }
    }

    if (surfaceFocused && caretInside) return;

    if (el.innerHTML !== html) {
      el.innerHTML = html;
    }
  }, [html, ref]);

  const Tag = tagName as React.ElementType;

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      data-block-line="true"
      data-placeholder={placeholder}
      className={`block-line ${className ?? ''}`}
    />
  );
}
