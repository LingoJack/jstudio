const linkCommand = {
  title: "Link",
  description: "Embed a web link with preview",
  icon: "LINK",
  aliases: ["link", "url", "bookmark", "web", "\u94FE\u63A5", "\u7F51\u9875"],
  command: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).insertLinkBlock().run();
  }
};
export {
  linkCommand
};
