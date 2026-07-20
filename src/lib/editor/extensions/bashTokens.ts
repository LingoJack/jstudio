/**
 * Shell / Bash enrichment — a second token pass on top of highlight.js.
 *
 * highlight.js's `bash` grammar only colours ~50% of a real script: keywords,
 * strings, built-ins, variables and functions. The remaining half — operators
 * (`|`, `>`, `&&`), flags (`-rf`, `--force`), variable expansions (`$VAR`,
 * `${VAR}`, `$1`), command substitution (`$(...)`, backticks) and arithmetic —
 * is left as plain text. This module re-tokenizes ONLY the plain (uncoloured)
 * segments that lowlight produced, so it never double-colours or touches
 * strings/comments that hljs already handled.
 *
 * Output reuses the same `{ text, classes }` shape as `parseHlNodes` so the
 * caller can splice it straight back into the decoration pipeline.
 */

/** A flattened token: a run of text plus the hljs class list it carries. */
export interface FlatToken {
  text: string;
  classes: string[];
}

/**
 * Single master regex. Each alternative maps to one shell token class.
 * Alternatives are ordered longest/most-specific first so e.g. `;;` wins over
 * `;` and `&&` wins over `&`.
 */
// prettier-ignore
const SHELL_TOKEN_RE =
  /(?<varBrace>\$\{[^{}]*\})|(?<varName>\$[A-Za-z_][A-Za-z0-9_]*)|(?<varSpecial>\$[#@*?!$])|(?<subst>\$\([^()]*\)|`[^`]*`)|(?<op>\|\||\|&|&&|;;&|;;|;|\||&|>>|<<|<>|>&|2>>|2>|<&|<|>|=~|==|=|\+\+|--|\(|\)|\{|\}|\[\[|\]\]|\[|\])|(?<flag>(?<![A-Za-z0-9_-])-{1,2}[A-Za-z][A-Za-z0-9-]*)|(?<num>\b\d+\b)/g;

/** Map a regex match to the shell token class name. */
function classForMatch(m: RegExpExecArray): string {
  if (m.groups?.varBrace || m.groups?.varName || m.groups?.varSpecial) return 'hljs-sh-variable';
  if (m.groups?.subst) return 'hljs-sh-subst';
  if (m.groups?.op) return 'hljs-sh-operator';
  if (m.groups?.flag) return 'hljs-sh-flag';
  if (m.groups?.num) return 'hljs-sh-number';
  return 'hljs-sh-operator';
}

/**
 * Split a plain (uncoloured) shell segment into sub-tokens. Plain gaps between
 * matches are preserved as empty-class segments so total length is unchanged.
 */
export function enrichShellSegment(text: string): FlatToken[] {
  if (!text) return [];
  const out: FlatToken[] = [];
  let last = 0;
  SHELL_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SHELL_TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), classes: [] });
    out.push({ text: m[0], classes: [classForMatch(m)] });
    last = m.index + m[0].length;
    // Guard against zero-length matches looping forever.
    if (m[0].length === 0) SHELL_TOKEN_RE.lastIndex++;
  }
  if (last < text.length) out.push({ text: text.slice(last), classes: [] });
  return out;
}

/**
 * Enrich a list of lowlight tokens for shell content: leave any segment that
 * already carries a class untouched, and re-tokenize the plain ones.
 */
export function enrichShellTokens(tokens: FlatToken[]): FlatToken[] {
  return tokens.flatMap((t) => (t.classes.length ? [t] : enrichShellSegment(t.text)));
}
