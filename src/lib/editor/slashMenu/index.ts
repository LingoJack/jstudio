import { Extension } from '@tiptap/core';
import { Suggestion, type SuggestionOptions } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';

import { filterSlashCommands } from './commands';
import { createSlashMenuRenderer } from './renderer';
import type { SlashCommandItem } from './types';

// Re-export public API for external consumers.
export type { SlashCommandItem, SlashMenuRenderProps, SlashMenuRenderHandle } from './types';
export { slashCommands } from './commands';
export { filterSlashCommands } from './commands';
export { SlashMenuList } from './SlashMenuList';

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
 * import { SlashMenuExtension } from './lib/slashMenu';
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
