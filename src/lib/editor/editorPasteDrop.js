import { uploadImage, uploadAttachment } from "./upload";
import { getClipboardImageAsFile } from "./clipboardImage";
import { looksLikeMarkdown, dedupeMarks } from "./pasteMarkdown";
import { consumePlainTextPaste } from "./plainTextPaste";
function cleanExternalHtml(html) {
  if (!html.includes("style=") && !html.includes("class=") && !html.includes("<font") && !html.includes("<span")) {
    return html;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const body = doc.body;
  const walk = (el) => {
    el.removeAttribute("style");
    el.removeAttribute("class");
    el.removeAttribute("width");
    el.removeAttribute("height");
    el.removeAttribute("bgcolor");
    el.removeAttribute("color");
    el.removeAttribute("face");
    el.removeAttribute("size");
    if (el.tagName === "FONT") {
      const parent = el.parentNode;
      while (el.firstChild) {
        parent?.insertBefore(el.firstChild, el);
      }
      parent?.removeChild(el);
      return;
    }
    if (el.tagName === "SPAN" && !el.hasAttributes()) {
      const parent = el.parentNode;
      while (el.firstChild) {
        parent?.insertBefore(el.firstChild, el);
      }
      parent?.removeChild(el);
      return;
    }
    for (const child of Array.from(el.children)) {
      walk(child);
    }
  };
  walk(body);
  return body.innerHTML;
}
function looksLikeTSVTable(text) {
  if (!text) return false;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  if (!lines.every((l) => l.includes("	"))) return false;
  const counts = lines.map((l) => l.split("	").length);
  const first = counts[0];
  if (first < 2) return false;
  return counts.every((c) => c === first);
}
function tsvToTableJSON(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = lines.map((line, rowIdx) => {
    const cells = line.split("	");
    const cellType = rowIdx === 0 ? "tableHeader" : "tableCell";
    return {
      type: "tableRow",
      content: cells.map((cellText) => ({
        type: cellType,
        content: [
          {
            type: "paragraph",
            content: cellText.trim() ? [{ type: "text", text: cellText.trim() }] : []
          }
        ]
      }))
    };
  });
  return {
    type: "table",
    content: rows
  };
}
function createPasteHandler(editorRef) {
  return (view, event) => {
    const items = event.clipboardData?.items;
    if (!items) return false;
    const forcePlainText = consumePlainTextPaste();
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        event.preventDefault();
        uploadImage(file).then((src) => {
          editorRef.current?.chain().focus().setImage({ src, alt: "" }).run();
        });
        return true;
      }
    }
    if (forcePlainText) {
      const plainText2 = event.clipboardData?.getData("text/plain") ?? "";
      if (plainText2) {
        event.preventDefault();
        const editor = editorRef.current;
        const { selection } = view.state;
        let inCodeBlock = false;
        for (let d = selection.$head.depth; d > 0; d--) {
          if (selection.$head.node(d).type.name === "codeBlock") {
            inCodeBlock = true;
            break;
          }
        }
        if (inCodeBlock) {
          const { from, to } = selection;
          view.dispatch(view.state.tr.insertText(plainText2, from, to));
        } else if (editor) {
          const html = plainText2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
          editor.chain().focus().insertContent(html).run();
        }
        return true;
      }
    }
    const hasFileItem = Array.from(items).some((i) => i.kind === "file");
    if (!hasFileItem) {
      const editor = editorRef.current;
      const clipboardData = event.clipboardData;
      const htmlText = clipboardData?.getData("text/html") ?? "";
      const plainText2 = clipboardData?.getData("text/plain") ?? "";
      if (htmlText.includes("data-pm-slice")) return false;
      if (plainText2) {
        const { selection } = view.state;
        let inCodeBlock = false;
        for (let d = selection.$head.depth; d > 0; d--) {
          if (selection.$head.node(d).type.name === "codeBlock") {
            inCodeBlock = true;
            break;
          }
        }
        if (inCodeBlock) {
          event.preventDefault();
          const { from, to } = selection;
          const tr = view.state.tr;
          tr.insertText(plainText2, from, to);
          view.dispatch(tr);
          return true;
        }
      }
      const isTSV = !!(plainText2 && looksLikeTSVTable(plainText2));
      const hasHtmlTable = !!(htmlText && /<table[\s>]/i.test(htmlText));
      if (isTSV && !hasHtmlTable && editor) {
        event.preventDefault();
        const tableJSON = tsvToTableJSON(plainText2);
        editor.commands.insertContent(tableJSON);
        return true;
      }
      if (!isTSV && editor?.markdown && plainText2 && looksLikeMarkdown(plainText2)) {
        event.preventDefault();
        const json = editor.markdown.parse(plainText2);
        dedupeMarks(json);
        editor.commands.insertContent(json);
        return true;
      }
      if (htmlText && !htmlText.includes("data-pm-slice")) {
        event.preventDefault();
        const cleanHtml = cleanExternalHtml(htmlText);
        editor?.chain().focus().insertContent(cleanHtml).run();
        return true;
      }
      return false;
    }
    const plainText = event.clipboardData?.getData("text/plain") ?? "";
    event.preventDefault();
    getClipboardImageAsFile().then((file) => {
      const editor = editorRef.current;
      if (!editor) return;
      if (file) {
        uploadImage(file).then((src) => {
          editor.chain().focus().setImage({ src, alt: "" }).run();
        });
      } else if (plainText) {
        editor.chain().focus().insertContent(plainText).run();
      }
    });
    return true;
  };
}
function createDropHandler(editorRef) {
  return (_view, event) => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return false;
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        event.preventDefault();
        uploadImage(file).then((src) => {
          editorRef.current?.chain().focus().setImage({ src, alt: "" }).run();
        });
        return true;
      }
    }
    for (const file of Array.from(files)) {
      event.preventDefault();
      uploadAttachment(file).then((attrs) => {
        editorRef.current?.chain().focus().setFile(attrs).run();
      });
    }
    return true;
  };
}
export {
  createDropHandler,
  createPasteHandler
};
