const heading3Command = {
  title: "Heading 3",
  description: "Small section heading",
  icon: "H3",
  aliases: ["heading3", "h3"],
  command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run()
};
export {
  heading3Command
};
