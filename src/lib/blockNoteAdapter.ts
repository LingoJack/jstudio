/**
 * Data adapter — bidirectional conversion between our `Block[]` format
 * (Notion-like rich-text segments) and BlockNote's `PartialBlock[]` format
 * (ProseMirror-based).
 *
 * This is the single source of truth for format translation. Neither the
 * editor nor the store ever needs to know about the other's internal
 * representation.
 *
 * Mapping summary:
 *
 *   OUR BLOCK TYPES              →   BLOCKNOTE BLOCK TYPES
 *   ─────────────────────────────────────────────────────────
 *   text                         →   paragraph
 *   heading-1/2/3                →   heading (level 1/2/3)
 *   code                         →   codeBlock
 *   image                        →   image
 *
 *   (Other BlockNote block types — table, file, etc. — can be added
 *    incrementally in the future by extending this mapping.)
 *
 *   OUR RICHTEXT ANNOTATIONS     →   BLOCKNOTE STYLES
 *   ─────────────────────────────────────────────────────────
 *   bold / italic / underline    →   styles.bold / italic / underline
 *   strikethrough                →   styles.strike
 *   color                        →   styles.textColor
 *   href                         →   link wrapper
 */

import type { PartialBlock } from '@blocknote/core';

import type { Block, BlockType } from '../types/document';
import type { RichText, RichTextAnnotations } from '../types/richText';

// ---------------------------------------------------------------------------
// Types (local aliases for BlockNote internal structures)
// ---------------------------------------------------------------------------

/** A BlockNote inline text segment with styles. */
interface BNText {
  type: 'text';
  text: string;
  styles: Record<string, unknown>;
}

/** A BlockNote link inline content wrapping other inline content. */
interface BNLink {
  type: 'link';
  href: string;
  content: BNText[];
}

type BNInline = BNText | BNLink | { type: string; [k: string]: unknown };

// ---------------------------------------------------------------------------
// RichText[]  ⟷  BlockNote InlineContent[]
// ---------------------------------------------------------------------------

/**
 * Convert our `RichText[]` to BlockNote's inline content array.
 *
 * Each `RichText` segment becomes one or more `BNText` nodes. If the segment
 * has an `href`, we wrap it in a `BNLink`.
 */
export function richTextToInlineContent(
  rich: RichText[],
): BNInline[] {
  if (!rich || rich.length === 0) return [];

  const result: BNInline[] = [];

  for (const seg of rich) {
    if (!seg.text) continue;

    const styles: Record<string, unknown> = {};
    const a = seg.annotations ?? {};

    if (a.bold) styles.bold = true;
    if (a.italic) styles.italic = true;
    if (a.underline) styles.underline = true;
    if (a.strikethrough) styles.strike = true;
    if (a.color && a.color !== 'default') styles.textColor = a.color;

    const textNode: BNText = { type: 'text', text: seg.text, styles };

    if (a.href) {
      // Wrap in a link node
      result.push({
        type: 'link',
        href: a.href,
        content: [textNode],
      } satisfies BNLink);
    } else {
      result.push(textNode);
    }
  }

  return result;
}

/**
 * Convert BlockNote inline content array back to our `RichText[]`.
 */
export function inlineContentToRichText(
  inline: BNInline[],
): RichText[] {
  if (!inline || inline.length === 0) return [];

  const result: RichText[] = [];

  for (const node of inline) {
    if (node.type === 'text') {
      const t = node as BNText;
      const styles = t.styles ?? {};
      const annotations: RichTextAnnotations = {};

      if (styles.bold) annotations.bold = true;
      if (styles.italic) annotations.italic = true;
      if (styles.underline) annotations.underline = true;
      if (styles.strike) annotations.strikethrough = true;
      if (styles.textColor && styles.textColor !== 'default') {
        annotations.color = styles.textColor as string;
      }

      result.push({ text: t.text, annotations });
    } else if (node.type === 'link') {
      const link = node as BNLink;
      // Unwrap: each child text node inherits the href
      const children = link.content ?? [];
      for (const child of children) {
        const styles = child.styles ?? {};
        const annotations: RichTextAnnotations = { href: link.href };

        if (styles.bold) annotations.bold = true;
        if (styles.italic) annotations.italic = true;
        if (styles.underline) annotations.underline = true;
        if (styles.strike) annotations.strikethrough = true;
        if (styles.textColor && styles.textColor !== 'default') {
          annotations.color = styles.textColor as string;
        }

        result.push({ text: child.text, annotations });
      }
    }
    // Other inline content types (e.g. custom) are ignored for now
  }

  return result;
}

