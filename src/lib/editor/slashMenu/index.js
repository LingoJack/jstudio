import { Extension } from "@tiptap/core";
import { Suggestion } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { filterSlashCommands } from "./commands";
import { createSlashMenuRenderer } from "./renderer";
import { slashCommands } from "./commands";
import { filterSlashCommands as filterSlashCommands2 } from "./commands";
import { SlashMenuList } from "./SlashMenuList";
const slashMenuPluginKey = new PluginKey("slashMenu");
function getSlashMenuSuggestion() {
  return {
    pluginKey: slashMenuPluginKey,
    char: "/",
    startOfLine: false,
    allowSpaces: false,
    allowedPrefixes: [" "],
    items: ({ query }) => filterSlashCommands(query),
    render: createSlashMenuRenderer(),
    // Don't trigger the slash menu inside heading nodes — headings are a
    // terminal block type and offering block-type conversion there is
    // counter-intuitive.
    allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name !== "heading",
    command: ({ editor, range, props }) => {
      props.command({ editor, range });
    }
  };
}
const SlashMenuExtension = Extension.create({
  name: "slashMenu",
  addProseMirrorPlugins() {
    const suggestionOptions = getSlashMenuSuggestion();
    return [
      Suggestion({
        ...suggestionOptions,
        editor: this.editor
      })
    ];
  }
});
export {
  SlashMenuExtension,
  SlashMenuList,
  filterSlashCommands2 as filterSlashCommands,
  getSlashMenuSuggestion,
  slashCommands,
  slashMenuPluginKey
};
