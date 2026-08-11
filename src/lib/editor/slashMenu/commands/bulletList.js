const bulletListCommand = {
  title: "Bullet List",
  description: "Create a simple bulleted list",
  icon: "\u2022 \u2014",
  aliases: ["bullet", "ul", "unordered", "unorder", "list", "\u65E0\u5E8F"],
  command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run()
};
export {
  bulletListCommand
};
