import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { isPlainTextPaste } from "./plainTextPaste";
function dedupeMarks(json) {
  if (json.type === "text" && Array.isArray(json.marks) && json.marks.length > 1) {
    const seen = /* @__PURE__ */ new Set();
    json.marks = json.marks.filter((m) => {
      const key = m.type ?? "";
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (json.marks.length === 0) delete json.marks;
  }
  if (Array.isArray(json.content)) {
    json.content.forEach(dedupeMarks);
  }
  return json;
}
function looksLikeMarkdown(text) {
  if (!text || text.length < 2) return false;
  const blockPatterns = [
    /^#{1,6}\s+\S/m,
    // # Heading
    /^>\s+\S/m,
    // > Blockquote
    /^[-*+]\s+\S/m,
    // - Unordered list
    /^\d+\.\s+\S/m,
    // 1. Ordered list
    /```[\s\S]*?```/,
    // ``` Fenced code block
    /^\|.+\|.*\n\|[-:\s|]+\|/m,
    // | GFM table |
    /^-{3,}$|^\*{3,}$/m,
    // --- Horizontal rule
    /^!\[.*\]\(.*\)/m,
    // ![alt](url) image
    /^\$\$[\s\S]+?\$\$/m
    // $$ Math block $$
  ];
  return blockPatterns.some((re) => re.test(text));
}
const PasteMarkdown = Extension.create({
  name: "pasteMarkdown",
  addOptions() {
    return {
      enabled: true
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const enabled = this.options.enabled;
    return [
      new Plugin({
        props: {
          handlePaste(view, event) {
            if (isPlainTextPaste()) return false;
            if (!enabled || !editor.markdown) return false;
            const clipboardData = event.clipboardData;
            if (!clipboardData) return false;
            const htmlText = clipboardData.getData("text/html") ?? "";
            const plainText = clipboardData.getData("text/plain") ?? "";
            if (htmlText.includes("data-pm-slice")) return false;
            if (htmlText.trim().length > 0) return false;
            if (!plainText || !looksLikeMarkdown(plainText)) return false;
            event.preventDefault();
            const json = editor.markdown.parse(plainText);
            dedupeMarks(json);
            editor.commands.insertContent(json);
            return true;
          }
        }
      })
    ];
  }
});
export {
  PasteMarkdown,
  dedupeMarks,
  looksLikeMarkdown
};
