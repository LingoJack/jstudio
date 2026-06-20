/**
 * Markdown → Block[] converter.
 *
 * Uses `marked` to parse Markdown into HTML, then walks the resulting DOM
 * tree to produce our native `Block[]` format. This avoids any dependency
 * on the TipTap schema and works both for paste (convert → TipTap JSON via
 * `ourBlocksToTiptapJSON`) and file import (directly create a Document).
 *
 * Supported Markdown features:
 *   # / ## / ###       → heading-1 / heading-2 / heading-3
 *   paragraph          → text
 *   > quote            → quote
 *   ```lang code```    → code (properties.language)
 *   - / * unordered    → bullet-list (RichText[][])
 *   1. ordered         → ordered-list (RichText[][])
 *   ![alt](url)        → image (string url)
 *   GFM table          → table (properties.tableData)
 *   ---                → text (empty separator)
 *
 * Inline formatting:
 *   **bold** / __bold__ → bold annotation
 *   *italic* / _it_     → italic annotation
 *   ~~strike~~          → strikethrough annotation
 *   `code`              → plain text (inline code style not in our model)
 *   [text](url)         → link (href annotation)
 */

import { marked } from 'marked';
import type {
  Block,
  BlockType,
  TableData,
  TableCellData,
  TableRowData,
} from '../types/document';
import type { RichText, RichTextAnnotations } from '../types/richText';

// Configure marked: GFM tables/strikethrough + line breaks.
marked.setOptions({
  gfm: true,
  breaks: true,
});

// ---------------------------------------------------------------------------
// Block ID generation
// ---------------------------------------------------------------------------

let _blockCounter = 0;

function nextBlockId(): string {
  _blockCounter++;
  return `block-md-${Date.now()}-${_blockCounter}`;
}

// ---------------------------------------------------------------------------
// Inline: DOM node → RichText[]
// ---------------------------------------------------------------------------

/**
 * Recursively walk a DOM node's children and build `RichText[]`.
 *
 * Inline formatting elements set annotation flags that are inherited by
 * all descendant text nodes:
 *   <strong>/<b>  → bold
 *   <em>/<i>      → italic
 *   <u>           → underline
 *   <del>/<s>     → strikethrough
 *   <a href="…">  → link (href)
 *   <code>        → (kept as plain text — inline code style is visual-only)
 */
function domToRichText(
  node: Node,
  inherited: RichTextAnnotations = {},
): RichText[] {
  const result: RichText[] = [];

  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];

    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? '';
      if (text) {
        result.push({ text, annotations: { ...inherited } });
      }
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    const ann: RichTextAnnotations = { ...inherited };

    switch (tag) {
      case 'strong':
      case 'b':
        ann.bold = true;
        break;
      case 'em':
      case 'i':
        ann.italic = true;
        break;
      case 'u':
        ann.underline = true;
        break;
      case 'del':
      case 's':
      case 'strike':
        ann.strikethrough = true;
        break;
      case 'a': {
        const href = el.getAttribute('href');
        if (href) ann.href = href;
        break;
      }
      case 'br':
        result.push({ text: '\n', annotations: { ...inherited } });
        continue;
      default:
        break;
    }

    result.push(...domToRichText(el, ann));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Table: <table> → TableData
// ---------------------------------------------------------------------------

function domToTableData(tableEl: Element): TableData {
  const rows: TableRowData[] = [];

  const trList = tableEl.querySelectorAll('tr');
  trList.forEach((tr) => {
    const cells: TableCellData[] = [];
    let isHeader = false;

    // Determine header status: if any cell in this row is <th>
    tr.querySelectorAll('th, td').forEach((cellEl) => {
      if (cellEl.tagName.toLowerCase() === 'th') isHeader = true;

      const paragraphs: RichText[][] = [];
      // Treat cell content as a single paragraph.
      const rich = domToRichText(cellEl);
      paragraphs.push(rich);

      cells.push({ content: paragraphs });
    });

    if (cells.length > 0) {
      rows.push({ isHeader, cells });
    }
  });

  return { rows };
}

