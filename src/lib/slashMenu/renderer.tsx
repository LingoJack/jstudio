import type { Range } from '@tiptap/core';
import type { SuggestionProps } from '@tiptap/suggestion';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { createRoot, type Root } from 'react-dom/client';

import { SlashMenuList } from './SlashMenuList';
import type { SlashCommandItem, SlashMenuRenderHandle } from './types';

/**
 * Factory that returns the `render` object expected by TipTap's Suggestion
 * plugin. It creates a tippy.js popup and mounts the React `SlashMenuList`
 * component inside it.
 */
export function createSlashMenuRenderer<TItem extends SlashCommandItem>() {
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
