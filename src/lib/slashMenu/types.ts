import type { Editor, Range } from '@tiptap/core';

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
export interface SlashMenuRenderProps {
  items: SlashCommandItem[];
  selectedIndex: number;
  onSelectItem: (index: number) => void;
}

/** Handle exposed to the suggestion renderer for imperative control. */
export interface SlashMenuRenderHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}
