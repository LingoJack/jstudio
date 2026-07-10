/**
 * Todo data ↔ TipTap taskList JSON bidirectional conversion.
 *
 * Our `TodoItemData[]` (nested todo items with checked, richText, children) ↔
 * TipTap nested task list JSON (`taskList > taskItem(attrs.checked) > [paragraph, taskList?]`).
 *
 * TaskItem is configured `nested: true`, so TipTap nests as:
 *   taskItem > [paragraph, taskList > taskItem...]
 * We mirror that with `TodoItemData.children`.
 */

import type { JSONContent } from '@tiptap/react';
import type { TodoItemData } from '../../../types/document';
import type { RichText } from '../../../types/richText';
import { richTextToTiptapInline, tiptapInlineToRichText } from './richText';

/**
 * Convert one `TodoItemData` (and descendants) to a TipTap `taskItem`.
 */
export function todoItemToTiptap(item: TodoItemData): JSONContent {
  // Backward compat: old documents stored `text: string` instead of richText.
  const legacyText = (item as { text?: string }).text;
  const rich =
    item.richText ??
    (legacyText ? [{ text: legacyText, annotations: {} }] : []);
  const inline = richTextToTiptapInline(rich);
  const content: JSONContent[] = [
    {
      type: 'paragraph',
      ...(inline.length > 0 ? { content: inline } : {}),
    },
  ];
  if (item.children && item.children.length > 0) {
    content.push({
      type: 'taskList',
      content: item.children.map(todoItemToTiptap),
    });
  }
  return { type: 'taskItem', attrs: { checked: item.checked }, content };
}

/**
 * Read the children of a TipTap taskList node into our model.
 */
export function tiptapToTodoItems(node: JSONContent): TodoItemData[] {
  const items: TodoItemData[] = [];
  for (const taskItem of node.content ?? []) {
    if (taskItem.type !== 'taskItem') continue;
    const checked = taskItem.attrs?.checked === true;
    let richText: RichText[] = [];
    let children: TodoItemData[] = [];
    for (const child of taskItem.content ?? []) {
      if (child.type === 'paragraph') {
        if (richText.length > 0) richText.push({ text: '\n', annotations: {} });
        richText = richText.concat(tiptapInlineToRichText(child.content ?? []));
      } else if (child.type === 'taskList') {
        children = children.concat(tiptapToTodoItems(child));
      }
    }
    items.push({ checked, richText, children });
  }
  return items;
}