// ---------------------------------------------------------------------------
// Block  ⟷  BlockNote PartialBlock
// ---------------------------------------------------------------------------

/** Map our BlockType to a BlockNote block type string. */
function ourTypeToBNType(type: BlockType): string {
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

/** Extract heading level from our block type. */
function headingLevel(type: BlockType): 1 | 2 | 3 {
  if (type === 'heading-1') return 1;
  if (type === 'heading-2') return 2;
  return 3;
}

/**
 * Convert one of our `Block`s to a BlockNote `PartialBlock`.
 */
export function ourBlockToBlockNote(block: Block): PartialBlock {
  const bnType = ourTypeToBNType(block.type);

  // --- Content extraction ---
  // Text-type blocks store RichText[]; media blocks store a string URL.
  const isMediaBlock = block.type === 'image';

  // --- Build base partial block ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partial: any = {
    type: bnType,
  };

  if (block.id) {
    partial.id = block.id;
  }

  // Text content
  if (!isMediaBlock && bnType !== 'codeBlock') {
    const rich = (block.content as RichText[]) ?? [];
    const inline = richTextToInlineContent(rich);
    if (inline.length > 0) {
      partial.content = inline;
    }
  }

  // Code block: store raw code text
  if (bnType === 'codeBlock') {
    const rich = (block.content as RichText[]) ?? [];
    const code = rich[0]?.text ?? '';
    partial.content = [
      { type: 'text', text: code, styles: {} },
    ];
    partial.props = {
      language: block.properties?.language ?? 'plaintext',
    };
  }

  // Heading level
  if (bnType === 'heading') {
    partial.props = {
      level: headingLevel(block.type),
    };
  }

  // Image block
  if (bnType === 'image') {
    const url = typeof block.content === 'string' ? block.content : '';
    partial.props = {
      url,
      caption: block.properties?.caption ?? '',
    };
  }

  return partial as PartialBlock;
}

/**
 * Convert an array of our `Block`s to BlockNote `PartialBlock[]`.
 */
export function ourBlocksToBlockNote(blocks: Block[]): PartialBlock[] {
  if (!blocks || blocks.length === 0) {
    // BlockNote requires at least one block
    return [{ type: 'paragraph' } as PartialBlock];
  }
  return blocks.map(ourBlockToBlockNote);
}

// ---------------------------------------------------------------------------

/** Map a BlockNote block type back to our BlockType. */
function bnTypeToOurType(
  bnType: string,
  props?: Record<string, unknown>,
): BlockType {
  switch (bnType) {
    case 'paragraph':
      return 'text';
    case 'heading': {
      const level = (props?.level as number) ?? 1;
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
 * Convert a BlockNote block to our `Block` format.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function blockNoteToOurBlock(bnBlock: any): Block {
  const bnType: string = bnBlock.type ?? 'paragraph';
  const props = bnBlock.props ?? {};
  const ourType = bnTypeToOurType(bnType, props);

  const block: Block = {
    id: typeof bnBlock.id === 'string' ? bnBlock.id : crypto.randomUUID(),
    type: ourType,
    content: [],
  };

  // --- Text-type blocks ---
  if (ourType !== 'image') {
    const inline = bnBlock.content ?? [];

    if (ourType === 'code') {
      // Code block: extract raw text from first text node
      const codeText = Array.isArray(inline)
        ? inline.map((n: BNInline) => ('text' in n ? (n as BNText).text : '')).join('')
        : '';
      block.content = [{ text: codeText, annotations: {} }];
      block.properties = {
        language: (props.language as string) ?? 'plaintext',
      };
    } else {
      block.content = inlineContentToRichText(inline as BNInline[]);
    }
  }

  // --- Image block ---
  if (ourType === 'image') {
    block.content = (props.url as string) ?? '';
    block.properties = {
      caption: (props.caption as string) ?? '',
      imageType: 'url',
    };
  }

  return block;
}

/**
 * Convert BlockNote blocks array to our `Block[]` format.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function blockNoteToOurBlocks(bnBlocks: any[]): Block[] {
  if (!bnBlocks || bnBlocks.length === 0) return [];
  return bnBlocks.map(blockNoteToOurBlock);
}


