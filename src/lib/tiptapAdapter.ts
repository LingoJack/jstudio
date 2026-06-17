/**
 * Data adapter — bidirectional conversion between our `Block[]` format
 * (Notion-like rich-text segments) and TipTap's `JSONContent[]` format
 * (ProseMirror-based document JSON).
 *
 * This is the single source of truth for format translation. Neither the
 * editor nor the store ever needs to know about the other's internal
 * representation.
 *
 * Mapping summary:
 *
 *   OUR BLOCK TYPES              →   TIPTAP NODE TYPES
 *   ─────────────────────────────────────────────────────────
 *   text                         →   paragraph
 *   heading-1/2/3                →   heading (attrs.level = 1/2/3)
 *   code                         →   codeBlock
 *   image                        →   image
 *
 *   OUR RICHTEXT ANNOTATIONS     →   TIPTAP MARKS
 *   ─────────────────────────────────────────────────────────
 *   bold                         →   bold
 *   italic                       →   italic
 *   underline                    →   underline
 *   strikethrough                →   strike
 *   color (≠ 'default')          →   textStyle (attrs.color)
 *   href                         →   link (attrs.href)
 */

import type { JSONContent } from '@tiptap/react';

import type { Block, BlockType } from '../types/document';
import type { RichText, RichTextAnnotations } from '../types/richText';

// ---------------------------------------------------------------------------
// Types (local helpers)
// ---------------------------------------------------------------------------

/** A TipTap mark with a concrete type and attrs. */
interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// RichText[]  ⟷  TipTap inline JSONContent[]
// ---------------------------------------------------------------------------

/**
 * Build the list of TipTap marks for a single `RichText` segment based on its
 * annotations.
 *
 * Order matters for rendering consistency: we emit marks in a stable order
 * (bold, italic, underline, strike, textStyle, link).
 */
function annotationsToMarks(ann: RichTextAnnotations): TiptapMark[] {
  const marks: TiptapMark[] = [];

  if (ann.bold) marks.push({ type: 'bold' });
  if (ann.italic) marks.push({ type: 'italic' });
  if (ann.underline) marks.push({ type: 'underline' });
  if (ann.strikethrough) marks.push({ type: 'strike' });

  if (ann.color && ann.color !== 'default') {
    marks.push({ type: 'textStyle', attrs: { color: ann.color } });
  }

  if (ann.href) {
    marks.push({ type: 'link', attrs: { href: ann.href } });
  }

  return marks;
}

/**
 * Convert our `RichText[]` to an array of TipTap inline `JSONContent` nodes.
 *
 * Each `RichText` segment becomes a text node with the appropriate marks.
 * Empty segments are skipped. If the array is empty an empty array is
 * returned (the caller can decide whether to emit an empty paragraph).
 */
export function richTextToTiptapInline(rich: RichText[]): JSONContent[] {
  if (!rich || rich.length === 0) return [];

  const result: JSONContent[] = [];

  for (const seg of rich) {
    if (!seg.text) continue;
    result.push({
      type: 'text',
      text: seg.text,
      marks: annotationsToMarks(seg.annotations ?? {}),
    });
  }

  return result;
}

/**
 * Convert an array of TipTap inline `JSONContent` nodes back to our
 * `RichText[]`.
 *
 * Handles text nodes and unwraps `link` nodes if present.
 */
export function tiptapInlineToRichText(nodes: JSONContent[]): RichText[] {
  if (!nodes || nodes.length === 0) return [];

  const result: RichText[] = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      const marks = (node.marks ?? []) as TiptapMark[];
      result.push({ text: node.text ?? '', annotations: marksToAnnotations(marks) });
    }
    // Other inline types (e.g. hardBreak) are ignored for now.
  }

  return result;
}

/** Map a list of TipTap marks back to our `RichTextAnnotations`. */
function marksToAnnotations(marks: TiptapMark[]): RichTextAnnotations {
  const annotations: RichTextAnnotations = {};

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        annotations.bold = true;
        break;
      case 'italic':
        annotations.italic = true;
        break;
      case 'underline':
        annotations.underline = true;
        break;
      case 'strike':
        annotations.strikethrough = true;
        break;
      case 'textStyle': {
        const color = mark.attrs?.color;
        if (typeof color === 'string') {
          annotations.color = color;
        }
        break;
      }
      case 'link': {
        const href = mark.attrs?.href;
        if (typeof href === 'string') {
          annotations.href = href;
        }
        break;
      }
      default:
        // Unknown marks are ignored.
        break;
    }
  }

  return annotations;
}

// ---------------------------------------------------------------------------
// Block  ⟷  TipTap JSONContent
// ---------------------------------------------------------------------------

/** Map our BlockType to a TipTap node type string. */
function ourTypeToTiptapType(type: BlockType): string {
  switch (type) {
    case 'text':
      return 'paragraph';
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
      return 'heading';
    case 'code':
      return 'codeBlock';
    case 'image':
      return 'image';
    default:
      return 'paragraph';
  }
}

