import { richTextToTiptapInline, tiptapInlineToRichText } from "./richText";
function todoItemToTiptap(item) {
  const legacyText = item.text;
  const rich = item.richText ?? (legacyText ? [{ text: legacyText, annotations: {} }] : []);
  const inline = richTextToTiptapInline(rich);
  const content = [
    {
      type: "paragraph",
      ...inline.length > 0 ? { content: inline } : {}
    }
  ];
  if (item.children && item.children.length > 0) {
    content.push({
      type: "taskList",
      content: item.children.map(todoItemToTiptap)
    });
  }
  return { type: "taskItem", attrs: { checked: item.checked }, content };
}
function tiptapToTodoItems(node) {
  const items = [];
  for (const taskItem of node.content ?? []) {
    if (taskItem.type !== "taskItem") continue;
    const checked = taskItem.attrs?.checked === true;
    let richText = [];
    let children = [];
    for (const child of taskItem.content ?? []) {
      if (child.type === "paragraph") {
        if (richText.length > 0) richText.push({ text: "\n", annotations: {} });
        richText = richText.concat(tiptapInlineToRichText(child.content ?? []));
      } else if (child.type === "taskList") {
        children = children.concat(tiptapToTodoItems(child));
      }
    }
    items.push({ checked, richText, children });
  }
  return items;
}
export {
  tiptapToTodoItems,
  todoItemToTiptap
};