// ---------------------------------------------------------------------------
// Top-level: HTML element → Block
// ---------------------------------------------------------------------------

function elementToBlock(el: Element): Block | Block[] | null {
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3': {
      const level = parseInt(tag[1], 10);
      const type: BlockType =
        level <= 1 ? 'heading-1' : level === 2 ? 'heading-2' : 'heading-3';
      return {
        id: nextBlockId(),
        type,
        content: domToRichText(el),
      };
    }

    case 'p': {
      // Check for standalone image inside paragraph
      const img = el.querySelector('img');
      if (img && el.children.length === 1 && img.tagName.toLowerCase() === 'img') {
        const src = img.getAttribute('src') ?? '';
        const alt = img.getAttribute('alt') ?? '';
        if (src) {
          return {
            id: nextBlockId(),
            type: 'image',
            content: src,
            properties: {
              caption: alt,
              imageType: src.startsWith('http') ? 'url' : 'asset',
            },
          };
        }
      }

      // Normal paragraph
      const rich = domToRichText(el);
      // Skip empty paragraphs
      if (rich.length === 0 || rich.every((r) => !r.text.trim())) {
        return null;
      }
      return {
        id: nextBlockId(),
        type: 'text',
        content: rich,
      };
    }

    case 'blockquote': {
      // Flatten all paragraphs inside blockquote into one RichText[]
      const allInline: RichText[] = [];
      el.querySelectorAll('p').forEach((p) => {
        const seg = domToRichText(p);
        if (allInline.length > 0 && seg.length > 0) {
          allInline.push({ text: '\n', annotations: {} });
        }
        allInline.push(...seg);
      });
      // Fallback: if no <p> children, parse directly
      if (allInline.length === 0) {
        allInline.push(...domToRichText(el));
      }
      return {
        id: nextBlockId(),
        type: 'quote',
        content: allInline.length > 0 ? allInline : [],
      };
    }

    case 'pre': {
      // Code block: <pre><code class="language-xxx">…</code></pre>
      const codeEl = el.querySelector('code');
      const codeText = codeEl?.textContent ?? el.textContent ?? '';

      // Extract language from class (e.g. "language-javascript" or "lang-ts")
      let language = 'plaintext';
      const codeClass = codeEl?.className ?? '';
      const langMatch = codeClass.match(/(?:language|lang)-(\w+)/);
      if (langMatch) {
        language = langMatch[1];
      }

      return {
        id: nextBlockId(),
        type: 'code',
        content: [{ text: codeText.replace(/\n$/, ''), annotations: {} }],
        properties: { language },
      };
    }

    case 'ul':
    case 'ol': {
      const type: BlockType = tag === 'ul' ? 'bullet-list' : 'ordered-list';
      const items: RichText[][] = [];

      el.querySelectorAll(':scope > li').forEach((li) => {
        // Each list item: collect text from its paragraphs
        const itemRich: RichText[] = [];
        const paras = li.querySelectorAll(':scope > p');
        if (paras.length > 0) {
          paras.forEach((p, idx) => {
            if (idx > 0) itemRich.push({ text: '\n', annotations: {} });
            itemRich.push(...domToRichText(p));
          });
        } else {
          itemRich.push(...domToRichText(li));
        }
        items.push(itemRich);
      });

      if (items.length === 0) return null;

      return {
        id: nextBlockId(),
        type,
        content: items as unknown as Block['content'],
      };
    }

    case 'table': {
      return {
        id: nextBlockId(),
        type: 'table',
        content: [],
        properties: { tableData: domToTableData(el) },
      };
    }

    case 'hr': {
      return {
        id: nextBlockId(),
        type: 'text',
        content: [],
      };
    }

    case 'img': {
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      if (src) {
        return {
          id: nextBlockId(),
          type: 'image',
          content: src,
          properties: {
            caption: alt,
            imageType: src.startsWith('http') ? 'url' : 'asset',
          },
        };
      }
      return null;
    }

    case 'div':
    case 'section':
    case 'article': {
      // Container element: recurse into children
      const blocks: Block[] = [];
      for (let i = 0; i < el.children.length; i++) {
        const childBlock = elementToBlock(el.children[i]);
        if (childBlock) {
          if (Array.isArray(childBlock)) blocks.push(...childBlock);
          else blocks.push(childBlock);
        }
      }
      return blocks.length > 0 ? blocks : null;
    }

    default: {
      // Unknown element: try to extract as plain text block
      const rich = domToRichText(el);
      if (rich.length === 0 || rich.every((r) => !r.text.trim())) {
        return null;
      }
      return {
        id: nextBlockId(),
        type: 'text',
        content: rich,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a Markdown string to our native `Block[]` format.
 *
 * Returns at least one empty text block if the input produces no content.
 */
export function markdownToBlocks(md: string): Block[] {
  if (!md || !md.trim()) {
    return [
      {
        id: nextBlockId(),
        type: 'text',
        content: [],
      },
    ];
  }

  const html = marked.parse(md, { async: false }) as string;

  const container = document.createElement('div');
  container.innerHTML = html;

  const blocks: Block[] = [];

  for (let i = 0; i < container.children.length; i++) {
    const child = container.children[i];
    const result = elementToBlock(child);
    if (result) {
      if (Array.isArray(result)) blocks.push(...result);
      else blocks.push(result);
    }
  }

  // Ensure at least one block exists
  if (blocks.length === 0) {
    blocks.push({
      id: nextBlockId(),
      type: 'text',
      content: [],
    });
  }

  return blocks;
}

/**
 * Heuristic: does the given plain text look like Markdown?
 *
 * Returns `true` if the text contains common Markdown block-level syntax
 * patterns. This is used to decide whether to parse pasted text as Markdown
 * or insert it as-is.
 */
export function isLikelyMarkdown(text: string): boolean {
  if (!text || text.length < 2) return false;

  const lines = text.split('\n');

  // Patterns that strongly indicate Markdown
  let mdSignals = 0;

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Heading: # / ## / ### / #### / ##### / ######
    if (/^#{1,6}\s+\S/.test(trimmed)) { mdSignals++; continue; }

    // Blockquote: >
    if (/^>\s?/.test(trimmed)) { mdSignals++; continue; }

    // Unordered list: - / * / +
    if (/^[-*+]\s+\S/.test(trimmed)) { mdSignals++; continue; }

    // Ordered list: 1. / 1)
    if (/^\d+[.)]\s+\S/.test(trimmed)) { mdSignals++; continue; }

    // Horizontal rule: --- / *** / ___
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { mdSignals++; continue; }

    // Fenced code block: ``` or ~~~
    if (/^(```|~~~)/.test(trimmed)) { mdSignals++; continue; }

    // Image: ![alt](url)
    if (/^!\[.*\]\(.*\)/.test(trimmed)) { mdSignals++; continue; }

    // Link reference: [text](url)
    if (/^\[.*\]\(.*\)/.test(trimmed)) { mdSignals++; continue; }

    // GFM table row: | col1 | col2 |
    if (/^\|.+\|$/.test(trimmed) && trimmed.includes('|', 1)) { mdSignals++; continue; }
  }

  // Require at least 2 Markdown signals, or a single fenced code block,
  // to avoid false positives on ordinary text.
  if (mdSignals >= 2) return true;

  // Single fenced code block is a strong signal on its own
  if (/^```/m.test(text) || /^~~~/m.test(text)) return true;

  // Single table with header separator (|---|---|)
  if (/\|[\s-]+\|/.test(text)) return true;

  return false;
}
