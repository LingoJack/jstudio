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

  // Apply external updates — only if this element isn't inside the focused surface
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The closest contentEditable ancestor is the editor surface.
    // If the surface has focus, don't touch children.
    const surface = el.closest('[data-editor-surface]');
    if (surface && document.activeElement === surface) return;
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
