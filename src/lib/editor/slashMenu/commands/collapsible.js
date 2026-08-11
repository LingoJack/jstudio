const collapsibleCommand = {
  title: "Collapsible",
  description: "A foldable / expandable content region",
  icon: "\u25BC",
  aliases: ["collapsible", "collapse", "toggle", "fold", "\u6298\u53E0", "\u6536\u8D77", "\u5C55\u5F00"],
  command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCollapsible().run()
};
export {
  collapsibleCommand
};
