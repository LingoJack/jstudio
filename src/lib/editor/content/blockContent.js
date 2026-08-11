function contentToString(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((seg) => seg.text).join("");
  return "";
}
export {
  contentToString
};
