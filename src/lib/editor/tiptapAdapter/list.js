import { richTextToTiptapInline, tiptapInlineToRichText } from "./richText";
function listItemToTiptap(item, listType) {
  const inline = richTextToTiptapInline(item.content ?? []);
  const content = [
    {
      type: "paragraph",
      ...inline.length > 0 ? { content: inline } : {}
    }
  ];
  if (item.children && item.children.length > 0) {
    content.push({
      type: listType,
      content: item.children.map((child) => listItemToTiptap(child, listType))
    });
  }
  return { type: "listItem", content };
}
function tiptapToListItems(node) {
  const items = [];
  for (const listItem of node.content ?? []) {
    if (listItem.type !== "listItem") continue;
    const paragraphs = [];
    let children = [];
    for (const child of listItem.content ?? []) {
      if (child.type === "paragraph") {
        if (paragraphs.length > 0) paragraphs.push({ text: "\n", annotations: {} });
        paragraphs.push(...tiptapInlineToRichText(child.content ?? []));
      } else if (child.type === "bulletList" || child.type === "orderedList") {
        children = children.concat(tiptapToListItems(child));
      }
    }
    items.push({ content: paragraphs, children });
  }
  return items;
}
function legacyFlatListToItems(flat) {
  return flat.map((content) => ({ content }));
}
function listItemsToFlat(items) {
  return items.map((item) => item.content ?? []);
}
export {
  legacyFlatListToItems,
  listItemToTiptap,
  listItemsToFlat,
  tiptapToListItems
};
