/**
 * Fit parsed Tiptap JSON to an editor schema.
 *
 * Why this exists: `@tiptap/markdown` (and any other JSON producer) can emit
 * node structures the schema rejects — a `paragraph` inside a `paragraph`, an
 * `image` inside a `paragraph` (our Image is a block node), a `heading` as the
 * first child of a `listItem` (its content expression is `paragraph block*`).
 * Tiptap's `insertContent` runs `node.check()` unconditionally, so a single
 * bad node throws `RangeError: Invalid content for node ...` and the ENTIRE
 * paste / import is dropped — the user sees nothing happen.
 *
 * This walks the JSON against the schema's content expressions and repairs
 * what doesn't fit, in this order:
 *   1. block node inside a textblock (paragraph > image) → hoisted out, placed
 *      as a sibling right after the textblock
 *   2. textblock in a slot that takes no textblock (listItem > heading) →
 *      rewritten as a `paragraph`, inline content kept
 *   3. container that doesn't fit (anything else) → unwrapped, its children
 *      take its place
 *   4. block atom that fits nowhere → dropped
 *   5. node left without the content it requires → filled with an empty
 *      paragraph (`doc` and `tableCell` both require at least one block)
 *
 * Content that is already valid comes back untouched.
 */

import type { JSONContent } from '@tiptap/core';
import type { NodeType, Schema } from '@tiptap/pm/model';
import { Fragment } from '@tiptap/pm/model';

type ContentMatch = NodeType['contentMatch'];

const PARAGRAPH = 'paragraph';

/** What placing one child produced: the nodes to insert plus blocks that had
 *  to be lifted out of a textblock and still need a home one level up. */
interface Placement {
  nodes: JSONContent[];
  hoisted: JSONContent[];
  match: ContentMatch;
}

interface Fitted {
  nodes: JSONContent[];
  hoisted: JSONContent[];
  match: ContentMatch;
}

/** A node type whose content expression is not satisfied by an empty fragment. */
function requiresContent(type: NodeType): boolean {
  const fill = type.contentMatch.fillBefore(Fragment.empty, true);
  return !fill || fill.size > 0;
}

/** The filler a node needs when all of its children had to be dropped. */
function emptyFiller(start: ContentMatch, type: NodeType, schema: Schema): JSONContent[] {
  if (!requiresContent(type)) return [];
  const paragraph = schema.nodes[PARAGRAPH];
  if (!paragraph || !start.matchType(paragraph)) return [];
  return [{ type: PARAGRAPH }];
}

/**
 * Return `json` with every node refitted to `schema` — see the file header for
 * the repair rules.
 */
export function fitTiptapJSON(json: JSONContent, schema: Schema): JSONContent {
  const type = json.type ? schema.nodes[json.type] : undefined;
  if (!type) return json;
  const placed = placeChildren(json.content ?? [], type.contentMatch, type, schema);
  const content = placed.nodes.length > 0 ? placed.nodes : emptyFiller(type.contentMatch, type, schema);
  return { ...json, content };
}

/** Recursively fit `children` into a node of type `type`, returning the refitted node. */
function fitNode(node: JSONContent, type: NodeType, schema: Schema): Fitted {
  const start = type.contentMatch;
  if (type.isLeaf) {
    return { nodes: [node], hoisted: [], match: start };
  }
  const placed = placeChildren(node.content ?? [], start, type, schema);
  const content = placed.nodes.length > 0 ? placed.nodes : emptyFiller(start, type, schema);
  return { nodes: [{ ...node, content }], hoisted: placed.hoisted, match: start };
}

/**
 * Place `children` into a node of type `parent`, starting at content position
 * `match`. Returns the nodes that fit, the blocks lifted out of textblocks,
 * and the resulting content position.
 */
function placeChildren(
  children: JSONContent[],
  match: ContentMatch,
  parent: NodeType,
  schema: Schema,
): Placement {
  const nodes: JSONContent[] = [];
  const hoisted: JSONContent[] = [];
  let current = match;

  const place = (fitted: Fitted) => {
    nodes.push(...fitted.nodes);
    current = fitted.match;
    // Blocks lifted out of a textblock are placed here, after it. They come
    // from a textblock, so they cannot lift anything themselves.
    if (fitted.hoisted.length > 0) {
      const lifted = placeChildren(fitted.hoisted, current, parent, schema);
      nodes.push(...lifted.nodes);
      current = lifted.match;
    }
  };

  for (const child of children) {
    const childType = child.type ? schema.nodes[child.type] : undefined;
    // Unknown node type: nothing in the schema can hold it.
    if (!childType) continue;

    const next = current.matchType(childType);
    if (next) {
      place({ ...fitNode(child, childType, schema), match: next });
      continue;
    }

    // 1. Block inside a textblock: lift it out, it becomes a sibling below.
    if (parent.isTextblock && !childType.isInline && !childType.isText) {
      hoisted.push(...fitNode(child, childType, schema).nodes);
      continue;
    }

    // 2. Textblock where no textblock fits: try it as a paragraph first, so
    //    containers that require a leading paragraph (listItem, tableCell)
    //    keep a block instead of collapsing into loose inline text.
    const paragraph = schema.nodes[PARAGRAPH];
    if (childType.isTextblock && paragraph && current.matchType(paragraph)) {
      place(placeChildren([{ type: PARAGRAPH, content: child.content ?? [] }], current, parent, schema));
      continue;
    }

    // 3. Container that doesn't fit: unwrap it and place its children instead.
    if (Array.isArray(child.content) && child.content.length > 0) {
      place(placeChildren(child.content, current, parent, schema));
      continue;
    }

    // 4. Block atom (image, horizontalRule, …): nothing to salvage.
  }

  return { nodes, hoisted, match: current };
}
