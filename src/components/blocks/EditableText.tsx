import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';

export interface EditableTextProps {
  html: string;
  onChange: (html: string, text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void;
  placeholder?: string;
  className?: string;
  tagName?: 'div' | 'h1' | 'h2' | 'h3';
}

/**
 * Unified contentEditable component for all text-like blocks.
 *
 * Replaces the old mix of <textarea>, <input>, and contentEditable divs.
 * contentEditable gives us native text selection, copy, cut, and paste —
 * no custom caret tracking needed.
 *
 * This component is intentionally "dumb": it syncs innerHTML from props
 * and reports user input via onChange. All keyboard logic lives in
 * the parent's useBlockEditor hook.
 */
const EditableText = forwardRef<
  HTMLDivElement,
  EditableTextProps
>(function EditableText(
  { html, onChange, onKeyDown, onPaste, onBlur, placeholder, className, tagName = 'div' },
  ref,
) {
  const localRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => localRef.current!);

  // Only set innerHTML when the external value differs from what's already
  // rendered — this prevents caret jumps during normal typing.
  useEffect(() => {
    if (localRef.current && localRef.current.innerHTML !== html) {
      localRef.current.innerHTML = html;
    }
  }, [html]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    onChange(el.innerHTML, el.innerText);
  };

  // CSS placeholder via ::before pseudo-element on empty content
  const isEmpty = (function () {
    const normalized = html
      .replace(/<br\s*\/?>(\s*)/gi, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .trim();
    return normalized.length === 0;
  })();

  const Tag = tagName as React.ElementType;

  return (
    <Tag
      ref={localRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onBlur={onBlur}
      className={`outline-none break-words whitespace-pre-wrap before:pointer-events-none ${
        isEmpty
          ? 'before:content-[attr(data-placeholder)] before:text-[var(--vscode-descriptionForeground)] before:opacity-60'
          : ''
      } ${className}`}
      data-placeholder={placeholder}
      data-block-editable="true"
    />
  );
});

export default EditableText;
