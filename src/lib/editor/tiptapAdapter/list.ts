/**
 * List data ↔ TipTap bulletList/orderedList JSON bidirectional conversion.
 *
 * Our `ListItemData[]` (nested list items with content and children) ↔
 * TipTap nested list JSON (`bulletList|orderedList > listItem > [paragraph, (bulletList|orderedList)?]`).
 *
 * TipTap nests lists as: listItem > [paragraph, (bulletList|orderedList)?]
 * where the trailing sub-list holds the indented children. Our model mirrors
 * this with `ListItemData { content, children }`. The nested sub-list kind
 * follows the parent block type (we don't store a per-level kind).
 */

import type { JSONContent } from '@tiptap/react';
import type { ListItemData } from '../../../types/document';
import type { RichText } from '../../../types/richText';
import { richTextToTiptapInline, tiptapInlineToRichText } from './richText';

/**
 * Convert one `ListItemData` (and its descendants) to a TipTap `listItem`.
 */
export function listItemToTiptap(
  item: ListItemData,
  listType: 'bulletList' | 'orderedList',
): JSONContent {
  const inline = richTextToTiptapInline(item.content ?? []);
  const content: JSONContent[] = [
    {
      type: 'paragraph',
      ...(inline.length > 0 ? { content: inline } : {}),
    },
  ];
  if (item.children && item.children.length > 0) {
    content.push({
      type: listType,
      content: item.children.map((child) => listItemToTiptap(child, listType)),
    });
  }
  return { type: 'listItem', content };
}

/**
 * Read the children of a TipTap bulletList/orderedList node into our model.
 */
export function tiptapToListItems(node: JSONContent): ListItemData[] {
  const items: ListItemData[] = [];
  for (const listItem of node.content ?? []) {
    if (listItem.type !== 'listItem') continue;

    const paragraphs: RichText[] = [];
    let children: ListItemData[] = [];
    for (const child of listItem.content ?? []) {
      if (child.type === 'paragraph') {
        // Merge multiple paragraphs in one item with a soft break so no text
        // is lost (rare, but possible after some edits / markdown imports).
        if (paragraphs.length > 0) paragraphs.push({ text: '\n', annotations: {} });
        paragraphs.push(...tiptapInlineToRichText(child.content ?? []));
      } else if (child.type === 'bulletList' || child.type === 'orderedList') {
        children = children.concat(tiptapToListItems(child));
      }
    }
    items.push({ content: paragraphs, children });
  }
  return items;
}

/**
 * Read flat legacy list content (`RichText[][]`) into the nested model.
 * Used when a document predates `properties.listItems`.
 */
export function legacyFlatListToItems(flat: RichText[][]): ListItemData[] {
  return flat.map((content) => ({ content }));
}

/**
 * Flatten the nested model back to legacy `RichText[][]` (top level only).
 */
export function listItemsToFlat(items: ListItemData[]): RichText[][] {
  return items.map((item) => item.content ?? []);
}