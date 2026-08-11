const BRACKETED_PASTE_END_RE = /(?:\x1b\[201~|\x9b201~)/g;
function sanitizeForBracketedPaste(text) {
  return text.replace(BRACKETED_PASTE_END_RE, "");
}
function preparePasteText(text) {
  return sanitizeForBracketedPaste(text);
}
export {
  preparePasteText,
  sanitizeForBracketedPaste
};
