const heading2Command = {
  title: "Heading 2",
  description: "Medium section heading",
  icon: "H2",
  aliases: ["heading2", "h2"],
  command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run()
};
export {
  heading2Command
};
