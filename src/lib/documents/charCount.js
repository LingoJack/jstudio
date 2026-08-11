import { contentToString } from "../editor/content/blockContent";
function richTextLength(rt) {
  if (!rt) return 0;
  let n = 0;
  for (const seg of rt) n += seg.text.length;
  return n;
}
function listItemLength(items) {
  if (!items) return 0;
  let n = 0;
  for (const item of items) {
    n += richTextLength(item.content);
    n += listItemLength(item.children);
  }
  return n;
}
function todoItemLength(items) {
  if (!items) return 0;
  let n = 0;
  for (const item of items) {
    n += richTextLength(item.richText);
    n += todoItemLength(item.children);
  }
  return n;
}
function countBlockCharacters(blocks) {
  let total = 0;
  for (const block of blocks) {
    switch (block.type) {
      case "bullet-list":
      case "ordered-list":
        total += listItemLength(block.properties?.listItems);
        break;
      case "todo-list":
        total += todoItemLength(block.properties?.todoItems);
        break;
      case "table": {
        const rows = block.properties?.tableData?.rows;
        if (rows) {
          for (const row of rows) {
            for (const cell of row.cells) {
              for (const para of cell.content) total += richTextLength(para);
            }
          }
        }
        break;
      }
      case "collapsible":
        total += (block.properties?.collapsibleSummary ?? "").length;
        break;
      case "math":
        total += (block.properties?.mathLatex ?? "").length;
        break;
      case "divider":
      case "image":
      case "file":
      case "link":
      case "diagram":
        break;
      default:
        total += contentToString(block.content).length;
        break;
    }
  }
  return total;
}
export {
  countBlockCharacters
};
