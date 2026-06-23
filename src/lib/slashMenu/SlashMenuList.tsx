import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { SlashMenuRenderHandle, SlashMenuRenderProps } from './types';

/**
 * The React component that renders the slash-menu popup list.
 *
 * It is rendered into a detached DOM node managed by tippy.js. Imperative
 * keyboard navigation is handled via a ref handle (`onKeyDown`).
 */
export const SlashMenuList = forwardRef<SlashMenuRenderHandle, SlashMenuRenderProps>(
  function SlashMenuList({ items, selectedIndex, onSelectItem }, ref) {
    const [activeIndex, setActiveIndex] = useState(
      Math.min(selectedIndex, Math.max(items.length - 1, 0)),
    );

    // Keep local active index in sync when the parent reports a new selection
    // (e.g. via arrow-key handling done outside the component).
    useEffect(() => {
      setActiveIndex((prev) => {
        if (items.length === 0) return 0;
        return Math.min(prev, items.length - 1);
      });
    }, [items.length]);

    const selectIndex = useCallback(
      (index: number) => {
        const clamped = Math.max(0, Math.min(index, items.length - 1));
        const item = items[clamped];
        if (item) onSelectItem(clamped);
      },
      [items, onSelectItem],
    );

    // --- Scroll active item into view on navigation ---
    // Manually scroll the menu container only (NOT scrollIntoView, which
    // would also scroll outer editor containers and cause the tippy popup
    // to jump/reposition).
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const container = containerRef.current;
      const el = itemRefs.current[activeIndex];
      if (!container || !el) return;

      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();

      if (elRect.top < containerRect.top) {
        // Item is above visible area — scroll up
        container.scrollTop -= containerRect.top - elRect.top;
      } else if (elRect.bottom > containerRect.bottom) {
        // Item is below visible area — scroll down
        container.scrollTop += elRect.bottom - containerRect.bottom;
      }
    }, [activeIndex]);

    // --- Stable refs for imperative keyboard handling ---
    // We keep the latest values in refs so that `useImperativeHandle` can
    // have a stable (empty-dep) identity.  This guarantees the parent
    // (Suggestion plugin) always calls the up-to-date handler, avoiding
    // stale closures where arrow-key navigation silently breaks.
    const itemsLenRef = useRef(items.length);
    const activeIndexRef = useRef(activeIndex);
    const selectIndexRef = useRef(selectIndex);

    itemsLenRef.current = items.length;
    activeIndexRef.current = activeIndex;
    selectIndexRef.current = selectIndex;

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
          const len = itemsLenRef.current;
          if (event.key === 'ArrowUp') {
            if (len === 0) return true;
            setActiveIndex((prev) => (prev <= 0 ? len - 1 : prev - 1));
            return true;
          }
          if (event.key === 'ArrowDown') {
            if (len === 0) return true;
            setActiveIndex((prev) => (prev >= len - 1 ? 0 : prev + 1));
            return true;
          }
          if (event.key === 'Enter') {
            selectIndexRef.current(activeIndexRef.current);
            return true;
          }
          return false;
        },
      }),
      [], // stable — never recreated
    );

    if (items.length === 0) {
      return null;
    }

    return (
      <div
        ref={containerRef}
        className="min-w-[220px] max-h-[280px] overflow-y-auto rounded-lg border border-[var(--vscode-widget-border)] bg-[var(--vscode-editorWidget-background)] p-1 shadow-lg"
        role="listbox"
        aria-label="Slash commands"
      >
        {items.map((item, index) => (
          <button
            key={item.title}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={`flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left font-inherit cursor-pointer border-none ${
              index === activeIndex
                ? 'bg-[var(--vscode-list-hoverBackground)]'
                : 'bg-transparent'
            } text-[var(--vscode-editor-foreground)]`}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => selectIndex(index)}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[var(--vscode-button-secondaryBackground)] text-[0.75rem] font-semibold text-[var(--vscode-descriptionForeground)]">
              {item.icon}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[0.875rem] font-medium">{item.title}</span>
              <span className="text-[0.75rem] text-[var(--vscode-descriptionForeground)]">
                {item.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  },
);