/** Extract heading level (1/2/3) from our block type. */
function headingLevel(type: BlockType): 1 | 2 | 3 {
  if (type === 'heading-1') return 1;
  if (type === 'heading-2') return 2;
  return 3;
}

/** Map a TipTap node type string back to our BlockType. */
function tiptapTypeToOurType(
  nodeType: string,
  attrs?: Record<string, unknown>,
): BlockType {
  switch (nodeType) {
    case 'paragraph':
      return 'text';
    case 'heading': {
      const level = (attrs?.level as number) ?? 1;
      if (level <= 1) return 'heading-1';
      if (level === 2) return 'heading-2';
      return 'heading-3';
    }
    case 'codeBlock':
      return 'code';
    case 'image':
      return 'image';
    default:
      return 'text';
  }
}

/**
 * Convert one of our `Block`s to a TipTap `JSONContent` node.
 *
 * - Text-type blocks (text, heading-*) store `RichText[]` → inline text nodes.
 * - Code blocks store `RichText[]` (single segment) → inline text node with
 *   the raw code, and `language` in `attrs`.
 * - Image blocks store a string URL → `attrs.src` / `attrs.alt`.
 */
export function ourBlockToTiptapJSON(block: Block): JSONContent {
  const nodeType = ourTypeToTiptapType(block.type);

  const json: JSONContent = {
    type: nodeType,
  };

  switch (block.type) {
    case 'text': {
      const inline = richTextToTiptapInline(block.content as RichText[]);
      if (inline.length > 0) {
        json.content = inline;
      }
      break;
    }
    case 'heading-1':
    case 'heading-2':
    case 'heading-3': {
      json.attrs = { level: headingLevel(block.type) };
      const inline = richTextToTiptapInline(block.content as RichText[]);
      if (inline.length > 0) {
        json.content = inline;
      }
      break;
    }
    case 'code': {
      const rich = block.content as RichText[];
      const code = rich[0]?.text ?? '';
      json.content = [{ type: 'text', text: code }];
      json.attrs = {
        language: block.properties?.language ?? 'plaintext',
      };
      break;
    }
    case 'image': {
      const src = typeof block.content === 'string' ? block.content : '';
      json.attrs = {
        src,
        alt: block.properties?.caption ?? '',
        width: block.properties?.width ?? null,
        height: block.properties?.height ?? null,
        align: block.properties?.align ?? 'center',
      };
      break;
    }
    default:
      // Fallback: treat as plain paragraph.
      break;
  }

  return json;
}

/**
 * Convert an array of our `Block`s to TipTap `JSONContent[]` (for use with
 * `editor.commands.setContent`).
 */
export function ourBlocksToTiptapJSON(blocks: Block[]): JSONContent[] {
  if (!blocks || blocks.length === 0) {
    // TipTap requires at least one block in the document.
    return [{ type: 'paragraph' }];
  }
  return blocks.map(ourBlockToTiptapJSON);
}

/**
 * Convert a single TipTap `JSONContent` node back to our `Block` format.
 */
export function tiptapJSONToOurBlock(node: JSONContent): Block {
  const nodeType = node.type ?? 'paragraph';
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const ourType = tiptapTypeToOurType(nodeType, attrs);

  const block: Block = {
    id: typeof node.attrs?.id === 'string' ? node.attrs.id : crypto.randomUUID(),
    type: ourType,
    content: [],
  };

  switch (ourType) {
    case 'text':
    case 'heading-1':
    case 'heading-2':
    case 'heading-3': {
      block.content = tiptapInlineToRichText(node.content ?? []);
      break;
    }
    case 'code': {
      // Code block: extract raw text from inline text nodes.
      const children = node.content ?? [];
      const codeText = children
        .map((c) => (c.type === 'text' ? c.text ?? '' : ''))
        .join('');
      block.content = [{ text: codeText, annotations: {} }];
      block.properties = {
        language: (attrs.language as string) ?? 'plaintext',
      };
      break;
    }
    case 'image': {
      const src = typeof attrs.src === 'string' ? attrs.src : '';
      const alt = typeof attrs.alt === 'string' ? attrs.alt : '';
      const width = typeof attrs.width === 'number' ? attrs.width : undefined;
      const height = typeof attrs.height === 'number' ? attrs.height : undefined;
      const align = attrs.align === 'left' || attrs.align === 'center' ? attrs.align : 'center';
      block.content = src;
      block.properties = {
        caption: alt,
        imageType: 'url',
        width,
        height,
        align,
      };
      break;
    }
    default:
      // Unknown types default to an empty text block.
      break;
  }

  return block;
}

/**
 * Convert TipTap doc-level children (from `editor.getJSON().content`) to our
 * `Block[]` format.
 */
export function tiptapJSONToOurBlocks(nodes: JSONContent[]): Block[] {
  if (!nodes || nodes.length === 0) return [];
  return nodes.map(tiptapJSONToOurBlock);
}
