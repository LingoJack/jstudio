import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';

export interface ContentEditableBlockProps {
  html: string;
  onChange: (html: string, text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void;
  placeholder?: string;
  className?: string;
  tagName?: 'div' | 'h1' | 'h2' | 'h3';
}

/**
 * A reusable contentEditable wrapper that syncs its innerHTML with React state.
 *
 * The caret handling for inline format elements (CODE, B, A, etc.) is done by
 * the parent via the shared keyboard hook. This component is intentionally
 * "dumb" — it only renders and reports changes.
 */
const ContentEditableBlock = forwardRef<
  HTMLDivElement,
  ContentEditableBlockProps
>(function ContentEditableBlock(
  { html, onChange, onKeyDown, onBlur, placeholder, className, tagName = 'div' },
  ref,
) {
  const localRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => localRef.current!);

  useEffect(() => {
    if (localRef.current && localRef.current.innerHTML !== html) {
      localRef.current.innerHTML = html;
    }
  }, [html]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    onChange(e.currentTarget.innerHTML, e.currentTarget.innerText);
  };

  const isEditorContentEmpty = (value: string) => {
    const normalized = value
      .replace(/<br\s*\/?>(\s*)/gi, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .trim();
    return normalized.length === 0;
  };

  const shouldShowPlaceholder = isEditorContentEmpty(html);
  const Tag = tagName as React.ElementType;

  return (
    <Tag
      ref={localRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      className={`outline-none break-words whitespace-pre-wrap before:pointer-events-none ${
        shouldShowPlaceholder
          ? 'before:content-[attr(data-placeholder)] before:text-[var(--vscode-descriptionForeground)] before:opacity-60'
          : ''
      } ${className}`}
      data-placeholder={placeholder}
      data-block-editable="true"
    />
  );
});

export default ContentEditableBlock;
