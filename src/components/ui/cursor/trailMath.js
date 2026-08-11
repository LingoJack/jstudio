function firstCodePoint(s) {
  if (!s) return "";
  const cp = s.codePointAt(0);
  return cp === void 0 ? "" : String.fromCodePoint(cp);
}
function lastCodePoint(s) {
  const len = s.length;
  if (len === 0) return "";
  const last = s.charCodeAt(len - 1);
  if (len >= 2 && last >= 56320 && last <= 57343) return s.slice(len - 2);
  return s.slice(len - 1);
}
function appendSpan(parent, text) {
  const s = document.createElement("span");
  s.textContent = text;
  parent.appendChild(s);
  return s;
}
export {
  appendSpan,
  firstCodePoint,
  lastCodePoint
};
