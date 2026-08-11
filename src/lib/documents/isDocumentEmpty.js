function isDocumentEmpty(blocks) {
  if (blocks.length === 0) return true;
  if (blocks.length > 1) return false;
  const only = blocks[0];
  if (only.type !== "text") return false;
  if (typeof only.content === "string") return only.content.trim() === "";
  return only.content.every((seg) => seg.text.trim() === "");
}
export {
  isDocumentEmpty
};
