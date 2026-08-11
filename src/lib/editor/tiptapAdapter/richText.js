function annotationsToMarks(ann) {
  const marks = [];
  if (ann.bold) marks.push({ type: "bold" });
  if (ann.italic) marks.push({ type: "italic" });
  if (ann.underline) marks.push({ type: "underline" });
  if (ann.strikethrough) marks.push({ type: "strike" });
  if (ann.code) marks.push({ type: "code" });
  if (ann.color && ann.color !== "default") {
    marks.push({ type: "textStyle", attrs: { color: ann.color } });
  }
  if (ann.href) {
    marks.push({ type: "link", attrs: { href: ann.href } });
  }
  return marks;
}
function richTextToTiptapInline(rich) {
  if (!rich || rich.length === 0) return [];
  const result = [];
  for (const seg of rich) {
    if (!seg.text) continue;
    const marks = annotationsToMarks(seg.annotations ?? {});
    const parts = seg.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) result.push({ type: "hardBreak" });
      if (part) result.push({ type: "text", text: part, marks });
    });
  }
  return result;
}
function tiptapInlineToRichText(nodes) {
  if (!nodes || nodes.length === 0) return [];
  const result = [];
  for (const node of nodes) {
    if (node.type === "text") {
      const marks = node.marks ?? [];
      result.push({ text: node.text ?? "", annotations: marksToAnnotations(marks) });
    } else if (node.type === "hardBreak") {
      result.push({ text: "\n", annotations: {} });
    }
  }
  return result;
}
function marksToAnnotations(marks) {
  const annotations = {};
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        annotations.bold = true;
        break;
      case "italic":
        annotations.italic = true;
        break;
      case "underline":
        annotations.underline = true;
        break;
      case "strike":
        annotations.strikethrough = true;
        break;
      case "code":
        annotations.code = true;
        break;
      case "textStyle": {
        const color = mark.attrs?.color;
        if (typeof color === "string") {
          annotations.color = color;
        }
        break;
      }
      case "link": {
        const href = mark.attrs?.href;
        if (typeof href === "string") {
          annotations.href = href;
        }
        break;
      }
      default:
        break;
    }
  }
  return annotations;
}
export {
  richTextToTiptapInline,
  tiptapInlineToRichText
};
