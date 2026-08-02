/**
 * Markdown export (serialization) for documents.
 *
 * Converts our `Block[]` document model into a Markdown string by:
 *   1. Pre-processing the blocks so that block types which have **no Markdown
 *      representation** are replaced with placeholder text blocks (or, for
 *      collapsible sections, flattened into their summary + children).
 *   2. Converting the sanitized blocks to TipTap `JSONContent` via the shared
 *      tiptap-adapter.
 *   3. Loading the JSON into a headless TipTap editor whose schema mirrors the
 *      subset of nodes/marks that `@tiptap/markdown` knows how to serialize,
 *      and calling `editor.getMarkdown()`.
 *
 * This is the inverse of `markdownImport.ts`.  Unlike the import editor, the
 * export editor keeps StarterKit's `codeBlock` **enabled** so that fenced code
 * blocks round-trip correctly.
 *
 * Block types that **can** be serialized natively:
 *   text, heading-*, quote, code, image, table, bullet-list, ordered-list,
 *   todo-list, divider, math.
 *
 * Block types that **cannot** and are replaced:
 *   file      -> placeholder text (e.g. `[附件: report.pdf]`)
 *   diagram   -> placeholder text (e.g. `[图表]`)
 *   link      -> a real Markdown link `[title](url)` (lossy but useful)
 *   collapsible -> flattened: bold summary line + recursively exported children
 */

import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';

import { MathBlockExtension } from './extensions/mathBlockExtension';
import { ourBlocksToTiptapJSON, tiptapJSONToOurBlocks } from './tiptapAdapter';
import type { Block, RichText, RichTextAnnotations } from '../../types';

// ──────────────────────────────────────────────────────────────────
// Placeholders
// ──────────────────────────────────────────────────────────────────

export interface MarkdownExportPlaceholders {
  /**
   * Placeholder for a file-attachment block.
   * Receives the file name (may be empty) and returns the Markdown text.
   */
  file: (name: string) => string;
  /** Placeholder for a diagram block. */
  diagram: string;
}

/** Neutral default placeholders (used when none are supplied). */
const defaultPlaceholders: MarkdownExportPlaceholders = {
  file: (name) => (name ? `[附件: ${name}]` : '[附件]'),
  diagram: '[图表]',
};

// ──────────────────────────────────────────────────────────────────
// Headless export editor
// ──────────────────────────────────────────────────────────────────

let _headless: Editor | null = null;

/**
 * Lazily create (and cache) a headless editor configured for Markdown
 * serialization.  The schema intentionally matches the subset of nodes/marks
 * that `@tiptap/markdown` can render to Markdown.
 */
function getHeadlessEditor(): Editor {
  if (_headless && !_headless.isDestroyed) return _headless;

  _headless = new Editor({
    element: undefined,
    extensions: [
      // codeBlock is LEFT ENABLED (default) so fenced code blocks serialize.
      // `code` (inline) and `link` are disabled here and replaced below so we
      // can configure them exactly like the import editor.
      StarterKit.configure({ code: false, link: false }),
      Code.extend({ excludes: '' }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      MathBlockExtension,
      Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
    ],
    content: '',
  });
  return _headless;
}

// ──────────────────────────────────────────────────────────────────
// Pre-processing
// ──────────────────────────────────────────────────────────────────

let _placeholderSeq = 0;

/** Build a minimal text block carrying a single styled text segment. */
function textBlock(text: string, annotations: RichTextAnnotations = {}): Block {
  _placeholderSeq += 1;
  const content: RichText[] = text.length > 0 ? [{ text, annotations }] : [];
  return {
    id: `md-export-${Date.now()}-${_placeholderSeq}`,
    type: 'text',
    content,
  };
}

/**
 * Walk the block list and replace every block type that the export editor's
 * schema cannot represent.  Unsupported blocks are converted to plain text
 * blocks (placeholders / links) and collapsible sections are recursively
 * flattened, so the returned list contains **only** serializable block types.
 */
function preprocessForMarkdown(
  blocks: Block[],
  ph: MarkdownExportPlaceholders,
): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'file': {
        const name = block.properties?.fileName ?? '';
        out.push(textBlock(ph.file(name)));
        break;
      }
      case 'link': {
        // A link-card has no native Markdown form, but its title + url can be
        // rendered as an ordinary Markdown link, which is far more useful than
        // a bare placeholder.
        const url = block.properties?.linkUrl ?? '';
        const title = block.properties?.linkTitle ?? '';
        const label = title || url;
        out.push(textBlock(label, url ? { href: url } : {}));
        break;
      }
      case 'diagram': {
        out.push(textBlock(ph.diagram));
        break;
      }
      case 'collapsible': {
        // Flatten: emit the summary as a bold line, then the children content.
        const summary = block.properties?.collapsibleSummary ?? '';
        if (summary) out.push(textBlock(summary, { bold: true }));
        const children = block.properties?.collapsibleChildren;
        if (Array.isArray(children) && children.length > 0) {
          const childBlocks = tiptapJSONToOurBlocks(children as JSONContent[]);
          out.push(...preprocessForMarkdown(childBlocks, ph));
        }
        break;
      }
      default:
        // Supported block type – keep as-is.
        out.push(block);
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────

/**
 * Serialize a document's `Block[]` to a Markdown string.
 *
 * Blocks that cannot be represented in Markdown (file attachments, diagrams,
 * …) are replaced with placeholders; link-cards become Markdown links and
 * collapsible sections are flattened into their summary + children.
 *
 * @param blocks  The document body (top-level blocks).
 * @param opts    Optional placeholder strings (e.g. i18n-resolved).
 */
export function blocksToMarkdown(
  blocks: Block[],
  opts?: MarkdownExportPlaceholders,
): string {
  const ph = opts ?? defaultPlaceholders;
  if (!blocks || blocks.length === 0) return '';

  const sanitized = preprocessForMarkdown(blocks, ph);
  if (sanitized.length === 0) return '';

  const json = ourBlocksToTiptapJSON(sanitized);
  const editor = getHeadlessEditor();
  editor.commands.setContent({ type: 'doc', content: json });
  return editor.getMarkdown().trim();
}
