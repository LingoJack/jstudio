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
import { tiptapJSONToOurBlocks } from "./tiptapAdapter";
import { dedupeMarks } from "./pasteMarkdown";
let _headless = null;
function getHeadlessEditor() {
  if (_headless && !_headless.isDestroyed) return _headless;
  _headless = new Editor({
    // No DOM element — headless mode.
    element: void 0,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        code: false,
        // replaced by custom Code (see extensions.ts)
        // StarterKit v3 bundles `Link` + `Underline`; disable StarterKit's
        // link (we add our own below). Underline is left to StarterKit.
        link: false
      }),
      Code.extend({ excludes: "" }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({
        openOnClick: false,
        autolink: true
      }),
      Table.configure({ resizable: true, cellMinWidth: 100 }),
      TableRow,
      TableHeader,
      TableCell,
      // Register TaskList/TaskItem so Markdown task lists (`- [ ] item`) parse
      // into `taskList` nodes instead of being dropped/downgraded to plain
      // bullet lists. Must mirror DocumentPanel's config (`nested: true`).
      TaskList,
      TaskItem.configure({ nested: true }),
      MathBlockExtension,
      Markdown.configure({
        markedOptions: { gfm: true, breaks: true }
      })
    ],
    content: ""
  });
  return _headless;
}
function markdownToBlocks(md) {
  if (!md || !md.trim()) {
    return [{ id: `block-${Date.now()}`, type: "text", content: [] }];
  }
  const editor = getHeadlessEditor();
  const parsed = editor.markdown.parse(md);
  dedupeMarks(parsed);
  editor.commands.setContent(parsed);
  const json = editor.getJSON();
  const children = Array.isArray(json.content) ? json.content : [];
  return tiptapJSONToOurBlocks(children);
}
export {
  markdownToBlocks
};
