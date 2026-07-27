import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { SlashMenuRenderHandle, SlashMenuRenderProps } from './types';
import { useI18n, type TranslationKey } from '../../core/i18n';

// Mapping from command title (English) to i18n keys
const SLASH_I18N_KEYS: Record<string, { title: TranslationKey; description: TranslationKey }> = {
  'Heading 1': { title: 'slash.heading1', description: 'slash.heading1Desc' },
  'Heading 2': { title: 'slash.heading2', description: 'slash.heading2Desc' },
  'Heading 3': { title: 'slash.heading3', description: 'slash.heading3Desc' },
  'Heading 4': { title: 'slash.heading4', description: 'slash.heading4Desc' },
  'Heading 5': { title: 'slash.heading5', description: 'slash.heading5Desc' },
  'Heading 6': { title: 'slash.heading6', description: 'slash.heading6Desc' },
  'Bullet List': { title: 'slash.bulletList', description: 'slash.bulletListDesc' },
  'Numbered List': { title: 'slash.numberedList', description: 'slash.numberedListDesc' },
  'To-do List': { title: 'slash.todoList', description: 'slash.todoListDesc' },
  'Quote': { title: 'slash.quote', description: 'slash.quoteDesc' },
  'Code Block': { title: 'slash.codeBlock', description: 'slash.codeBlockDesc' },
  'Image': { title: 'slash.image', description: 'slash.imageDesc' },
  'File': { title: 'slash.file', description: 'slash.fileDesc' },
  'Link': { title: 'slash.link', description: 'slash.linkDesc' },
  'Table': { title: 'slash.table', description: 'slash.tableDesc' },
  'Divider': { title: 'slash.divider', description: 'slash.dividerDesc' },
  'Diagram': { title: 'slash.diagram', description: 'slash.diagramDesc' },
  'Collapsible': { title: 'slash.collapsible', description: 'slash.collapsibleDesc' },
  'Formula': { title: 'slash.formula', description: 'slash.formulaDesc' },
};

/**
 * The React component that renders the slash-menu popup list.
 *
 * It is rendered into a detached DOM node managed by tippy.js. Imperative
 * keyboard navigation is handled via a ref handle (`onKeyDown`).
 */
export const SlashMenuList = forwardRef<SlashMenuRenderHandle, SlashMenuRenderProps>(
  function SlashMenuList({ items, selectedIndex, onSelectItem }, ref) {
    const { t } = useI18n();
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
        className="slash-menu-panel"
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
              <span className="text-[0.875rem] font-medium">
                {SLASH_I18N_KEYS[item.title] ? t(SLASH_I18N_KEYS[item.title].title) : item.title}
              </span>
              <span className="text-[0.75rem] text-[var(--vscode-descriptionForeground)]">
                {SLASH_I18N_KEYS[item.title]
                  ? t(SLASH_I18N_KEYS[item.title].description)
                  : item.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  },
);
