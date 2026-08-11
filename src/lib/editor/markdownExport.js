import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Code from "@tiptap/extension-code";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { Markdown } from "@tiptap/markdown";
import { MathBlockExtension } from "./extensions/mathBlockExtension";
import { ourBlocksToTiptapJSON, tiptapJSONToOurBlocks } from "./tiptapAdapter";
const defaultPlaceholders = {
  file: (name) => name ? `[\u9644\u4EF6: ${name}]` : "[\u9644\u4EF6]",
  diagram: "[\u56FE\u8868]"
};
let _headless = null;
function getHeadlessEditor() {
  if (_headless && !_headless.isDestroyed) return _headless;
  _headless = new Editor({
    element: void 0,
    extensions: [
      // codeBlock is LEFT ENABLED (default) so fenced code blocks serialize.
      // `code` (inline) and `link` are disabled here and replaced below so we
      // can configure them exactly like the import editor.
      StarterKit.configure({ code: false, link: false }),
      Code.extend({ excludes: "" }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: true, cellMinWidth: 100 }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      MathBlockExtension,
      Markdown.configure({ markedOptions: { gfm: true, breaks: true } })
    ],
    content: ""
  });
  return _headless;
}
let _placeholderSeq = 0;
function textBlock(text, annotations = {}) {
  _placeholderSeq += 1;
  const content = text.length > 0 ? [{ text, annotations }] : [];
  return {
    id: `md-export-${Date.now()}-${_placeholderSeq}`,
    type: "text",
    content
  };
}
function preprocessForMarkdown(blocks, ph) {
  const out = [];
  for (const block of blocks) {
    switch (block.type) {
      case "file": {
        const name = block.properties?.fileName ?? "";
        out.push(textBlock(ph.file(name)));
        break;
      }
      case "link": {
        const url = block.properties?.linkUrl ?? "";
        const title = block.properties?.linkTitle ?? "";
        const label = title || url;
        out.push(textBlock(label, url ? { href: url } : {}));
        break;
      }
      case "diagram": {
        out.push(textBlock(ph.diagram));
        break;
      }
      case "collapsible": {
        const summary = block.properties?.collapsibleSummary ?? "";
        if (summary) out.push(textBlock(summary, { bold: true }));
        const children = block.properties?.collapsibleChildren;
        if (Array.isArray(children) && children.length > 0) {
          const childBlocks = tiptapJSONToOurBlocks(children);
          out.push(...preprocessForMarkdown(childBlocks, ph));
        }
        break;
      }
      default:
        out.push(block);
    }
  }
  return out;
}
function blocksToMarkdown(blocks, opts) {
  const ph = opts ?? defaultPlaceholders;
  if (!blocks || blocks.length === 0) return "";
  const sanitized = preprocessForMarkdown(blocks, ph);
  if (sanitized.length === 0) return "";
  const json = ourBlocksToTiptapJSON(sanitized);
  const editor = getHeadlessEditor();
  editor.commands.setContent({ type: "doc", content: json });
  return editor.getMarkdown().trim();
}
export {
  blocksToMarkdown
};
