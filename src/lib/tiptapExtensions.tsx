/**
 * TipTap extensions and Slash Menu configuration.
 *
 * This module provides:
 *  - A Slash Menu built on TipTap's Suggestion API. Typing `/` at the start
 *    of an empty line (or after a space) opens a command palette.
 *  - A React render component for the popup list.
 *
 * Supported commands:
 *   /heading  (or /h1) → heading level 1
 *   /heading2 (or /h2) → heading level 2
 *   /heading3 (or /h3) → heading level 3
 *   /bullet   (or /ul)  → bullet list
 *   /numbered (or /ol)  → numbered list
 *   /quote   (or /引用) → block quote
 *   /code              → code block
 *   /image             → image
 *   /file              → file attachment
 *   /table             → editable table
 *   /divider           → horizontal rule
 *   /collapse          → collapsible block
 */

import { Extension } from '@tiptap/core';
import { Suggestion, type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { Editor, Range } from '@tiptap/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single slash-menu command item. */
export interface SlashCommandItem {
  /** Display title in the menu. */
  title: string;
  /** Short description shown beneath the title. */
  description: string;
  /** Emoji or short icon character. */
  icon: string;
  /** Aliases used for filtering (lowercased, without the leading `/`). */
  aliases: string[];
  /** The command that mutates the editor when this item is selected. */
  command: (props: { editor: Editor; range: Range }) => void;
}

/** Props passed to the React popup component. */
interface SlashMenuRenderProps {
  items: SlashCommandItem[];
  selectedIndex: number;
  onSelectItem: (index: number) => void;
}

/** Handle exposed to the suggestion renderer for imperative control. */
export interface SlashMenuRenderHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

// ---------------------------------------------------------------------------
// Command definitions
// ---------------------------------------------------------------------------

/**
 * The full list of slash commands. Filtering by query happens at render time
 * in the `items` callback passed to Suggestion.
 */
export const slashCommands: SlashCommandItem[] = [
  {
    title: 'Heading 1',
    description: 'Big section heading',
    icon: 'H1',
    aliases: ['heading', 'h1', 'heading1'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    aliases: ['heading2', 'h2'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    aliases: ['heading3', 'h3'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Bullet List',
    description: 'Create a simple bulleted list',
    icon: '• —',
    aliases: ['bullet', 'ul', 'unordered', 'unorder', 'list', '无序'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered List',
    description: 'Create a list with numbering',
    icon: '1.',
    aliases: ['numbered', 'ordered', 'ol', 'number', '有序'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'Quote',
    description: 'Capture a quote',
    icon: '❝',
    aliases: ['quote', 'blockquote', '引用'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Code Block',
    description: 'Display formatted code',
    icon: '<>',
    aliases: ['code', 'codeblock', 'snippet'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('codeBlock').run(),
  },
  {
    title: 'Image',
    description: 'Insert image placeholder',
    icon: 'IMG',
    aliases: ['image', 'img', 'picture', 'photo'],
    command: ({ editor, range }) => {
      // Insert an empty image node (placeholder). The user clicks the
      // placeholder afterwards to pick a file.
      editor.chain().focus().deleteRange(range).setImage({ src: '' }).run();
    },
  },
  {
    title: 'File',
    description: 'Upload a file attachment',
    icon: 'FILE',
    aliases: ['file', 'attachment', 'upload', 'doc', 'pdf', 'document'],
    command: ({ editor, range }) => {
      // Insert an empty fileBlock node (placeholder). The user clicks the
      // placeholder afterwards to pick a file.
      editor.chain().focus().deleteRange(range).setFile().run();
    },
  },
  {
    title: 'Link',
    description: 'Embed a web link with preview',
    icon: 'LINK',
    aliases: ['link', 'url', 'bookmark', 'web', '链接', '网页'],
    command: ({ editor, range }) => {
      // Insert an empty linkBlock node (placeholder). The user pastes a URL
      // in the placeholder input to fetch metadata.
      editor.chain().focus().deleteRange(range).setLink().run();
    },
  },
  {
    title: 'Table',
    description: 'Insert an editable table',
    icon: '⊞',
    aliases: ['table', 'grid', '矩阵'],
    command: ({ editor, range }) => {
      // Show a Notion-style grid picker so the user can choose dimensions.
      import('../components/TableSizeSelector').then(({ mountTableSizeSelector }) => {
        mountTableSizeSelector(editor, range);
      });
    },
  },
  {
    title: 'Divider',
    description: 'Visual separator between blocks',
    icon: '—',
    aliases: ['divider', 'separator', 'horizontal', 'hr', '分割线', '分隔线'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'Collapsible',
    description: '可折叠/展开的内容区域',
    icon: '▼',
    aliases: ['collapsible', 'collapse', 'toggle', 'fold', '折叠', '收起', '展开'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setCollapsible().run(),
  },
];

/**
 * Filter the command list by the current query string.
 *
 * Matching is case-insensitive against title and aliases.
 */
export function filterSlashCommands(query: string): SlashCommandItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return slashCommands;

  return slashCommands.filter((item) => {
    if (item.title.toLowerCase().includes(q)) return true;
    return item.aliases.some((alias) => alias.toLowerCase().includes(q));
  });
}

// ---------------------------------------------------------------------------
// React popup component
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Suggestion render() implementation (bridges Suggestion ↔ React via tippy)
// ---------------------------------------------------------------------------

/**
 * Factory that returns the `render` object expected by TipTap's Suggestion
 * plugin. It creates a tippy.js popup and mounts the React `SlashMenuList`
 * component inside it.
 */
function createSlashMenuRenderer<TItem extends SlashCommandItem>() {
  return (): {
    onStart: (props: SuggestionProps<TItem>) => void;
    onUpdate: (props: SuggestionProps<TItem>) => void;
    onKeyDown: (props: { event: KeyboardEvent; view: unknown; range: Range }) => boolean;
    onExit: () => void;
  } => {
    let componentRef: SlashMenuRenderHandle | null = null;
    let popup: TippyInstance | null = null;
    let reactRoot: Root | null = null;

    /** Mount (or update) the React list inside the tippy popup. */
    const renderList = (
      props: SuggestionProps<TItem>,
      onSelectIndex: (index: number) => void,
    ) => {
      if (!reactRoot) return;
      reactRoot.render(
        <SlashMenuList
          ref={(node) => {
            componentRef = node;
          }}
          items={props.items}
          selectedIndex={0}
          onSelectItem={onSelectIndex}
        />,
      );
    };

    return {
      onStart: (props) => {
        const popupEl = document.createElement('div');
        reactRoot = createRoot(popupEl);

        const onSelectIndex = (index: number) => {
          const item = props.items[index];
          if (item) props.command(item);
        };

        renderList(props, onSelectIndex);

        popup = tippy(document.body, {
          getReferenceClientRect: () => {
            const rect = props.clientRect?.();
            return rect ?? new DOMRect(0, 0, 0, 0);
          },
          appendTo: () => document.body,
          content: popupEl,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        });

        // Keep a local copy of items for keyboard nav fallback.
      },

      onUpdate: (props) => {
        const onSelectIndex = (index: number) => {
          const item = props.items[index];
          if (item) props.command(item);
        };
        renderList(props, onSelectIndex);

        if (popup) {
          const rect = props.clientRect?.();
          if (rect) {
            popup.setProps({
              getReferenceClientRect: () => rect,
            });
          }
        }
      },

      onKeyDown: (props) => {
        if (props.event.key === 'Escape') {
          popup?.hide();
          return true;
        }
        return componentRef?.onKeyDown({ event: props.event }) ?? false;
      },

      onExit: () => {
        if (popup) {
          popup.destroy();
        }
        popup = null;
        if (reactRoot) {
          reactRoot.unmount();
        }
        reactRoot = null;
        componentRef = null;
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Public: the Slash Menu TipTap extension
// ---------------------------------------------------------------------------

/** Dedicated plugin key so the suggestion plugin can be identified. */
export const slashMenuPluginKey = new PluginKey('slashMenu');

/**
 * Build the Suggestion options for the slash menu. Exposed so callers can
 * customize before creating the extension if needed.
 */
export function getSlashMenuSuggestion(): Omit<SuggestionOptions<SlashCommandItem>, 'editor'> {
  return {
    pluginKey: slashMenuPluginKey,
    char: '/',
    startOfLine: false,
    allowSpaces: false,
    allowedPrefixes: [' '],
    items: ({ query }) => filterSlashCommands(query),
    render: createSlashMenuRenderer<SlashCommandItem>(),
    // Don't trigger the slash menu inside heading nodes — headings are a
    // terminal block type and offering block-type conversion there is
    // counter-intuitive.
    allow: ({ state, range }) =>
      state.doc.resolve(range.from).parent.type.name !== 'heading',
    command: ({ editor, range, props }) => {
      props.command({ editor, range });
    },
  };
}

/**
 * The Slash Menu TipTap extension. Add this to the editor's `extensions`
 * array to enable `/`-triggered commands.
 *
 * @example
 * ```ts
 * import { SlashMenuExtension } from './lib/tiptapExtensions';
 *
 * const editor = useEditor({
 *   extensions: [StarterKit, SlashMenuExtension],
 * });
 * ```
 */
export const SlashMenuExtension = Extension.create({
  name: 'slashMenu',

  addProseMirrorPlugins() {
    const suggestionOptions = getSlashMenuSuggestion();
    return [
      Suggestion<SlashCommandItem, SlashCommandItem>({
        ...suggestionOptions,
        editor: this.editor,
      }),
    ];
  },
});

// Re-export commonly used bits for convenience.
export type { SuggestionProps };
