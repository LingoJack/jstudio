const todoListCommand = {
  title: "To-do List",
  description: "Track tasks with a checkbox list",
  icon: "\u2610",
  aliases: ["todo", "task", "checklist", "checkbox", "\u5F85\u529E", "\u6E05\u5355", "\u4EFB\u52A1"],
  command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run()
};
export {
  todoListCommand
};
