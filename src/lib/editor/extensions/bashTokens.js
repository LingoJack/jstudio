const SHELL_TOKEN_RE = /(?<varBrace>\$\{[^{}]*\})|(?<varName>\$[A-Za-z_][A-Za-z0-9_]*)|(?<varSpecial>\$[#@*?!$])|(?<subst>\$\([^()]*\)|`[^`]*`)|(?<op>\|\||\|&|&&|;;&|;;|;|\||&|>>|<<|<>|>&|2>>|2>|<&|<|>|=~|==|=|\+\+|--|\(|\)|\{|\}|\[\[|\]\]|\[|\])|(?<flag>(?<![A-Za-z0-9_-])-{1,2}[A-Za-z][A-Za-z0-9-]*)|(?<num>\b\d+\b)/g;
function classForMatch(m) {
  if (m.groups?.varBrace || m.groups?.varName || m.groups?.varSpecial) return "hljs-sh-variable";
  if (m.groups?.subst) return "hljs-sh-subst";
  if (m.groups?.op) return "hljs-sh-operator";
  if (m.groups?.flag) return "hljs-sh-flag";
  if (m.groups?.num) return "hljs-sh-number";
  return "hljs-sh-operator";
}
function enrichShellSegment(text) {
  if (!text) return [];
  const out = [];
  let last = 0;
  SHELL_TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = SHELL_TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), classes: [] });
    out.push({ text: m[0], classes: [classForMatch(m)] });
    last = m.index + m[0].length;
    if (m[0].length === 0) SHELL_TOKEN_RE.lastIndex++;
  }
  if (last < text.length) out.push({ text: text.slice(last), classes: [] });
  return out;
}
function enrichShellTokens(tokens) {
  return tokens.flatMap((t) => t.classes.length ? [t] : enrichShellSegment(t.text));
}
export {
  enrichShellSegment,
  enrichShellTokens
};
